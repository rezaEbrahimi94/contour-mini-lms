import createClient from "openapi-fetch";
import { problemSchema } from "@/lib/http/problem";
import type { paths } from "../api";
import type {
  Booking,
  BookingChange,
  BookingVersion,
  Revision,
} from "../contracts";
import { entityTag, revisionFromEntityTag } from "../revision";

// The browser's only way to the booking API. The types come from the
// generated OpenAPI paths, so a call that breaks the contract does not compile.

const api = createClient<paths>();

export type SaveResult =
  // The revision is the booking's new one, or null after a cancellation.
  | { ok: true; revision: Revision | null }
  // Status 0 means the request never got an answer.
  | { ok: false; status: number; message: string };

export function bookConsultation(booking: Booking): Promise<SaveResult> {
  return save(() => api.POST("/api/consultations", { body: booking }));
}

export function changeConsultation(
  booking: BookingVersion,
  change: BookingChange,
): Promise<SaveResult> {
  return save(() =>
    api.PATCH("/api/consultations/{id}", {
      params: ifUnchanged(booking),
      body: change,
    }),
  );
}

export function cancelConsultation(
  booking: BookingVersion,
): Promise<SaveResult> {
  return save(() =>
    api.DELETE("/api/consultations/{id}", { params: ifUnchanged(booking) }),
  );
}

function ifUnchanged({ id, revision }: BookingVersion) {
  return { path: { id }, header: { "If-Match": entityTag(revision) } };
}

async function save(
  send: () => Promise<{ response: Response; error?: unknown }>,
): Promise<SaveResult> {
  try {
    const { response, error } = await send();
    if (response.ok) {
      const revision = revisionFromEntityTag(response.headers.get("ETag"));
      return { ok: true, revision };
    }
    // An error body is only trusted once it parses as the API's problem shape.
    const problem = problemSchema.safeParse(error);
    const message = problem.success
      ? problem.data.error
      : "Unable to save. Please try again.";
    return { ok: false, status: response.status, message };
  } catch {
    const message = "Connection interrupted. Please try again.";
    return { ok: false, status: 0, message };
  }
}
