// Where the tests and maintenance scripts find the app and its local Supabase
// stack. Nothing here names a port, container or key: the Supabase CLI reports
// the stack it manages for this directory, and the app origin comes from the
// same configuration the app reads.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isLoopbackHost, parseAppConfig, webUrl } from "../../lib/env.ts";

export const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

const cli = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

/**
 * Runs the project's pinned Supabase CLI and returns what it printed. Its
 * progress messages are shown only if the command fails.
 */
export function supabase(
  args: readonly string[],
  env: Record<string, string> = {},
) {
  return execFileSync(cli, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const statusSchema = z.object({
  API_URL: webUrl,
  PUBLISHABLE_KEY: z.string().min(1),
  SECRET_KEY: z.string().min(1),
  MAILPIT_URL: webUrl.optional(),
});
export type LocalStack = {
  apiUrl: string;
  publishableKey: string;
  /** Operator key of the local stack. Tests use it; the app never receives it. */
  secretKey: string;
  mailboxUrl?: string;
  appOrigin: string;
};

function loopback(name: string, address: string) {
  // These tools create accounts, seed rows and stop services. They may only
  // ever do that to a stack on this machine.
  if (!isLoopbackHost(new URL(address).hostname))
    throw new Error(`${name} must be a loopback address for local tests`);
  return address;
}

function discover(): LocalStack {
  // Shell variables win, then .env.local: the same precedence Next.js applies.
  const envFile = join(projectRoot, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const status = statusSchema.parse(
    JSON.parse(supabase(["status", "-o", "json"])),
  );
  const app = parseAppConfig(process.env);
  if (
    new URL(app.supabaseUrl).origin !== new URL(status.API_URL).origin ||
    app.publishableKey !== status.PUBLISHABLE_KEY
  )
    throw new Error(
      "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY differs from the local stack that `npx supabase status` reports. Update .env.local so the app and the tests use the same stack.",
    );
  return {
    apiUrl: loopback("The Supabase API", status.API_URL),
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
    appOrigin: loopback("APP_ORIGIN", app.origin),
    ...(status.MAILPIT_URL
      ? { mailboxUrl: loopback("The mailbox", status.MAILPIT_URL) }
      : {}),
  };
}

// Discovery asks the CLI, which takes a couple of seconds: once per process.
let stack: LocalStack | undefined;
export function localStack(): LocalStack {
  stack ??= discover();
  return stack;
}

/** The project id of the stack a developer uses day to day. */
export function everydayProjectId() {
  const id = /^project_id\s*=\s*"([^"]+)"/m.exec(
    readFileSync(join(projectRoot, "supabase", "config.toml"), "utf8"),
  )?.[1];
  if (!id) throw new Error("supabase/config.toml has no project_id");
  return id;
}

/**
 * Guards scripts that reset a database, stop a service or load it heavily.
 * They run only when SUPABASE_PROJECT_ID selects a stack other than the
 * everyday one, which is what `npm run isolated` does.
 */
export function requireDisposableStack(purpose: string) {
  const selected = process.env.SUPABASE_PROJECT_ID;
  if (!selected || selected === everydayProjectId())
    throw new Error(
      `${purpose} only runs on a disposable stack. Use: npm run isolated -- <command>`,
    );
  return selected;
}

/** Runs a command in the project directory, sharing this terminal. */
export function run(
  command: string,
  args: readonly string[],
  env: Record<string, string> = {},
) {
  const { status, error } = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
    // npm and npx are batch files on Windows and need a shell to start.
    shell: process.platform === "win32",
  });
  if (error) throw error;
  return status ?? 1;
}
