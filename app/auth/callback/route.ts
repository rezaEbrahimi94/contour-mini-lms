import { emailConfirmationResponse } from "@/features/auth/server/auth-form-post";
import { AuthRepository } from "@/features/auth/server/auth-repository";
import { cookieSessionClient } from "@/lib/supabase/session-client";

// The link in a confirmation email lands here. It is a GET from an email
// client, so there is no origin to check. The one-time code is the proof.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  const auth = new AuthRepository(await cookieSessionClient());
  return emailConfirmationResponse(await auth.confirmEmail(code));
}
