import { DataAccessError } from "../supabase/data-access-error.ts";
import { problem, Refusal } from "./problem.ts";

/**
 * The one place a thrown error becomes a response. A Refusal carries its own
 * status and message. Anything else is answered with a reference only.
 */
export function failureResponse(error: unknown): Response {
  if (error instanceof Refusal) return problem(error.status, error.message);
  if (error instanceof DataAccessError)
    return unexpected(
      error.unavailable ? 503 : 500,
      error.code,
      error.upstreamStatus,
    );
  return unexpected(500, "request_failed");
}

// The log line carries the same reference and the upstream codes, and never a
// booking's names, reason or time.
function unexpected(status: 500 | 503, code: string, upstreamStatus?: number) {
  const reference = crypto.randomUUID();
  console.error("Request failed", { reference, code, upstreamStatus });
  const response = problem(
    status,
    `Unable to complete the request. Reference ${reference}`,
  );
  response.headers.set("X-Request-Id", reference);
  return response;
}
