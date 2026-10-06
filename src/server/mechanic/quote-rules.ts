import "server-only";

import { PREFERRED_WINDOW_INFO, type PreferredWindow } from "@/lib/domain";
import { formatInZone, toZonedDateTimeInput, zonedDateTimeToUtc } from "@/lib/time";
import { QUOTE_LIMITS, type QuoteValidityHours } from "@/lib/validation/quote";
import { addDays, addHours, addMinutes } from "@/server/clock";

// Time rules for quotes (pure; the caller passes the clock and the request's time zone).
// The offered start is a local wall-clock time in the request's zone; it must be at least
// QUOTE_LIMITS.minLeadMinutes ahead and at most QUOTE_LIMITS.maxAdvanceDays ahead.

const MINUTE_MS = 60_000;
const QUARTER_HOUR_MS = 15 * MINUTE_MS;
/** Start of the preferred window used to suggest a time for "flexible" requests: 9:00. */
const FLEXIBLE_SUGGESTED_MINUTE = 9 * 60;

const SLOT_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** "Mon, Oct 5, 11:00 AM MST" */
export function formatSlotTime(at: Date, timeZone: string): string {
  return formatInZone(at, timeZone, SLOT_TIME_FORMAT);
}

/** The minimum start the rules accept: now (to the minute) + the minimum lead time. */
function minimumStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS + QUOTE_LIMITS.minLeadMinutes * MINUTE_MS);
}

/** The earliest start to offer in the form: the minimum, rounded up to a quarter hour. */
export function earliestAllowedStart(now: Date): Date {
  return new Date(Math.ceil(minimumStart(now).getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
}

/** The latest start the rules accept: now + 30 days (to the minute). */
export function latestAllowedStart(now: Date): Date {
  const latest = addDays(now, QUOTE_LIMITS.maxAdvanceDays);
  return new Date(Math.floor(latest.getTime() / MINUTE_MS) * MINUTE_MS);
}

export type SlotResult = { ok: true; start: Date; end: Date } | { ok: false; message: string };

/** Converts the offered local start to UTC and applies the lead-time and 30-day rules. */
export function resolveSlot(localStart: string, durationMinutes: number, timeZone: string, now: Date): SlotResult {
  let start: Date;
  try {
    start = zonedDateTimeToUtc(localStart, timeZone, { disambiguation: "reject" });
  } catch {
    return {
      ok: false,
      message: "That time doesn't exist in the job's time zone (the clocks change then). Choose another time.",
    };
  }
  if (start.getTime() < minimumStart(now).getTime()) {
    return {
      ok: false,
      message: `Offer a time at least 1 hour from now: ${formatSlotTime(earliestAllowedStart(now), timeZone)} or later.`,
    };
  }
  if (start.getTime() > latestAllowedStart(now).getTime()) {
    return {
      ok: false,
      message: `Offer a time within the next ${QUOTE_LIMITS.maxAdvanceDays} days (by ${formatSlotTime(latestAllowedStart(now), timeZone)}).`,
    };
  }
  return { ok: true, start, end: addMinutes(start, durationMinutes) };
}

/**
 * A suggested start for the quote form: the request's preferred date at the start of its
 * preferred window (9:00 AM for "flexible"), or the earliest allowed time when that has
 * passed or is beyond 30 days.
 */
export function suggestedStart(preferredDate: string, preferredWindow: PreferredWindow, timeZone: string, now: Date): Date {
  const startMinute = PREFERRED_WINDOW_INFO[preferredWindow].startMinute ?? FLEXIBLE_SUGGESTED_MINUTE;
  const hh = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const mm = String(startMinute % 60).padStart(2, "0");
  const earliest = earliestAllowedStart(now);
  try {
    const preferred = zonedDateTimeToUtc(`${preferredDate}T${hh}:${mm}`, timeZone);
    if (preferred >= earliest && preferred <= latestAllowedStart(now)) return preferred;
  } catch {
    // An invalid stored date falls back to the earliest time.
  }
  return earliest;
}

/** The datetime-local value of an instant in `timeZone`. */
export function toLocalInput(at: Date, timeZone: string): string {
  return toZonedDateTimeInput(at, timeZone);
}

/**
 * When a quote stops being selectable: its validity period, but never after the offered start
 * (the schema requires expires_at <= slot_start_at) or after the request itself expires.
 */
export function quoteExpiresAt(
  now: Date,
  validityHours: QuoteValidityHours,
  slotStart: Date,
  requestExpiresAt: string | null,
): Date {
  const candidates = [addHours(now, validityHours).getTime(), slotStart.getTime()];
  if (requestExpiresAt) candidates.push(Date.parse(requestExpiresAt));
  return new Date(Math.min(...candidates));
}
