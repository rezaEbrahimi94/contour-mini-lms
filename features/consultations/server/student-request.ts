import "server-only";
import { AuthRepository } from "@/features/auth/server/auth-repository";
import type { UserId } from "@/features/auth/user";
import { failureResponse } from "@/lib/http/failure";
import { trustedAppOrigin } from "@/lib/http/origin";
import { Refusal } from "@/lib/http/problem";
import { cookieSessionClient } from "@/lib/supabase/session-client";
import { ConsultationRepository } from "./consultation-repository";

type Student = { studentId: UserId; consultations: ConsultationRepository };

/**
 * The chain every booking API request goes through, in this order:
 *
 * 1. Origin. A write must come from one of this app's own pages.
 * 2. Session. The caller must be signed in. The repository built on their
 *    session client is the only database access the handler gets.
 * 3. Handler. The route reads its input and makes one call.
 * 4. Response. Never cached. Anything thrown above becomes an error response
 *    in one place.
 */
export async function studentRequest(
  request: Request,
  handle: (student: Student) => Promise<Response>,
): Promise<Response> {
  try {
    if (request.method !== "GET" && trustedAppOrigin(request) === null)
      throw new Refusal(403, "Invalid request origin.");

    const client = await cookieSessionClient();
    const studentId = await new AuthRepository(client).sessionUserId();
    if (studentId === null) throw new Refusal(401, "Please log in.");

    const consultations = new ConsultationRepository(client);
    const response = await handle({ studentId, consultations });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return failureResponse(error);
  }
}
