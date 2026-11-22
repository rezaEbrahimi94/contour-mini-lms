import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  calendarDayValue,
  clockLabel,
  parseClock,
  readSchedule,
  scheduleCalendarDay,
  scheduleMinuteToInstant,
  scheduleWallMinute,
} from "./schedule-time.ts";

// The schedule runs on Melbourne time wherever the code runs. Each case below
// is repeated with the process in several other time zones to prove it.
const processZones = [
  "Australia/Melbourne",
  "Australia/Perth",
  "America/Los_Angeles",
  "UTC",
  "Pacific/Kiritimati",
];
const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
function inEveryZone(name: string, check: () => void) {
  test(name, () => {
    for (const zone of processZones) {
      process.env.TZ = zone;
      check();
    }
  });
}
const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  scheduleMinuteToInstant({ year, month, day, hour, minute });

inEveryZone("ordinary summer and winter times use the campus offset", () => {
  assert.equal(at(2027, 1, 15, 9), "2027-01-14T22:00:00.000Z");
  assert.equal(at(2027, 7, 10, 12, 30), "2027-07-10T02:30:00.000Z");
});
inEveryZone(
  "midnight and the last minute stay on their own campus date",
  () => {
    assert.equal(at(2027, 3, 1), "2027-02-28T13:00:00.000Z");
    assert.equal(at(2027, 3, 1, 23, 59), "2027-03-01T12:59:00.000Z");
    assert.equal(at(2027, 12, 31, 23, 59), "2027-12-31T12:59:00.000Z");
    assert.equal(at(2028, 1, 1), "2027-12-31T13:00:00.000Z");
  },
);
inEveryZone(
  "a minute skipped when daylight saving starts has no instant",
  () => {
    assert.equal(at(2027, 10, 3, 1, 59), "2027-10-02T15:59:00.000Z");
    assert.equal(at(2027, 10, 3, 2), null);
    assert.equal(at(2027, 10, 3, 2, 30), null);
    assert.equal(at(2027, 10, 3, 2, 59), null);
    assert.equal(at(2027, 10, 3, 3), "2027-10-02T16:00:00.000Z");
  },
);
inEveryZone(
  "a minute repeated when daylight saving ends is its first occurrence",
  () => {
    assert.equal(at(2027, 4, 4, 1, 59), "2027-04-03T14:59:00.000Z");
    assert.equal(at(2027, 4, 4, 2), "2027-04-03T15:00:00.000Z");
    assert.equal(at(2027, 4, 4, 2, 30), "2027-04-03T15:30:00.000Z");
    assert.equal(at(2027, 4, 4, 3), "2027-04-03T17:00:00.000Z");
  },
);
inEveryZone(
  "dates and times that are not on the calendar or clock are rejected",
  () => {
    assert.equal(at(2027, 2, 30, 9), null);
    assert.equal(at(2027, 13, 1, 9), null);
    assert.equal(at(2027, 6, 1, 24), null);
    assert.equal(at(2027, 6, 1, 9, 60), null);
    assert.equal(at(2028, 2, 29, 9), "2028-02-28T22:00:00.000Z");
  },
);
inEveryZone(
  "every quarter hour around both changes reads back as it was written",
  () => {
    const quarterHour = 15 * 60_000;
    for (const start of ["2027-04-02T00:00:00Z", "2027-10-01T00:00:00Z"]) {
      const from = Date.parse(start);
      for (
        let instant = from;
        instant < from + 4 * 86_400_000;
        instant += quarterHour
      ) {
        const wall = scheduleWallMinute(new Date(instant));
        const resolved = scheduleMinuteToInstant(wall);
        assert.ok(resolved, "a displayed time is always a real time");
        // The same clock reading, at this instant or one repeated hour earlier.
        assert.deepEqual(scheduleWallMinute(new Date(resolved)), wall);
        assert.ok([0, 3_600_000].includes(instant - Date.parse(resolved)));
      }
    }
  },
);
inEveryZone(
  "a date picker day carries the campus date of a saved booking",
  () => {
    // 00:30 on 2 March in Melbourne is still 1 March in every zone to its west.
    const day = scheduleCalendarDay(new Date("2027-03-01T13:30:00Z"));
    assert.equal(calendarDayValue(day), "2027-03-02");
  },
);

function form(values: Record<string, string | Blob>) {
  const fields = new FormData();
  for (const [name, value] of Object.entries(values)) fields.set(name, value);
  return fields;
}
const now = Date.parse("2027-06-01T00:00:00Z");
inEveryZone("the form's date and typed time become one instant", () => {
  assert.deepEqual(
    readSchedule(form({ date: "2027-07-10", time: "12:30 pm" }), now),
    {
      instant: "2027-07-10T02:30:00.000Z",
    },
  );
});
test("the form explains a missing date, an unreadable time and a past time", () => {
  const message = (values: Record<string, string | Blob>) => {
    const result = readSchedule(form(values), now);
    return "error" in result ? result.error : null;
  };
  assert.match(message({ time: "9am" }) ?? "", /Choose a date/);
  assert.match(
    message({ date: "10/07/2027", time: "9am" }) ?? "",
    /Choose a date/,
  );
  assert.match(message({ date: "2027-07-10" }) ?? "", /Enter a time/);
  assert.match(
    message({ date: "2027-07-10", time: "25:00" }) ?? "",
    /Enter a time/,
  );
  assert.match(
    message({ date: "2027-07-10", time: new Blob(["9am"]) }) ?? "",
    /Enter a time/,
  );
  assert.match(
    message({ date: "2027-10-03", time: "2:30 am" }) ?? "",
    /does not exist/,
  );
  assert.match(
    message({ date: "2027-06-01", time: "10:00 am" }) ?? "",
    /in the future/,
  );
  assert.equal(message({ date: "2027-06-01", time: "10:01 am" }), null);
});

test("start times preserve exact minutes, noon and midnight", () => {
  for (let minute = 0; minute < 1440; minute++)
    assert.equal(parseClock(clockLabel(minute)), minute);
  assert.equal(parseClock("14:37"), 877);
  assert.equal(parseClock(" 2:30 PM "), 870);
  assert.equal(parseClock("12am"), 0);
  assert.equal(parseClock("12pm"), 720);
});
test("start times accept the short forms people type", () => {
  assert.equal(parseClock("230pm"), 870);
  assert.equal(parseClock("2.30pm"), 870);
  assert.equal(parseClock("1430"), 870);
  assert.equal(parseClock("930"), 570);
  assert.equal(parseClock("9"), 540);
  assert.equal(parseClock("9a"), 540);
  assert.equal(parseClock("2p"), 840);
  assert.equal(parseClock("0000"), 0);
});
test("start times reject readings that are not on a clock", () => {
  for (const invalid of [
    "13pm",
    "0am",
    "24:00",
    "2400",
    "2:60",
    "260",
    "2:30 later",
    "2:3",
    "12345",
    "pm",
    "",
  ])
    assert.equal(parseClock(invalid), null, invalid);
});
