// Upgrades a database that holds bookings made under the originally
// submitted schema, and checks that nothing a student had is lost or
// changed. It resets the database, so it only runs on the disposable stack:
//   npm run isolated -- npm run test:upgrade
import assert from "node:assert/strict";
import { z } from "zod";
import { requireDisposableStack, supabase } from "../tests/support/stack.ts";

requireDisposableStack("The upgrade test");

// The last migration in the original submission. Later migrations are the
// upgrade under test.
const submittedSchema = "20261122000500";
const student = "upgrade-student@example.test";

const rows = z.array(z.record(z.string(), z.unknown()));
const query = (sql: string) =>
  rows.parse(
    JSON.parse(supabase(["db", "query", "--agent", "no", "-o", "json", sql])),
  );
// Every column of every booking, and every spent request key.
const bookings = () =>
  query(
    `select c.* from public.consultations c join auth.users u on u.id = c.student_id
     where u.email = '${student}' order by c.id`,
  );
const requestKeys = () =>
  query(
    `select r.request_id from private.booking_requests r join auth.users u on u.id = r.student_id
     where u.email = '${student}' order by r.request_id`,
  );

supabase(["db", "reset", "--no-seed", "--version", submittedSchema]);
supabase(["db", "query", "-f", "supabase/upgrade/submitted-schema.setup.sql"]);
const before = { bookings: bookings(), requestKeys: requestKeys() };
assert.equal(
  before.bookings.length,
  2,
  "Expected an open and a completed booking",
);
assert.equal(before.requestKeys.length, 3, "Expected three spent request keys");

supabase(["migration", "up"]);
assert.deepEqual(
  { bookings: bookings(), requestKeys: requestKeys() },
  before,
  "The upgrade changed stored bookings or request keys",
);
console.log(
  `Upgraded from ${submittedSchema}: ${before.bookings.length} bookings and ${before.requestKeys.length} request keys are identical, column for column.`,
);
try {
  process.stdout.write(
    supabase(["test", "db", "supabase/upgrade/after-upgrade.test.sql"]),
  );
} finally {
  query(`delete from auth.users where email = '${student}' returning id`);
}
