import type { AuthError } from "@supabase/supabase-js";
import { DataAccessError } from "../../../lib/supabase/data-access-error.ts";
import type { SessionClient } from "../../../lib/supabase/session-client.ts";
import type { Credentials } from "../credentials.ts";
import { userIdSchema, type User, type UserId } from "../user.ts";

export type SignUpOutcome = "signed_in" | "confirmation_sent" | "rejected";

/** The only code that talks to Supabase Auth or reads admin memberships. */
export class AuthRepository {
  readonly #client: SessionClient["client"];

  constructor(session: SessionClient) {
    this.#client = session.client;
  }

  /** The emailed confirmation link returns to the address the form came from. */
  async signUp(
    credentials: Credentials,
    appOrigin: string,
  ): Promise<SignUpOutcome> {
    const { data, error } = await this.#client.auth.signUp({
      ...credentials,
      options: { emailRedirectTo: appOrigin + "/auth/callback" },
    });
    if (error) return "rejected";
    // No session yet means the project wants the email confirmed first.
    return data.session ? "signed_in" : "confirmation_sent";
  }

  async logIn(credentials: Credentials): Promise<boolean> {
    const { error } = await this.#client.auth.signInWithPassword(credentials);
    return error === null;
  }

  /** Ends this browser's session only. Other devices stay signed in. */
  async logOut(): Promise<boolean> {
    const { error } = await this.#client.auth.signOut({ scope: "local" });
    return error === null;
  }

  /** Finishes signup from the emailed link. A link without a code is refused. */
  async confirmEmail(code: string | null): Promise<boolean> {
    if (!code) return false;
    const { error } = await this.#client.auth.exchangeCodeForSession(code);
    return error === null;
  }

  /** The verified user id in the session cookies, or null when signed out. */
  async sessionUserId(): Promise<UserId | null> {
    const { data, error } = await this.#client.auth.getClaims();
    if (!error) return userIdSchema.safeParse(data?.claims.sub).data ?? null;
    return failedIdentity(error);
  }

  /** The user a bearer token belongs to, checked with Auth, or null. */
  async userForToken(token: string): Promise<User | null> {
    const { data, error } = await this.#client.auth.getUser(token);
    if (error) return failedIdentity(error);
    const id = userIdSchema.safeParse(data.user.id);
    return id.success ? { id: id.data, email: data.user.email } : null;
  }

  /**
   * Admin is a membership row that only a database operator can insert, and
   * row level security lets a user read only their own. The session holds no
   * role claim, so removing the row works on the next request.
   */
  async isAdmin(userId: UserId): Promise<boolean> {
    const { data, error, status } = await this.#client
      .from("admin_memberships")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new DataAccessError(error.code, status);
    return data !== null;
  }
}

/** An unavailable identity provider should offer a retry, even on a page read. */
function failedIdentity(error: AuthError): null {
  if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)
    throw new DataAccessError("auth_unavailable", 503);
  return null;
}
