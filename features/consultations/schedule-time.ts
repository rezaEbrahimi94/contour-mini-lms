import { scheduleTimeZone, scheduleTimeZoneLabel } from "./policy.ts";

// Every conversion names the schedule time zone explicitly, so the result is
// the same in a Melbourne browser, a Perth browser and a UTC server.
const wallClock = new Intl.DateTimeFormat("en-AU", {
  timeZone: scheduleTimeZone,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type WallMinute = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** What the campus clock and calendar show at this instant. */
export function scheduleWallMinute(instant: Date): WallMinute {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const { type, value } of wallClock.formatToParts(instant))
    parts[type] = Number(value);
  const { year, month, day, hour, minute } = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  )
    throw new Error("This runtime cannot format the schedule time zone");
  return { year, month, day, hour, minute };
}

const dayMs = 86_400_000;
const wallAsUtc = ({ year, month, day, hour, minute }: WallMinute) =>
  Date.UTC(year, month - 1, day, hour, minute);
const offsetAt = (instant: number) =>
  wallAsUtc(scheduleWallMinute(new Date(instant))) - instant;

/**
 * The instant at which the campus clock shows this minute. Returns null for a
 * date that is not on the calendar and for a minute skipped when daylight
 * saving starts. A minute repeated when daylight saving ends resolves to its
 * first occurrence.
 */
export function scheduleMinuteToInstant(wall: WallMinute): string | null {
  const target = wallAsUtc(wall);
  const written = new Date(target);
  if (
    !Number.isFinite(target) ||
    written.getUTCFullYear() !== wall.year ||
    written.getUTCMonth() !== wall.month - 1 ||
    written.getUTCDate() !== wall.day ||
    written.getUTCHours() !== wall.hour ||
    written.getUTCMinutes() !== wall.minute
  )
    return null;
  // The zone has one UTC offset a day earlier and one a day later. Around a
  // daylight-saving change they differ, so try both and keep what round-trips.
  const matches = [offsetAt(target - dayMs), offsetAt(target + dayMs)]
    .map((offset) => target - offset)
    .filter((instant) => instant + offsetAt(instant) === target);
  if (matches.length === 0) return null;
  return new Date(Math.min(...matches)).toISOString();
}

/** Minutes after midnight for "2:30 pm", "14:30", "230pm", "1430" or "9". */
export function parseClock(value: string): number | null {
  const [, hourText, colonMinutes, bareMinutes, periodText] =
    /^(\d{1,2})(?:[:.](\d{2})|(\d{2}))?\s*(am?|pm?)?$/i.exec(value.trim()) ??
    [];
  if (hourText === undefined) return null;
  const hour = Number(hourText);
  const minute = Number(colonMinutes ?? bareMinutes ?? 0);
  const period = periodText?.toLowerCase().charAt(0);
  if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12)))
    return null;
  const hour24 = period ? (hour % 12) + (period === "p" ? 12 : 0) : hour;
  return hour24 * 60 + minute;
}

export function clockLabel(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "pm" : "am"}`;
}

/** The calendar date shown by a date picker, as the form submits it. */
export function calendarDayValue(day: Date) {
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

/** The campus calendar date of an instant, as a date-picker day. */
export function scheduleCalendarDay(instant: Date) {
  const { year, month, day } = scheduleWallMinute(instant);
  return new Date(year, month - 1, day);
}

export function scheduleMinutesOfDay(instant: Date) {
  const { hour, minute } = scheduleWallMinute(instant);
  return hour * 60 + minute;
}

/**
 * Reads the date and start time a student submitted. Form values arrive as
 * unknown strings or files, so both are checked here before anything else
 * uses them.
 */
export function readSchedule(
  fields: FormData,
  now: number = Date.now(),
): { instant: string } | { error: string } {
  const date = fields.get("date");
  const time = fields.get("time");
  const [, year, month, day] =
    (typeof date === "string" ? /^(\d{4})-(\d\d)-(\d\d)$/.exec(date) : null) ??
    [];
  if (year === undefined || month === undefined || day === undefined)
    return { error: "Choose a date for your consultation." };
  const minutes = typeof time === "string" ? parseClock(time) : null;
  if (minutes === null)
    return { error: "Enter a time such as 2:30 pm or 14:30." };
  const instant = scheduleMinuteToInstant({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  });
  if (!instant)
    return {
      error: `That time does not exist in ${scheduleTimeZoneLabel} on that date. Choose another time.`,
    };
  if (Date.parse(instant) <= now)
    return { error: "Choose a date and time in the future." };
  return { instant };
}
