import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DataAccessError } from "../../../lib/supabase/data-access-error.ts";
import { failureResponse } from "../../../lib/http/failure.ts";
import { Refusal } from "../../../lib/http/problem.ts";
import { consultationSchema, revisionSchema } from "../contracts.ts";
import {
  bookResponse,
  cancelResponse,
  changeResponse,
  readBookingVersion,
} from "./consultation-http.ts";

// Each use-case outcome has exactly one HTTP answer. These tests pin the
// status, the message and the ETag, which together are the API's contract.

const consultation = consultationSchema.parse({
  id: randomUUID(),
  version: randomUUID(),
  first_name: "Ada",
  last_name: "Lovelace",
  reason: "Exam preparation",
  scheduled_at: "2030-03-04T05:00:00.000Z",
  completed: false,
});
const tag = `"${consultation.version}"`;

async function summary(response: Response) {
  const text = await response.text();
  const body: unknown = text === "" ? null : JSON.parse(text);
  return { status: response.status, etag: response.headers.get("ETag"), body };
}

const notFound = {
  status: 404,
  etag: null,
  body: { error: "Consultation not found." },
};
const changedSinceRead = {
  status: 412,
  etag: null,
  body: {
    error:
      "This consultation changed since you opened it. Reload the booking and review the latest details.",
  },
};

test("booking outcomes map to 201, 200, 409 and 400", async () => {
  assert.deepEqual(
    await summary(bookResponse({ kind: "booked", consultation })),
    {
      status: 201,
      etag: tag,
      body: consultation,
    },
  );
  assert.deepEqual(
    await summary(bookResponse({ kind: "already_booked", consultation })),
    { status: 200, etag: tag, body: consultation },
  );
  assert.deepEqual(await summary(bookResponse({ kind: "request_id_spent" })), {
    status: 409,
    etag: null,
    body: { error: "This booking reference has already been used." },
  });
  assert.deepEqual(await summary(bookResponse({ kind: "request_id_reused" })), {
    status: 409,
    etag: null,
    body: {
      error: "This booking reference was already used for different details.",
    },
  });
  assert.deepEqual(await summary(bookResponse({ kind: "rejected" })), {
    status: 400,
    etag: null,
    body: { error: "Check the details and choose a future time." },
  });
});

test("change outcomes map to 204 with the new ETag, 404, 412 and 400", async () => {
  const revision = revisionSchema.parse(randomUUID());
  assert.deepEqual(
    await summary(changeResponse({ kind: "changed", revision })),
    {
      status: 204,
      etag: `"${revision}"`,
      body: null,
    },
  );
  assert.deepEqual(
    await summary(changeResponse({ kind: "not_found" })),
    notFound,
  );
  assert.deepEqual(
    await summary(changeResponse({ kind: "changed_since_read" })),
    changedSinceRead,
  );
  assert.deepEqual(
    await summary(changeResponse({ kind: "time_not_in_future" })),
    {
      status: 400,
      etag: null,
      body: { error: "Choose a future time." },
    },
  );
});

test("cancel outcomes map to 204 without an ETag, 404 and 412", async () => {
  assert.deepEqual(await summary(cancelResponse({ kind: "cancelled" })), {
    status: 204,
    etag: null,
    body: null,
  });
  assert.deepEqual(
    await summary(cancelResponse({ kind: "not_found" })),
    notFound,
  );
  assert.deepEqual(
    await summary(cancelResponse({ kind: "changed_since_read" })),
    changedSinceRead,
  );
});

const request = (ifMatch?: string) =>
  new Request("http://localhost", {
    method: "PATCH",
    headers: ifMatch === undefined ? {} : { "If-Match": ifMatch },
  });

test("a write must name a booking id and one quoted revision, checked in that order", () => {
  const refusal = (status: number) => (error: unknown) =>
    error instanceof Refusal && error.status === status;
  // An id that cannot exist is "not found" before the revision is looked at.
  assert.throws(() => readBookingVersion(request(), "42"), refusal(404));
  assert.throws(
    () => readBookingVersion(request(), consultation.id),
    refusal(428),
  );
  for (const malformed of [
    "*",
    consultation.version,
    `W/${tag}`,
    `${tag}, ${tag}`,
  ])
    assert.throws(
      () => readBookingVersion(request(malformed), consultation.id),
      refusal(400),
      malformed,
    );
  assert.deepEqual(readBookingVersion(request(tag), consultation.id), {
    id: consultation.id,
    revision: consultation.version,
  });
});

test("thrown errors become one response shape and never leak details", async (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  const refused = failureResponse(new Refusal(401, "Please log in."));
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "Please log in." });

  const cases: [unknown, number][] = [
    [new DataAccessError("", 503), 503],
    [new DataAccessError("", 0), 503],
    [new DataAccessError("PGRST301", 500), 500],
    [new DataAccessError("unexpected_database_shape"), 500],
    [new Error("secret detail"), 500],
  ];
  for (const [error, status] of cases) {
    const response = failureResponse(error);
    assert.equal(response.status, status);
    const reference = response.headers.get("X-Request-Id");
    assert.deepEqual(await response.json(), {
      error: `Unable to complete the request. Reference ${String(reference)}`,
    });
  }
  assert.equal(logged.mock.callCount(), cases.length);
});
