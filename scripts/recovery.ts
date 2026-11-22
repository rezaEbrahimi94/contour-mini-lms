// Stops the database API underneath a running production server and checks
// that students get prompt, safe errors and lose nothing once it returns.
// It stops a container, so it only runs on the disposable stack:
//   npm run isolated -- npm run test:recovery
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { request } from "@playwright/test";
import {
  consultationPageSchema,
  consultationSchema,
} from "../features/consultations/contracts.ts";
import { deleteAccount, findUserId } from "../tests/support/operator.ts";
import { localStack, requireDisposableStack } from "../tests/support/stack.ts";

const project = requireDisposableStack("The outage test");
const { appOrigin } = localStack();

// The Supabase CLI labels every container with the project it belongs to.
const [service, ...others] = execFileSync(
  "docker",
  [
    "ps",
    "--filter",
    `label=com.supabase.cli.project=${project}`,
    "--filter",
    "name=supabase_rest_",
    "--format",
    "{{.Names}}",
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
if (!service || others.length > 0)
  throw new Error(`Expected one running database API container in ${project}`);
const docker = (...args: string[]) => {
  execFileSync("docker", args, { stdio: "ignore" });
};

// Database calls give up after five seconds (lib/supabase/session-client.ts). Four
// concurrent failures should all return within a small multiple of that.
const promptMs = 15_000;
const email = `recovery-${randomUUID()}@example.test`;
const api = "/api/consultations";
const client = await request.newContext({
  baseURL: appOrigin,
  extraHTTPHeaders: { Origin: appOrigin },
  timeout: 30_000,
});
const booking = {
  request_id: randomUUID(),
  first_name: "Recovery",
  last_name: "Test",
  reason: "Study",
  scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
};
const schedule = async () => {
  const response = await client.get(api);
  assert.equal(response.status(), 200);
  return consultationPageSchema.parse(await response.json()).items;
};
function header(headers: Record<string, string>, name: string) {
  const value = headers[name];
  assert.ok(value, `Missing ${name} header`);
  return value;
}

let stopped = false;
try {
  const signup = await client.post("/api/auth/signup", {
    form: { email, password: randomUUID() },
    maxRedirects: 0,
  });
  assert.equal(signup.headers().location, "/dashboard");
  assert.ok(
    await findUserId(email),
    "The app and this script must use the same disposable stack",
  );
  assert.deepEqual(await schedule(), []);
  const existing = await client.post(api, {
    data: { ...booking, request_id: randomUUID() },
  });
  assert.equal(existing.status(), 201);
  const saved = consultationSchema.parse(await existing.json());
  const item = `${api}/${saved.id}`;
  const headers = { "If-Match": header(existing.headers(), "etag") };
  const edit = { headers, data: { completed: true } };

  docker("stop", "--time", "3", service);
  stopped = true;
  const started = performance.now();
  for (const response of await Promise.all([
    client.get(api),
    client.post(api, { data: booking }),
    client.patch(item, edit),
    client.delete(item, { headers }),
  ])) {
    assert.equal(response.status(), 503);
    assert.equal(response.headers()["cache-control"], "private, no-store");
    const reference = header(response.headers(), "x-request-id");
    assert.match(reference, /^[\da-f-]{36}$/);
    // The student sees a reference to quote and nothing about the failure.
    assert.deepEqual(await response.json(), {
      error: "Unable to complete the request. Reference " + reference,
    });
  }
  const elapsed = Math.round(performance.now() - started);
  assert.ok(
    elapsed < promptMs,
    "Unavailable reads and writes must return promptly",
  );
  console.log(`Four concurrent unavailable operations took ${elapsed} ms.`);

  docker("start", service);
  stopped = false;
  let recovered = false;
  for (let attempt = 0; attempt < 30 && !recovered; attempt++) {
    recovered = (await client.get(api)).status() === 200;
    if (!recovered) await wait(500);
  }
  assert.ok(recovered, "The same session must work again after recovery");
  // Nothing sent during the outage was applied.
  const [unchanged, ...extra] = await schedule();
  assert.equal(extra.length, 0);
  assert.equal(unchanged?.version, saved.version);
  assert.equal(unchanged.completed, false);
  const completed = await client.patch(item, edit);
  assert.equal(completed.status(), 204);
  assert.equal(
    (
      await client.delete(item, {
        headers: { "If-Match": header(completed.headers(), "etag") },
      })
    ).status(),
    204,
  );
  // The booking attempted during the outage can be retried with its key.
  assert.equal((await client.post(api, { data: booking })).status(), 201);
  assert.equal((await client.post(api, { data: booking })).status(), 200);
  assert.equal((await schedule()).length, 1);
  console.log(
    "Verified unavailable reads and writes, safe error references, same-session recovery and exactly one booking after retry.",
  );
} catch (error) {
  // Playwright's detailed request log can contain session cookies.
  const [summary = "Outage test failed"] = String(error).split("\n");
  throw new Error(summary);
} finally {
  if (stopped) docker("start", service);
  await client.dispose();
  await deleteAccount(email);
}
