import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { appConfig } from "@/lib/env";

/**
 * A Supabase client that carries one caller's session. PostgreSQL sees that
 * caller, so row level security decides what each query may read or write.
 * The app only ever uses the publishable key. It never holds the secret key.
 */
class CallerSession {
  readonly #client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.#client = client;
  }

  get client() {
    return this.#client;
  }
}

// Only this module can construct one, using credentials from the current request.
export type SessionClient = CallerSession;

// Interactive requests should release the connection and allow a user retry
// when the database API is unavailable. Booking retries reuse the same key.
const databaseRequests = { timeout: 5_000, retry: false };

/**
 * For Route Handlers. Reads the session from the request cookies and can
 * write a refreshed session onto the response.
 */
export async function cookieSessionClient(): Promise<SessionClient> {
  const store = await cookies();
  const { supabaseUrl, publishableKey, cookieOptions } = appConfig();
  return new CallerSession(
    createServerClient<Database>(supabaseUrl, publishableKey, {
      db: databaseRequests,
      cookieOptions,
      cookies: {
        getAll: () => store.getAll(),
        setAll(changes) {
          for (const { name, value, options } of changes)
            store.set(name, value, options);
        },
      },
    }),
  );
}

/**
 * For server-rendered pages, which cannot write cookies. Uses the bearer
 * token that proxy.ts took from the session cookie for this one request.
 */
export async function pageSession() {
  const authorization = (await headers()).get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const { supabaseUrl, publishableKey } = appConfig();
  const client = createClient<Database>(supabaseUrl, publishableKey, {
    db: databaseRequests,
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    session: new CallerSession(client),
    token: authorization.slice("Bearer ".length),
  };
}
