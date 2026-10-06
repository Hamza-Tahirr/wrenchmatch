import { committedSlots } from "./db";

// Dates in the pilot region's time zone. America/Phoenix is UTC-7 all year (no daylight
// saving), so local <-> UTC is a fixed 7-hour shift.

const PHOENIX_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of today in Phoenix. */
export function phoenixToday(now = new Date()): string {
  return new Date(now.getTime() - PHOENIX_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The first Monday-Friday date at least `minDaysAhead` days after today (Phoenix). */
export function nextWeekday(minDaysAhead: number): string {
  let date = addDays(phoenixToday(), minDaysAhead);
  while (weekday(date) === 0 || weekday(date) === 6) date = addDays(date, 1);
  return date;
}

/** UTC ISO instant of a Phoenix local "YYYY-MM-DDTHH:mm". */
export function phoenixLocalToUtc(local: string): Date {
  return new Date(Date.parse(`${local}:00Z`) + PHOENIX_OFFSET_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A free start time for `mechanicId` on one of `dates` (Phoenix local "YYYY-MM-DDTHH:mm",
 * the format of the quote form's datetime-local input): no overlap with the mechanic's active
 * quotes or live bookings, with `durationMinutes` of work plus a 30-minute margin, between
 * 07:00 and 17:00. Candidates are shuffled so repeated runs don't pile onto the same slot.
 */
export function freeSlot(mechanicId: string, dates: readonly string[], durationMinutes = 60, avoid: readonly string[] = []): string {
  const busy = committedSlots(mechanicId).map((slot) => ({ start: Date.parse(slot.start), end: Date.parse(slot.end) }));
  for (const local of avoid) {
    const start = phoenixLocalToUtc(local).getTime();
    busy.push({ start, end: start + 3 * 60 * 60 * 1000 });
  }
  const margin = 30 * 60 * 1000;
  const minStart = Date.now() + 2 * 60 * 60 * 1000;
  const candidates: string[] = [];
  for (const date of dates) {
    for (let minutes = 7 * 60; minutes <= 16 * 60; minutes += 15) {
      candidates.push(`${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
    }
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
  }
  for (const local of candidates) {
    const start = phoenixLocalToUtc(local).getTime();
    const end = start + durationMinutes * 60 * 1000;
    if (start < minStart) continue;
    if (busy.some((slot) => slot.start < end + margin && start - margin < slot.end)) continue;
    return local;
  }
  throw new Error(`No free slot for mechanic ${mechanicId} on ${dates.join(", ")}`);
}

/** Weekdays from `minDaysAhead` on, `count` of them. */
export function weekdaysFrom(minDaysAhead: number, count: number): string[] {
  const dates: string[] = [];
  let date = nextWeekday(minDaysAhead);
  while (dates.length < count) {
    if (weekday(date) !== 0 && weekday(date) !== 6) dates.push(date);
    date = addDays(date, 1);
  }
  return dates;
}
