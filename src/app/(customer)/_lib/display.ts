// Display helpers of the customer pages, safe in Server and Client Components. Times are
// always shown in the record's own IANA time zone (the request's ZIP), never the browser's,
// so the server and the browser render the same text.

import { formatInZone, utcToZonedParts } from "@/lib/time";

const DAY: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
const DAY_WITH_YEAR: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const TIME_WITH_ZONE: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };

/** "Thu, Oct 8 · 9:00 AM – 10:30 AM MST" (both days shown when the slot crosses midnight). */
export function formatSlotRange(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startText = `${formatInZone(start, timeZone, DAY)} · ${formatInZone(start, timeZone, TIME)}`;
  const sameDay = utcToZonedParts(start, timeZone).date === utcToZonedParts(end, timeZone).date;
  const endText = sameDay
    ? formatInZone(end, timeZone, TIME_WITH_ZONE)
    : `${formatInZone(end, timeZone, DAY)} · ${formatInZone(end, timeZone, TIME_WITH_ZONE)}`;
  return `${startText} – ${endText}`;
}

/** "Thu, Oct 8 · 9:00 AM MST" for compact rows. */
export function formatSlotStart(iso: string, timeZone: string): string {
  const at = new Date(iso);
  return `${formatInZone(at, timeZone, DAY)} · ${formatInZone(at, timeZone, TIME_WITH_ZONE)}`;
}

/** "Thu, Oct 8, 2026" for a calendar date ("YYYY-MM-DD"), which has no time zone. */
export function formatCalendarDate(date: string): string {
  return formatInZone(new Date(`${date}T12:00:00.000Z`), "UTC", DAY_WITH_YEAR);
}

/** 90 → "1 hr 30 min", 45 → "45 min", 120 → "2 hr". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Time left until an instant, in words: "2 days 4 hr", "3 hr 20 min", "12 min",
 * "less than a minute"; null once it has passed.
 */
export function formatTimeLeft(untilMs: number, nowMs: number): string | null {
  const left = untilMs - nowMs;
  if (left <= 0) return null;
  if (left < MINUTE_MS) return "less than a minute";
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS);
  if (days > 0) return hours > 0 ? `${days} ${days === 1 ? "day" : "days"} ${hours} hr` : `${days} ${days === 1 ? "day" : "days"}`;
  if (hours > 0) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  return `${minutes} min`;
}

/** Less than this much time left is shown as urgent. */
export const EXPIRY_WARNING_MS = 6 * HOUR_MS;

/** "1,234 / 2,000" style counters. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Labels of quote, booking and invoice line kinds. */
export const LINE_KIND_LABELS: Readonly<Record<string, string>> = {
  labor: "Labor",
  part: "Part",
  tax: "Tax",
  fee: "Fee",
};

/** "10%" from basis points (1000 → "10%", 1250 → "12.5%"). */
export function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}
