import { readJson } from "../../../lib/http/body.ts";
import { problem, Refusal } from "../../../lib/http/problem.ts";
import { unreachable } from "../../../lib/unreachable.ts";
import {
  bookingSchema,
  changeSchema,
  consultationIdSchema,
  type BookingVersion,
  type Consultation,
  type ConsultationPage,
} from "../contracts.ts";
import { pageNumber } from "../list-query.ts";
import { entityTag, revisionFromEntityTag } from "../revision.ts";
import type { BookOutcome } from "./book-consultation.ts";
import type {
  CancelOutcome,
  ChangeOutcome,
} from "./consultation-repository.ts";

// The HTTP side of the booking API. The readers turn a request into validated
// input or refuse it. The responses turn each outcome into a status, a body
// and an ETag.

export function readPageNumber(request: Request) {
  return pageNumber(new URL(request.url).searchParams.get("page"));
}

export function readBooking(request: Request) {
  return readJson(
    request,
    bookingSchema,
    "Enter both names, a reason and a valid date and time.",
  );
}

export function readChange(request: Request) {
  return readJson(
    request,
    changeSchema,
    "Supply a new time or a completion status.",
  );
}

/** A change or cancellation names one booking and the revision last read. */
export function readBookingVersion(
  request: Request,
  pathId: string,
): BookingVersion {
  const id = consultationIdSchema.safeParse(pathId);
  if (!id.success) throw new Refusal(404, "Consultation not found.");
  const tag = request.headers.get("If-Match");
  if (tag === null)
    throw new Refusal(428, "Include the booking revision in If-Match.");
  const revision = revisionFromEntityTag(tag);
  if (revision === null)
    throw new Refusal(
      400,
      "Use one quoted booking revision from your last read.",
    );
  return { id: id.data, revision };
}

export function pageResponse(page: ConsultationPage) {
  return Response.json(page);
}

export function bookResponse(outcome: BookOutcome) {
  switch (outcome.kind) {
    case "booked":
      return consultationResponse(201, outcome.consultation);
    case "already_booked":
      return consultationResponse(200, outcome.consultation);
    case "request_id_spent":
      return problem(409, "This booking reference has already been used.");
    case "request_id_reused":
      return problem(
        409,
        "This booking reference was already used for different details.",
      );
    case "rate_limited":
      return problem(429, "Booking limit reached. Please try again later.");
    case "rejected":
      return problem(400, "Check the details and choose a future time.");
    default:
      return unreachable(outcome);
  }
}

export function changeResponse(outcome: ChangeOutcome) {
  switch (outcome.kind) {
    case "changed":
      return new Response(null, {
        status: 204,
        headers: { ETag: entityTag(outcome.revision) },
      });
    case "not_found":
      return notFound();
    case "changed_since_read":
      return changedSinceRead();
    case "time_not_in_future":
      return problem(400, "Choose a future time.");
    default:
      return unreachable(outcome);
  }
}

export function cancelResponse(outcome: CancelOutcome) {
  switch (outcome.kind) {
    case "cancelled":
      // Nothing remains to describe, so a cancellation carries no entity tag.
      return new Response(null, { status: 204 });
    case "not_found":
      return notFound();
    case "changed_since_read":
      return changedSinceRead();
    default:
      return unreachable(outcome);
  }
}

function consultationResponse(status: 200 | 201, consultation: Consultation) {
  return Response.json(consultation, {
    status,
    headers: { ETag: entityTag(consultation.version) },
  });
}

const notFound = () => problem(404, "Consultation not found.");

const changedSinceRead = () =>
  problem(
    412,
    "This consultation changed since you opened it. Reload the booking and review the latest details.",
  );
