import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { bookingSchema, changeSchema } from "./contracts.ts";
import { nameMaxLength, reasonMaxLength } from "./policy.ts";
import { entityTag, revisionFromEntityTag } from "./revision.ts";

const booking = {
  first_name: " سارا ",
  last_name: "O’Connor",
  reason: "Physics",
  scheduled_at: "2030-01-03T11:00:00+11:00",
  request_id: randomUUID(),
};
test("names are trimmed and offset timestamps become UTC", () => {
  const result = bookingSchema.parse(booking);
  assert.equal(result.first_name, "سارا");
  assert.equal(result.scheduled_at, "2030-01-03T00:00:00.000Z");
});
const invalidBookings: [string, Record<string, unknown>][] = [
  ["blank name", { first_name: " \n " }],
  ["NUL character", { reason: "x\0y" }],
  ["name over the limit", { last_name: "a".repeat(nameMaxLength + 1) }],
  ["reason over the limit", { reason: "x".repeat(reasonMaxLength + 1) }],
  ["boolean name", { first_name: true }],
  ["missing name", { last_name: undefined }],
  ["date without offset", { scheduled_at: "2029-08-01T11:00:00" }],
  ["nonexistent date", { scheduled_at: "2030-02-30T12:00:00Z" }],
  ["invalid request identifier", { request_id: "42" }],
  ["unexpected role", { role: "admin" }],
];
for (const [description, values] of invalidBookings) {
  test("create rejects " + description, () => {
    assert.equal(
      bookingSchema.safeParse({ ...booking, ...values }).success,
      false,
    );
  });
}
test("maximum valid lengths are accepted", () => {
  assert.ok(
    bookingSchema.safeParse({
      ...booking,
      first_name: "a".repeat(nameMaxLength),
      reason: "x".repeat(reasonMaxLength),
    }).success,
  );
});
for (const change of [
  {},
  { completed: "false" },
  { completed: false, scheduled_at: booking.scheduled_at },
  { student_id: randomUUID() },
  null,
]) {
  test("rejects invalid change " + JSON.stringify(change), () => {
    assert.equal(changeSchema.safeParse(change).success, false);
  });
}
test("change accepts explicit false and a single reschedule", () => {
  assert.deepEqual(changeSchema.parse({ completed: false }), {
    completed: false,
  });
  assert.deepEqual(changeSchema.parse({ scheduled_at: booking.scheduled_at }), {
    scheduled_at: "2030-01-03T00:00:00.000Z",
  });
});

test("any generated revision survives the entity tag round trip", () => {
  for (let i = 0; i < 100; i++) {
    const revision = randomUUID();
    assert.equal(revisionFromEntityTag(entityTag(revision)), revision);
  }
});
test("only one strong, quoted, lowercase revision is accepted", () => {
  const revision = randomUUID();
  const tag = entityTag(revision);
  for (const rejected of [
    null,
    "",
    '"',
    '""',
    "*",
    revision,
    "W/" + tag,
    tag + "," + tag,
    tag.toUpperCase(),
    '"not-a-revision"',
    // A version 1 UUID: well formed, but never issued by the database.
    '"c232ab00-9414-11ec-b3c8-9f6bdeced846"',
  ])
    assert.equal(revisionFromEntityTag(rejected), null, String(rejected));
});
