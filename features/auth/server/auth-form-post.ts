import "server-only";
import type { z } from "zod";
import { readForm } from "@/lib/http/body";
import { failureResponse } from "@/lib/http/failure";
import { trustedAppOrigin } from "@/lib/http/origin";
import { cookieSessionClient } from "@/lib/supabase/session-client";
import type { Credentials } from "../credentials";
import { AuthRepository, type SignUpOutcome } from "./auth-repository";

// Login, signup and logout are plain HTML form posts, so they work before any
// JavaScript loads. The answer is a redirect to the next page, not JSON.

const privately = { "Cache-Control": "private, no-store" };

/**
 * The chain every auth form post goes through, in this order:
 *
 * 1. Origin. The form must come from one of this app's own pages.
 * 2. Session client. Signing in or out writes the session cookies through it.
 * 3. Handler. The route reads the form and calls one repository method.
 */
export async function authFormPost(
  request: Request,
  handle: (post: { auth: AuthRepository; origin: string }) => Promise<Response>,
): Promise<Response> {
  const origin = trustedAppOrigin(request);
  // A person reads this refusal in their browser, so it is a sentence.
  if (origin === null)
    return new Response(
      "This form was sent from a different address than the one this app is configured for (APP_ORIGIN).",
      { status: 403, headers: privately },
    );
  try {
    const auth = new AuthRepository(await cookieSessionClient());
    return await handle({ auth, origin });
  } catch (error) {
    return failureResponse(error);
  }
}

/** The email and password from the form, or null when they are unusable. */
export async function readCredentials(
  request: Request,
  schema: z.ZodType<Credentials>,
): Promise<Credentials | null> {
  const form = await readForm(request);
  const parsed = schema.safeParse({
    email: form?.get("email"),
    password: form?.get("password"),
  });
  return parsed.success ? parsed.data : null;
}

// `satisfies` makes a sign-up outcome without a destination a compile error.
const afterSignUp = {
  signed_in: "/dashboard",
  confirmation_sent: "/login?notice=confirm",
  rejected: "/signup?error=auth",
} satisfies Record<SignUpOutcome, string>;

export const signUpResponse = (outcome: SignUpOutcome) =>
  seeOther(afterSignUp[outcome]);
export const logInResponse = (signedIn: boolean) =>
  seeOther(signedIn ? "/dashboard" : "/login?error=auth");
export const logOutResponse = (signedOut: boolean) =>
  seeOther(signedOut ? "/login" : "/dashboard?error=logout");
export const emailConfirmationResponse = (signedIn: boolean) =>
  seeOther(signedIn ? "/dashboard" : "/login?error=confirm");

function seeOther(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, ...privately },
  });
}
