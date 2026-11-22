import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAppConfig } from "./env.ts";

const local = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  APP_ORIGIN: "http://127.0.0.1:3000",
};

test("local configuration is accepted without secure cookies", () => {
  const config = parseAppConfig(local);
  assert.equal(config.origin, "http://127.0.0.1:3000");
  assert.equal(config.cookieOptions.secure, false);
  assert.equal(config.cookieOptions.httpOnly, true);
  // The same server and port under each loopback name, and nothing else.
  assert.deepEqual(config.trustedOrigins, [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]);
});
test("a hosted origin gets secure cookies", () => {
  const config = parseAppConfig({
    ...local,
    SUPABASE_URL: "https://project.supabase.co",
    APP_ORIGIN: "https://portal.example",
  });
  assert.equal(config.origin, "https://portal.example");
  assert.equal(config.cookieOptions.secure, true);
  assert.deepEqual(config.trustedOrigins, ["https://portal.example"]);
});
test("missing and malformed values are named without printing them", () => {
  assert.throws(
    () =>
      parseAppConfig({
        SUPABASE_URL: "not a url",
        SUPABASE_PUBLISHABLE_KEY: "secret-looking-value",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /SUPABASE_URL/);
      assert.match(error.message, /APP_ORIGIN/);
      assert.match(error.message, /SUPABASE_PUBLISHABLE_KEY/);
      assert.doesNotMatch(error.message, /not a url|secret-looking-value/);
      return true;
    },
  );
});
test("the app origin must be a bare origin, on HTTPS unless local", () => {
  for (const APP_ORIGIN of [
    "http://127.0.0.1:3000/",
    "https://portal.example/app",
    "http://portal.example",
    "ftp://portal.example",
  ])
    assert.throws(() => parseAppConfig({ ...local, APP_ORIGIN }), APP_ORIGIN);
});

test("loopback aliases use browser origins at default HTTP and HTTPS ports", () => {
  for (const [scheme, port] of [
    ["http", "80"],
    ["https", "443"],
  ] as const) {
    for (const suffix of ["", ":" + port]) {
      const config = parseAppConfig({
        ...local,
        APP_ORIGIN: scheme + "://localhost" + suffix,
      });
      assert.equal(config.origin, scheme + "://localhost");
      assert.deepEqual(
        config.trustedOrigins,
        ["localhost", "127.0.0.1", "[::1]"].map(
          (host) => scheme + "://" + host,
        ),
      );
      assert.ok(!config.trustedOrigins.includes(scheme + "://localhost:3000"));
    }
  }
});

test("the server rejects secret keys and legacy JWT keys at startup", () => {
  for (const key of [
    "sb_secret_example",
    "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "sb_publishable_",
  ]) {
    assert.throws(
      () => parseAppConfig({ ...local, SUPABASE_PUBLISHABLE_KEY: key }),
      /SUPABASE_PUBLISHABLE_KEY/,
    );
  }
});

test("only a local app may use a loopback HTTP backend", () => {
  assert.throws(
    () => parseAppConfig({ ...local, APP_ORIGIN: "https://school.example" }),
    /SUPABASE_URL/,
  );
  assert.throws(
    () => parseAppConfig({ ...local, SUPABASE_URL: "http://public.example" }),
    /SUPABASE_URL/,
  );
});
