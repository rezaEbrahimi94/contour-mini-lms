import type { CookieOptionsWithName } from "@supabase/ssr";
import { z } from "zod";

// Deployment configuration. All three values are read on the server when it
// starts (instrumentation.ts), so a missing or malformed value stops the
// server with a message naming the variable, and one build runs in any
// environment. The browser never talks to Supabase directly, so nothing here
// needs a NEXT_PUBLIC_ prefix.
// Any host is allowed, including an IP address or a container name.
export const webUrl = z.url({ protocol: /^https?$/ });
const envSchema = z.object({
  SUPABASE_URL: webUrl,
  SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
  APP_ORIGIN: webUrl,
});

const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
export const isLoopbackHost = (hostname: string) =>
  loopbackHosts.includes(hostname);

export type AppConfig = {
  supabaseUrl: string;
  publishableKey: string;
  /** The address this deployment is published at. */
  origin: string;
  /** Origins a state-changing request may come from. */
  trustedOrigins: readonly string[];
  cookieOptions: CookieOptionsWithName;
};

export function parseAppConfig(
  source: Record<string, string | undefined>,
): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Name the variables only. Values may be credentials.
    const names = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Missing or invalid configuration: ${names.join(", ")}. Copy .env.example to .env.local for local development.`,
    );
  }
  const app = new URL(parsed.data.APP_ORIGIN);
  const explicitDefault =
    app.origin + (app.protocol === "https:" ? ":443" : ":80");
  if (
    parsed.data.APP_ORIGIN !== app.origin &&
    (app.port !== "" || parsed.data.APP_ORIGIN !== explicitDefault)
  )
    throw new Error(
      "APP_ORIGIN must be an origin with no path or trailing slash, such as https://portal.example",
    );
  if (app.protocol !== "https:" && !isLoopbackHost(app.hostname))
    throw new Error("APP_ORIGIN must use HTTPS outside localhost");
  const backend = new URL(parsed.data.SUPABASE_URL);
  if (
    backend.protocol !== "https:" &&
    !(isLoopbackHost(app.hostname) && isLoopbackHost(backend.hostname))
  )
    throw new Error(
      "SUPABASE_URL must use HTTPS except for local loopback development",
    );
  // On a developer's machine localhost, 127.0.0.1 and [::1] all reach this
  // one server on this one port, and a browser treats each as its own origin.
  // Accept all three there, so the app works under whichever name was typed.
  // A hosted deployment trusts exactly its configured origin.
  const trustedOrigins = isLoopbackHost(app.hostname)
    ? loopbackHosts.map((hostname) => {
        const alias = new URL(app.origin);
        alias.hostname = hostname;
        return alias.origin;
      })
    : [app.origin];
  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    publishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    origin: app.origin,
    trustedOrigins,
    cookieOptions: {
      httpOnly: true,
      secure: app.protocol === "https:",
      sameSite: "lax",
      path: "/",
    },
  };
}

let config: AppConfig | undefined;
export function appConfig(): AppConfig {
  config ??= parseAppConfig(process.env);
  return config;
}
