import { z } from "zod";
import { DataAccessError } from "../../../lib/supabase/data-access-error.ts";
import type { SessionClient } from "../../../lib/supabase/session-client.ts";
import type { UserId } from "../../auth/user.ts";
import {
  consultationSchema,
  revisionSchema,
  type Booking,
  type BookingChange,
  type BookingVersion,
  type Consultation,
  type ConsultationPage,
  type Revision,
} from "../contracts.ts";
import type { Period } from "../list-query.ts";
import { pageSize } from "../policy.ts";

// The only file that knows how consultations are stored: the table, its
// columns, the two database functions and the PostgreSQL error codes.

// Rows are parsed with consultationSchema as they enter the app, so a column
// missing here fails every read loudly.
const columns = "id,first_name,last_name,reason,scheduled_at,completed,version";

const uniqueViolation = "23505";
const checkViolation = "23514";
// Raised by private.lock_own_consultation in the migrations.
const notOwnedOrMissing = "PT404";
const revisionChanged = "PT412";

export type InsertResult =
  | { kind: "inserted"; consultation: Consultation }
  | { kind: "rate_limited" }
  | { kind: "request_id_used" }
  | { kind: "rule_broken" };

/** A stored booking, with the time its first request asked for. */
export type EarlierBooking = {
  consultation: Consultation;
  firstRequestedTime: string;
};

export type ChangeOutcome =
  | { kind: "changed"; revision: Revision }
  | { kind: "not_found" }
  | { kind: "changed_since_read" }
  | { kind: "time_not_in_future" };

export type CancelOutcome =
  | { kind: "cancelled" }
  | { kind: "not_found" }
  | { kind: "changed_since_read" };

export class ConsultationRepository {
  readonly #client: SessionClient["client"];

  /** The client carries the caller's session, so row level security applies. */
  constructor(session: SessionClient) {
    this.#client = session.client;
  }

  /**
   * One page of one student's consultations, or of everyone's when no student
   * is named. Row level security still returns other students' rows only to
   * an admin.
   */
  async findPage(
    page: number,
    { studentId, period }: { studentId?: UserId; period?: Period } = {},
  ): Promise<ConsultationPage> {
    const now = new Date().toISOString();
    const ascending = period !== "history";
    const offset = (page - 1) * pageSize;
    let query = this.#client.from("consultations").select(columns);
    if (studentId !== undefined) query = query.eq("student_id", studentId);
    if (period === "upcoming") query = query.gte("scheduled_at", now);
    if (period === "history") query = query.lt("scheduled_at", now);
    // One extra row shows whether another page exists. The id breaks ties so
    // bookings at the same instant keep one order across pages.
    const { data, error, status } = await query
      .order("scheduled_at", { ascending })
      .order("id", { ascending })
      .range(offset, offset + pageSize);
    if (error) throw new DataAccessError(error.code, status);
    const rows = parse(z.array(consultationSchema), data);
    return { items: rows.slice(0, pageSize), hasNext: rows.length > pageSize };
  }

  /** The database fills in the owner from the caller's session. */
  async insert(booking: Booking): Promise<InsertResult> {
    const { data, error, status } = await this.#client
      .from("consultations")
      .insert(booking)
      .select(columns)
      .single();
    if (error?.code === "PT429") return { kind: "rate_limited" };
    if (error?.code === uniqueViolation) return { kind: "request_id_used" };
    if (error?.code === checkViolation) return { kind: "rule_broken" };
    if (error) throw new DataAccessError(error.code, status);
    return { kind: "inserted", consultation: parse(consultationSchema, data) };
  }

  async findByRequestId(
    studentId: UserId,
    requestId: string,
  ): Promise<EarlierBooking | null> {
    const { data, error, status } = await this.#client
      .from("consultations")
      .select(`original_schedule,${columns}`)
      .eq("student_id", studentId)
      .eq("request_id", requestId)
      .maybeSingle();
    if (error) throw new DataAccessError(error.code, status);
    if (data === null) return null;
    const { original_schedule, ...row } = data;
    return {
      consultation: parse(consultationSchema, row),
      firstRequestedTime: original_schedule,
    };
  }

  /**
   * Reschedules or sets completion through change_own_consultation, which
   * checks the owner first and the revision second, inside one transaction.
   */
  async change(
    booking: BookingVersion,
    change: BookingChange,
  ): Promise<ChangeOutcome> {
    const newValue =
      "scheduled_at" in change
        ? { p_scheduled_at: change.scheduled_at }
        : { p_completed: change.completed };
    const { data, error, status } = await this.#client.rpc(
      "change_own_consultation",
      { p_id: booking.id, p_version: booking.revision, ...newValue },
    );
    if (error?.code === notOwnedOrMissing) return { kind: "not_found" };
    if (error?.code === revisionChanged) return { kind: "changed_since_read" };
    if (error?.code === checkViolation) return { kind: "time_not_in_future" };
    if (error) throw new DataAccessError(error.code, status);
    // PostgreSQL cannot declare a function result NOT NULL, so the generated
    // type's promise of a string is checked here.
    return { kind: "changed", revision: parse(revisionSchema, data) };
  }

  async cancel(booking: BookingVersion): Promise<CancelOutcome> {
    const { error, status } = await this.#client.rpc(
      "cancel_own_consultation",
      { p_id: booking.id, p_version: booking.revision },
    );
    if (error?.code === notOwnedOrMissing) return { kind: "not_found" };
    if (error?.code === revisionChanged) return { kind: "changed_since_read" };
    if (error) throw new DataAccessError(error.code, status);
    return { kind: "cancelled" };
  }
}

/** A row that does not match its schema is a failure of this layer. */
function parse<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DataAccessError("unexpected_database_shape");
  return parsed.data;
}
