// Exercises the production Next.js server, Auth and PostgreSQL on a
// disposable loopback stack: npm run isolated -- npm run test:load
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  consultationPageSchema,
  consultationSchema,
} from "../features/consultations/contracts.ts";
import { pageSize } from "../features/consultations/policy.ts";
import { entityTag } from "../features/consultations/revision.ts";
import {
  deleteAccount,
  findUserId,
  operatorClient,
} from "../tests/support/operator.ts";
import { localStack, requireDisposableStack } from "../tests/support/stack.ts";

// The workload. Changing any of these changes what the numbers mean, so the
// verification report quotes them next to its results.
const studentCount = 8;
const seededRowsPerStudent = 2000;
const rampStages = [4, 16, 48, 96];
const sustained = { clients: 64, durationMs: 60_000 };
const minimumJourneysPerClient = 5;
const sameBookingWriters = 64;
// A page three quarters of the way through each student's seeded schedule.
const deepPage = Math.ceil((seededRowsPerStudent * 0.75) / pageSize);
// The Auth client renews a token this close to its expiry. A lifetime near
// this margin would measure token rotation instead of the booking workload.
const shortestUsefulTokenSeconds = 600;

requireDisposableStack("The load test");
const { appOrigin, apiUrl, publishableKey } = localStack();
const api = "/api/consultations";
const day = 86_400_000;
const p95Budget = Number(process.env.LOAD_P95_BUDGET_MS ?? 0);
assert.ok(Number.isFinite(p95Budget) && p95Budget >= 0, "Invalid p95 budget");

type Student = {
  name: string;
  email: string;
  id: string;
  client: APIRequestContext;
};
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Stage = {
  concurrency: number;
  journeys: number;
  requests: number;
  seconds: number;
  requestsPerSecond: number;
  p50ms: number;
  p95ms: number;
  p99ms: number;
  throttledCreates: number;
  failedJourneys: number;
  p95ByOperation: Record<string, number>;
  errors: Record<string, number>;
};
const students: Student[] = [];
const emails: string[] = [];
const stats: Stage[] = [];
const run = randomUUID();

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error("Missing " + what);
  return value;
}

async function assertBenchmarkAuthProfile() {
  const email = `load-${run}-profile@example.test`;
  emails.push(email);
  const visitor = createClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await visitor.auth.signUp({
    email,
    password: randomUUID(),
  });
  assert.ok(!error, "Local Auth is not reachable");
  assert.ok(
    data.session && data.session.expires_in >= shortestUsefulTokenSeconds,
    "Restore the everyday local Auth profile (immediate signup, long-lived tokens) before benchmarking",
  );
}

async function prepareStudent(index: number) {
  const name = `load-${run}-${index}`;
  const email = name + "@example.test";
  emails.push(email);
  const client = await request.newContext({
    baseURL: appOrigin,
    extraHTTPHeaders: { Origin: appOrigin },
    timeout: 15_000,
  });
  const signup = await client.post("/api/auth/signup", {
    form: { email, password: randomUUID() },
    maxRedirects: 0,
  });
  assert.equal(
    signup.headers().location,
    "/dashboard",
    "Expected the local immediate-signup profile",
  );
  await signup.dispose();
  const id = await findUserId(email);
  assert.ok(id, "The app and this script must use the same local stack");
  students.push({ name, email, id, client });

  // An existing schedule, so list queries page through realistic history.
  const firstSeed = Date.now() + 365 * day;
  const { error } = await operatorClient()
    .from("consultations")
    .insert(
      Array.from({ length: seededRowsPerStudent }, (_, row) => ({
        student_id: id,
        first_name: name,
        last_name: "Synthetic",
        reason: "Scheduled study",
        scheduled_at: new Date(firstSeed + row * 1000).toISOString(),
      })),
    );
  assert.ok(!error, "Unable to seed the student's schedule");
}

async function seededRows(student: Student) {
  const { count, error } = await operatorClient()
    .from("consultations")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id);
  assert.ok(!error, "Unable to count the student's schedule");
  return count;
}

