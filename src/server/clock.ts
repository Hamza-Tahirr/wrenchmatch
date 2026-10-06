import "server-only";

// UTC date arithmetic on instants. Domain code takes `now` from AppContext; these helpers
// never read the system clock. Calendar-date (YYYY-MM-DD) and time-zone helpers live in
// src/lib/time.ts.

const MINUTE_MS = 60_000;

function shift(date: Date, ms: number): Date {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
  if (!Number.isFinite(ms)) throw new RangeError("Amount must be a finite number");
  return new Date(date.getTime() + ms);
}

/** The storage format for timestamps: `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC). */
export function toIso(date: Date): string {
  return date.toISOString();
}

export function addMinutes(date: Date, minutes: number): Date {
  return shift(date, minutes * MINUTE_MS);
}

export function addHours(date: Date, hours: number): Date {
  return shift(date, hours * 60 * MINUTE_MS);
}

/** Adds whole 24-hour UTC days (no local-time or DST adjustment). */
export function addDays(date: Date, days: number): Date {
  return shift(date, days * 24 * 60 * MINUTE_MS);
}
