import "server-only";
import { redirect } from "next/navigation";
import { ConsultationRepository } from "@/features/consultations/server/consultation-repository";
import { pageSession } from "@/lib/supabase/session-client";
import { AuthRepository } from "./auth-repository";

/**
 * For server-rendered pages: the signed-in user and the repositories acting
 * as that user, or a redirect to the login page. proxy.ts forwards the
 * session's access token as a bearer header, and Auth checks it here before
 * any read.
 */
export async function requirePageUser() {
  const caller = await pageSession();
  if (!caller) redirect("/login");
  const auth = new AuthRepository(caller.session);
  const user = await auth.userForToken(caller.token);
  if (user === null) redirect("/login");
  return {
    user,
    auth,
    consultations: new ConsultationRepository(caller.session),
  };
}