function percentile(sorted: readonly number[], p: number) {
  return Math.round(sorted[Math.ceil(sorted.length * p) - 1] ?? 0);
}

async function phase(concurrency: number, durationMs = 0) {
  let journeys = 0;
  let throttledCreates = 0;
  const latency: number[] = [];
  const byOperation = new Map<string, number[]>();
  const errors = new Map<string, number>();
  const started = performance.now();

  // One timed request. Returns the parsed JSON body of a 200 or 201, and the
  // entity tag of any response that carries one.
  async function call(
    student: Student,
    operation: string,
    method: Method,
    url: string,
    expected: number,
    send: { data?: object; tag?: string } = {},
  ): Promise<{ body: unknown; tag: string | undefined; throttled?: true }> {
    const before = performance.now();
    const response = await student.client.fetch(url, {
      method,
      maxRedirects: 0,
      ...(send.data ? { data: send.data } : {}),
      ...(send.tag ? { headers: { "If-Match": send.tag } } : {}),
    });
    try {
      if (operation === "book" && response.status() === 429) {
        throttledCreates++;
        return { body: null, tag: undefined, throttled: true };
      }
      assert.equal(
        response.status(),
        expected,
        `${operation} returned ${response.status()}`,
      );
      const body: unknown =
        expected === 200 || expected === 201 ? await response.json() : null;
      return { body, tag: response.headers().etag };
    } finally {
      const ms = performance.now() - before;
      latency.push(ms);
      const times = byOperation.get(operation) ?? [];
      times.push(ms);
      byOperation.set(operation, times);
      await response.dispose();
    }
  }

  async function journey(student: Student) {
    const body = {
      request_id: randomUUID(),
      first_name: student.name,
      last_name: "Test",
      reason: "Revision",
      scheduled_at: new Date(Date.now() + 7 * day).toISOString(),
    };
    const booked = await call(student, "book", "POST", api, 201, {
      data: body,
    });
    if (booked.throttled) return;
    const booking = consultationSchema.parse(booked.body);
    const item = `${api}/${booking.id}`;
    const retry = await call(student, "retry", "POST", api, 200, {
      data: body,
    });
    assert.equal(consultationSchema.parse(retry.body).id, booking.id);
    const rescheduled = new Date(Date.now() + 8 * day).toISOString();
    const moved = await call(student, "reschedule", "PATCH", item, 204, {
      data: { scheduled_at: rescheduled },
      tag: entityTag(booking.version),
    });
    const completed = await call(student, "complete", "PATCH", item, 204, {
      data: { completed: true },
      tag: required(moved.tag, "revision after rescheduling"),
    });
    const first = consultationPageSchema.parse(
      (await call(student, "list", "GET", api, 200)).body,
    );
    const deep = consultationPageSchema.parse(
      (
        await call(
          student,
          `page${deepPage}`,
          "GET",
          `${api}?page=${deepPage}`,
          200,
        )
      ).body,
    );
    assert.equal(deep.items.length, pageSize);
    assert.ok(
      [...first.items, ...deep.items].every(
        (row) => row.first_name === student.name,
      ),
      "Incorrect owner",
    );
    const saved = first.items.find((row) => row.id === booking.id);
    assert.ok(
      saved?.completed &&
        Date.parse(saved.scheduled_at) === Date.parse(rescheduled),
      "Incorrect saved state",
    );
    await call(student, "cancel", "DELETE", item, 204, {
      tag: required(completed.tag, "revision after completion"),
    });
    await call(student, "lateRetry", "POST", api, 409, { data: body });
  }

  await Promise.all(
    Array.from({ length: concurrency }, async (_, lane) => {
      const student = required(
        students[lane % students.length],
        "a prepared student",
      );
      for (
        let iteration = 0;
        iteration < minimumJourneysPerClient ||
        performance.now() - started < durationMs;
        iteration++
      ) {
        journeys++;
        try {
          await journey(student);
        } catch (error) {
          // The first line only: Playwright's request log can hold session cookies.
          const [message = "Unknown failure"] = String(error).split("\n");
          errors.set(message, 1 + (errors.get(message) ?? 0));
        }
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  latency.sort((a, b) => a - b);
  const result: Stage = {
    concurrency,
    journeys,
    requests: latency.length,
    seconds: Number(seconds.toFixed(2)),
    requestsPerSecond: Math.round(latency.length / seconds),
    p50ms: percentile(latency, 0.5),
    p95ms: percentile(latency, 0.95),
    p99ms: percentile(latency, 0.99),
    throttledCreates,
    failedJourneys: [...errors.values()].reduce((a, b) => a + b, 0),
    p95ByOperation: Object.fromEntries(
      [...byOperation].map(([operation, times]) => [
        operation,
        percentile(
          times.sort((a, b) => a - b),
          0.95,
        ),
      ]),
    ),
    errors: Object.fromEntries(errors),
  };
  console.log(JSON.stringify(result));
  stats.push(result);
  assert.equal(
    result.failedJourneys,
    0,
    "Load stage failed; see error counts above",
  );
}

// Independent journeys measure throughput. This probe deliberately contends on one row.
async function raceOneBooking({ client, name }: Student, writers: number) {
  const start = Date.now() + 7 * day;
  const created = await client.post(api, {
    data: {
      request_id: randomUUID(),
      first_name: name,
      last_name: "Race",
      reason: "Concurrent reschedules",
      scheduled_at: new Date(start).toISOString(),
    },
  });
  assert.equal(created.status(), 201);
  const { id, version } = consultationSchema.parse(await created.json());
  await created.dispose();
  const url = `${api}/${id}`;
  const attempts = await Promise.all(
    Array.from({ length: writers }, async (_, index) => {
      const time = start + (index + 1) * 60_000;
      const response = await client.patch(url, {
        headers: { "If-Match": entityTag(version) },
        data: { scheduled_at: new Date(time).toISOString() },
      });
      const result = {
        status: response.status(),
        time,
        tag: response.headers().etag,
      };
      await response.dispose();
      return result;
    }),
  );
  const wins = attempts.filter((attempt) => attempt.status === 204);
  assert.equal(wins.length, 1, "Exactly one reschedule must commit");
  const winner = required(wins[0], "the winning reschedule");
  assert.equal(
    attempts.filter((attempt) => attempt.status === 412).length,
    writers - 1,
    "Every other reschedule must be declined as stale",
  );
  const list = await client.get(api);
  const saved = consultationPageSchema
    .parse(await list.json())
    .items.find((row) => row.id === id);
  await list.dispose();
  assert.ok(saved, "The contended booking must still exist");
  assert.equal(Date.parse(saved.scheduled_at), winner.time);
  assert.equal(entityTag(saved.version), winner.tag);
  const cancelled = await client.delete(url, {
    headers: { "If-Match": entityTag(saved.version) },
  });
  assert.equal(cancelled.status(), 204);
  await cancelled.dispose();
  console.log(
    `Same booking: ${writers} simultaneous reschedules, 1 committed, ${writers - 1} stale, winning time and revision verified.`,
  );
}

try {
  await assertBenchmarkAuthProfile();
  for (let index = 0; index < studentCount; index++)
    await prepareStudent(index);
  await raceOneBooking(
    required(students[0], "a prepared student"),
    sameBookingWriters,
  );
  for (const concurrency of rampStages) await phase(concurrency);
  await phase(sustained.clients, sustained.durationMs);
  for (const student of students)
    assert.equal(
      await seededRows(student),
      seededRowsPerStudent,
      "Unexpected final database state",
    );
  console.log(
    `Verified ${stats.reduce((sum, stage) => sum + stage.requests, 0)} timed requests and final database counts.`,
  );
  if (p95Budget) {
    const slow = stats
      .filter((stage) => stage.p95ms > p95Budget)
      .map((stage) => `${stage.concurrency} clients: ${stage.p95ms} ms`);
    assert.equal(
      slow.length,
      0,
      `Local p95 budget ${p95Budget} ms exceeded at ${slow.join(", ")}`,
    );
  }
} finally {
  for (const { client } of students) await client.dispose();
  for (const email of emails) await deleteAccount(email);
}
