// Two sign-in behaviours depend on Auth settings the everyday profile does
// not use: an access token that expires mid-session, and signup that waits
// for an emailed confirmation link. This restarts the selected local stack
// with each setting, runs the matching browser test, and puts the stack back.
// Data is kept: the stack is stopped and started, never reset.
import { run } from "../tests/support/stack.ts";

type Profile = {
  name: string;
  /** Supabase CLI overrides for supabase/config.toml, for this start only. */
  auth: Record<string, string>;
  /** Tells the matching test that its profile is active. */
  enable: Record<string, string>;
  tests: readonly string[];
};
const profiles: readonly Profile[] = [
  {
    name: "access tokens that expire after 90 seconds",
    auth: { SUPABASE_AUTH_JWT_EXPIRY: "90" },
    enable: { TEST_SHORT_JWT: "1" },
    tests: ["auth.spec.ts", "-g", "renews an expired token"],
  },
  {
    name: "signup that requires email confirmation",
    auth: { SUPABASE_AUTH_EMAIL_ENABLE_CONFIRMATIONS: "true" },
    enable: { TEST_CONFIRM_EMAIL: "1" },
    tests: ["confirmation.spec.ts"],
  },
];

function restart(auth: Record<string, string> = {}) {
  const stopped = run("npm", ["run", "--silent", "db:stop"]);
  const started = run("npm", ["run", "--silent", "db:start"], auth);
  if (stopped !== 0 || started !== 0)
    throw new Error("Unable to restart the local Supabase stack");
}

let failures = 0;
try {
  for (const profile of profiles) {
    console.log(`\nAuth profile: ${profile.name}`);
    restart(profile.auth);
    failures += run(
      "npx",
      ["--no-install", "playwright", "test", ...profile.tests],
      profile.enable,
    );
  }
} finally {
  console.log("\nRestoring the everyday Auth profile");
  restart();
}
process.exitCode = failures === 0 ? 0 : 1;
