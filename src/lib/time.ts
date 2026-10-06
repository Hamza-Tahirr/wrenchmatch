// Time-zone aware date helpers without dependencies; safe in client and server code.
//
// * Instants are Date objects / UTC ISO strings.
// * Calendar dates are "YYYY-MM-DD" strings.
// * Local wall-clock times are "YYYY-MM-DDTHH:mm" (the <input type="datetime-local"> value),
//   interpreted in an IANA time zone such as "America/Phoenix".
//
// The locale is fixed to en-US so server- and client-rendered text match.

const LOCALE = "en-US";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 86_400_000;

export type ZonedParts = {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" (24-hour) */
  time: string;
  /** Minutes since local midnight, 0-1439 (the unit of mechanic availability windows). */
  minuteOfDay: number;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

function parseDateString(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match || !isValidDateString(value)) {
    throw new RangeError(`Expected a calendar date YYYY-MM-DD, received "${value}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone });
    return true;
  } catch {
    return false;
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock reading of an instant in `timeZone`, encoded as if it were a UTC time. */
function wallClockMs(utcMs: number, timeZone: string): number {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return Date.UTC(
    fields.year ?? NaN,
    (fields.month ?? NaN) - 1,
    fields.day ?? NaN,
    fields.hour ?? NaN,
    fields.minute ?? NaN,
    fields.second ?? NaN,
  );
}

/** Zone offset (local minus UTC, ms) in effect at an instant. */
function offsetAt(utcMs: number, timeZone: string): number {
  return wallClockMs(utcMs, timeZone) - Math.floor(utcMs / 1000) * 1000;
}

export type Disambiguation = "compatible" | "reject";

/**
 * Converts a local wall-clock time in `timeZone` to the UTC instant, correctly across DST.
 *
 * Like Temporal's "compatible" disambiguation: a repeated time (DST ends, e.g. 01:30 on the
 * fall-back night) resolves to the earlier instant; a skipped time (DST starts, e.g. 02:30
 * on the spring-forward night) moves forward by the gap (to 03:30). With
 * `disambiguation: "reject"` a skipped time throws a RangeError instead.
 */
export function zonedDateTimeToUtc(
  localDateTime: string,
  timeZone: string,
  options: { disambiguation?: Disambiguation } = {},
): Date {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localDateTime);
  const [hour, minute, second] = match
    ? [Number(match[4]), Number(match[5]), Number(match[6] ?? "0")]
    : [NaN, NaN, NaN];
  if (
    !match ||
    !isValidDateString(`${match[1]}-${match[2]}-${match[3]}`) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new RangeError(`Expected a local date-time YYYY-MM-DDTHH:mm, received "${localDateTime}"`);
  }

  const wallMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second);
  // Real zones change offset at most once within any 48 hours, so the offsets a day either
  // side cover every reading this wall time can have.
  const offsetBefore = offsetAt(wallMs - DAY_MS, timeZone);
  const offsetAfter = offsetAt(wallMs + DAY_MS, timeZone);
  const matches = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wallMs - offset)
    .filter((utcMs) => wallClockMs(utcMs, timeZone) === wallMs)
    .sort((a, b) => a - b);

  if (matches.length > 0) return new Date(matches[0]);
  if (options.disambiguation === "reject") {
    throw new RangeError(`${localDateTime} does not exist in ${timeZone} (clocks moved forward)`);
  }
  return new Date(wallMs - offsetBefore);
}

/** Wall-clock fields of an instant in `timeZone`. */
export function utcToZonedParts(date: Date, timeZone: string): ZonedParts {
  const wall = new Date(wallClockMs(date.getTime(), timeZone));
  if (Number.isNaN(wall.getTime())) throw new RangeError("Invalid date");
  const [year, month, day] = [wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate()];
  const [hour, minute, second] = [wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds()];
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: wall.getUTCDay(),
    date: formatDateParts(year, month, day),
    time: `${pad2(hour)}:${pad2(minute)}`,
    minuteOfDay: hour * 60 + minute,
  };
}

/** The "YYYY-MM-DDTHH:mm" value for a datetime-local input showing `date` in `timeZone`. */
export function toZonedDateTimeInput(date: Date, timeZone: string): string {
  const parts = utcToZonedParts(date, timeZone);
  return `${parts.date}T${parts.time}`;
}

const displayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Formats an instant in `timeZone` (en-US). Defaults to e.g. "Oct 5, 2026, 10:00 AM";
 * pass Intl options for other shapes, e.g. `{ weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }`.
 */
export function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = displayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone });
    displayFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

/** Today's calendar date ("YYYY-MM-DD") in `timeZone` at the instant `now`. */
export function todayInZone(now: Date, timeZone: string): string {
  return utcToZonedParts(now, timeZone).date;
}

/** Day of the week of a calendar date: 0 = Sunday ... 6 = Saturday. */
export function weekdayOfDate(date: string): number {
  const { year, month, day } = parseDateString(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Calendar arithmetic on "YYYY-MM-DD" dates (independent of time zones and DST). */
export function addDaysToDate(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, received ${days}`);
  const { year, month, day } = parseDateString(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Minutes since local midnight (0-1440) as a clock label: 480 -> "8:00 AM", 1020 -> "5:00 PM". */
export function formatMinuteOfDay(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new RangeError(`Expected minutes between 0 and 1440, received ${minutes}`);
  }
  const hour24 = Math.floor(minutes / 60) % 24;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minutes % 60)} ${hour24 < 12 ? "AM" : "PM"}`;
}
