import { z } from "zod";
import { nameMaxLength, reasonMaxLength } from "./policy.ts";

// The consultation wire format. These schemas validate requests, validate
// rows read from PostgreSQL, and generate the OpenAPI document and the typed
// browser client (npm run contracts).

// Ids and revisions are UUID strings with their own types, so one cannot be
// passed where another is expected.
export const consultationIdSchema = z.uuid().brand<"ConsultationId">();
export type ConsultationId = z.infer<typeof consultationIdSchema>;

// PostgreSQL issues a fresh random UUID for every committed change to a
// booking. HTTP carries it as an entity tag (see revision.ts).
export const revisionSchema = z.uuidv4().brand<"Revision">();
export type Revision = z.infer<typeof revisionSchema>;

/** A write names one booking and the revision the caller last read. */
export type BookingVersion = {
  readonly id: ConsultationId;
  readonly revision: Revision;
};

const textField = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(limit)
    .refine((value) => !value.includes("\0"));
const name = textField(nameMaxLength);
const instant = z.iso
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp")
  .transform((value) => new Date(value).toISOString());

export const bookingSchema = z.strictObject({
  request_id: z.uuid(),
  first_name: name,
  last_name: name,
  reason: textField(reasonMaxLength),
  scheduled_at: instant,
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookingDetailsSchema = bookingSchema.omit({ request_id: true });
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;

export const changeSchema = z.union([
  z.strictObject({ scheduled_at: instant }),
  z.strictObject({ completed: z.boolean() }),
]);
export type BookingChange = z.infer<typeof changeSchema>;

export const consultationSchema = z.strictObject({
  id: consultationIdSchema,
  version: revisionSchema,
  first_name: z.string(),
  last_name: z.string(),
  reason: z.string(),
  scheduled_at: z.iso.datetime({ offset: true }),
  completed: z.boolean(),
});
export type Consultation = z.infer<typeof consultationSchema>;

export const consultationPageSchema = z.strictObject({
  items: z.array(consultationSchema),
  hasNext: z.boolean(),
});
export type ConsultationPage = z.infer<typeof consultationPageSchema>;
