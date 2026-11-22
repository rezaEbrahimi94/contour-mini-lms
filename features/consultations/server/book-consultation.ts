import { unreachable } from "../../../lib/unreachable.ts";
import type { UserId } from "../../auth/user.ts";
import type { Booking, Consultation } from "../contracts.ts";
import type {
  ConsultationRepository,
  EarlierBooking,
} from "./consultation-repository.ts";

export type BookOutcome =
  | { kind: "booked"; consultation: Consultation }
  // A retry of a request that had already been saved.
  | { kind: "already_booked"; consultation: Consultation }
  // The request id belongs to a booking that was since cancelled.
  | { kind: "request_id_spent" }
  // The request id belongs to a booking with different details.
  | { kind: "request_id_reused" }
  | { kind: "rate_limited" }
  | { kind: "rejected" };

/** The two repository methods booking needs. A test can pass a plain object. */
export type BookingStore = Pick<
  ConsultationRepository,
  "insert" | "findByRequestId"
>;

/**
 * Books a consultation and decides what a repeated request means. This is
 * the one business rule the app owns. PostgreSQL enforces the rest
 * (ownership, revisions, future times), so listing, changing and cancelling
 * go straight from the route to the repository.
 */
export async function bookConsultation(
  store: BookingStore,
  studentId: UserId,
  booking: Booking,
): Promise<BookOutcome> {
  const insert = await store.insert(booking);
  switch (insert.kind) {
    case "inserted":
      return { kind: "booked", consultation: insert.consultation };
    case "rate_limited":
      return insert;
    case "rule_broken":
    case "request_id_used":
      break;
    default:
      return unreachable(insert);
  }

  // The database refused the row. An earlier request with this id may have
  // been saved even though its response never reached the browser, so look
  // for it before reporting a failure.
  const earlier = await store.findByRequestId(studentId, booking.request_id);
  if (earlier === null && insert.kind === "request_id_used")
    return { kind: "request_id_spent" };
  if (earlier === null) return { kind: "rejected" };
  if (!isRetryOf(earlier, booking)) return { kind: "request_id_reused" };
  return { kind: "already_booked", consultation: earlier.consultation };
}

/**
 * A retry repeats the first request exactly. The time is compared with the
 * one first requested, because the booking may have been rescheduled since.
 */
function isRetryOf(earlier: EarlierBooking, booking: Booking) {
  const saved = earlier.consultation;
  return (
    saved.first_name === booking.first_name &&
    saved.last_name === booking.last_name &&
    saved.reason === booking.reason &&
    Date.parse(earlier.firstRequestedTime) === Date.parse(booking.scheduled_at)
  );
}
