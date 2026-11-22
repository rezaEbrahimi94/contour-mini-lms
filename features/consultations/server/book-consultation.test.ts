import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { userIdSchema } from "../../auth/user.ts";
import {
  bookingSchema,
  consultationSchema,
  type Booking,
  type Consultation,
} from "../contracts.ts";
import { bookConsultation, type BookingStore } from "./book-consultation.ts";
import type {
  EarlierBooking,
  InsertResult,
} from "./consultation-repository.ts";

// bookConsultation decides what a repeated booking request means. These tests
// run that decision against a stand-in store, with no database.

const studentId = userIdSchema.parse(randomUUID());

const booking: Booking = bookingSchema.parse({
  request_id: randomUUID(),
  first_name: "Ada",
  last_name: "Lovelace",
  reason: "Exam preparation",
  scheduled_at: "2030-03-04T05:00:00.000Z",
});

const saved: Consultation = consultationSchema.parse({
  id: randomUUID(),
  version: randomUUID(),
  first_name: booking.first_name,
  last_name: booking.last_name,
  reason: booking.reason,
  scheduled_at: booking.scheduled_at,
  completed: false,
});

const firstRequest: EarlierBooking = {
  consultation: saved,
  firstRequestedTime: booking.scheduled_at,
};

/** Books against a store that answers an insert and a request-id lookup as told. */
async function book(
  insert: InsertResult,
  earlier: EarlierBooking | null,
  request: Booking = booking,
) {
  const lookups: string[] = [];
  const store: BookingStore = {
    insert: () => Promise.resolve(insert),
    findByRequestId: (_studentId, requestId) => {
      lookups.push(requestId);
      return Promise.resolve(earlier);
    },
  };
  const outcome = await bookConsultation(store, studentId, request);
  return { outcome, lookups };
}

const requestIdUsed: InsertResult = { kind: "request_id_used" };
const ruleBroken: InsertResult = { kind: "rule_broken" };

test("a new booking is booked without looking for an earlier request", async () => {
  const { outcome, lookups } = await book(
    { kind: "inserted", consultation: saved },
    null,
  );
  assert.deepEqual(outcome, { kind: "booked", consultation: saved });
  assert.deepEqual(lookups, []);
});

test("repeating a saved request returns the saved booking", async () => {
  const { outcome, lookups } = await book(requestIdUsed, firstRequest);
  assert.deepEqual(outcome, { kind: "already_booked", consultation: saved });
  assert.deepEqual(lookups, [booking.request_id]);
});

test("a retry still matches after the booking was rescheduled or completed", async () => {
  const rescheduled: EarlierBooking = {
    consultation: {
      ...saved,
      scheduled_at: "2031-01-01T00:00:00.000Z",
      completed: true,
    },
    firstRequestedTime: booking.scheduled_at,
  };
  const { outcome } = await book(requestIdUsed, rescheduled);
  assert.equal(outcome.kind, "already_booked");
});

test("a retry whose time has since passed returns the saved booking, not a validation error", async () => {
  const { outcome } = await book(ruleBroken, firstRequest);
  assert.equal(outcome.kind, "already_booked");
});

test("the same instant written with another offset is the same request", async () => {
  const { outcome } = await book(requestIdUsed, {
    consultation: saved,
    firstRequestedTime: "2030-03-04T16:00:00+11:00",
  });
  assert.equal(outcome.kind, "already_booked");
});

const changedDetails: [string, Partial<Booking>][] = [
  ["first name", { first_name: "Grace" }],
  ["last name", { last_name: "Hopper" }],
  ["reason", { reason: "Something else" }],
  ["time", { scheduled_at: "2030-03-04T05:00:01.000Z" }],
];
for (const [detail, change] of changedDetails)
  test(`a request id reused with a different ${detail} is refused`, async () => {
    const changed = { ...booking, ...change };
    const { outcome } = await book(requestIdUsed, firstRequest, changed);
    assert.deepEqual(outcome, { kind: "request_id_reused" });
  });

test("a request id whose booking was cancelled cannot book again", async () => {
  const { outcome } = await book(requestIdUsed, null);
  assert.deepEqual(outcome, { kind: "request_id_spent" });
});

test("a booking the database rules reject, with no earlier request, is rejected", async () => {
  const { outcome } = await book(ruleBroken, null);
  assert.deepEqual(outcome, { kind: "rejected" });
});
