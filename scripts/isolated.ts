// Runs a command against a second, disposable copy of the local stack, so
// load, outage and upgrade tests never touch the database a developer uses
// day to day. It has its own project id, its own ports and its own app port.
//
//   npm run isolated -- up              start the disposable stack and migrate it
//   npm run isolated -- serve           serve the production build against it
//   npm run isolated -- <any command>   for example: npm run test:load
//   npm run isolated -- down            stop it and delete its data
import { everydayProjectId, run } from "../tests/support/stack.ts";

function port(variable: string, fallback: number) {
  const value = Number(process.env[variable] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65_535)
    throw new Error(`${variable} must be a port number`);
  return value;
}
// Supabase's local defaults start at 54320. The disposable stack sits one
// thousand above, in the same order, unless the ports are taken on this machine.
const base = port("ISOLATED_SUPABASE_PORT_BASE", 55_320);
const appPort = port("ISOLATED_APP_PORT", 3100);
const host = "127.0.0.1";

const environment = {
  SUPABASE_PROJECT_ID: `${everydayProjectId()}-isolated`,
  SUPABASE_DB_SHADOW_PORT: String(base),
  SUPABASE_API_PORT: String(base + 1),
  SUPABASE_DB_PORT: String(base + 2),
  SUPABASE_LOCAL_SMTP_PORT: String(base + 4),
  SUPABASE_URL: `http://${host}:${base + 1}`,
  APP_ORIGIN: `http://${host}:${appPort}`,
};

const [command, ...args] = process.argv.slice(2);
const shortcuts: Record<string, readonly [string, ...string[]]> = {
  up: ["npm", "run", "db:start"],
  down: ["npx", "--no-install", "supabase", "stop", "--no-backup"],
  serve: ["npm", "start", "--", "--hostname", host, "--port", String(appPort)],
};
if (command === undefined)
  throw new Error("Usage: npm run isolated -- up | serve | down | <command>");
const [program, ...programArgs] = shortcuts[command] ?? [command];
process.exitCode = run(program, [...programArgs, ...args], environment);
