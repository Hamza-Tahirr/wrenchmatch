// Seed-time clock: every sample date is computed from the moment the seed runs, in the pilot
// region's time zone, so a fresh `npm run db:reset` always yields upcoming preferred dates,
// unexpired quotes and a booking "tomorrow". Day offsets are relative to today's local date.
import { addDaysToDate, todayInZone, weekdayOfDate, zonedDateTimeToUtc } from "@/lib/time";

/** When a seeded event happened: a local time on today + day, or hours before seeding. */
export type SeedTime = { readonly day: number; readonly time: string } | { readonly hoursAgo: number };

export type SeedClock = {
  /** The seeding instant. */
  readonly now: Date;
  /** IANA zone the local dates and times below use (the pilot region's). */
  readonly timeZone: string;
  /** Today's local date, YYYY-MM-DD. */
  readonly today: string;
  /** today + days, YYYY-MM-DD. */
  date(days: number): string;
  /** A local wall-clock time ("HH:mm") on today + days, as a UTC instant. */
  at(days: number, time: string): Date;
  /** A local wall-clock time ("HH:mm") on a YYYY-MM-DD date, as a UTC instant. */
  onDate(date: string, time: string): Date;
  /** The datetime-local value "YYYY-MM-DDTHH:mm" quote commands take. */
  localInput(date: string, time: string): string;
  hoursAgo(hours: number): Date;
  minutesAgo(minutes: number): Date;
  /** The first Monday-Friday date on or after today + days. */
  weekdayOnOrAfter(days: number): string;
  /** The last Monday-Friday date on or before today + days. */
  weekdayOnOrBefore(days: number): string;
  /** The same day of the month one calendar month ago (clamped to that month's length). */
  sameDayLastMonth(): string;
  resolve(time: SeedTime): Date;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SATURDAY = 6;
const SUNDAY = 0;

function isWeekend(date: string): boolean {
  const weekday = weekdayOfDate(date);
  return weekday === SATURDAY || weekday === SUNDAY;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function createSeedClock(now: Date, timeZone: string): SeedClock {
  const today = todayInZone(now, timeZone);
  const date = (days: number) => addDaysToDate(today, days);
  const localInput = (day: string, time: string) => {
    if (!TIME.test(time)) throw new RangeError(`Expected a local time HH:mm, received "${time}"`);
    return `${day}T${time}`;
  };
  // "reject": a seeded time that does not exist (a DST gap) is a data mistake to fix.
  const onDate = (day: string, time: string) =>
    zonedDateTimeToUtc(localInput(day, time), timeZone, { disambiguation: "reject" });

  const at = (days: number, time: string) => onDate(date(days), time);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  return {
    now,
    timeZone,
    today,
    date,
    at,
    onDate,
    localInput,
    hoursAgo,
    minutesAgo: (minutes) => new Date(now.getTime() - minutes * 60_000),
    weekdayOnOrAfter(days) {
      let day = date(days);
      while (isWeekend(day)) day = addDaysToDate(day, 1);
      return day;
    },
    weekdayOnOrBefore(days) {
      let day = date(days);
      while (isWeekend(day)) day = addDaysToDate(day, -1);
      return day;
    },
    sameDayLastMonth() {
      const [year, month, day] = today.split("-").map(Number);
      const previousYear = month === 1 ? year - 1 : year;
      const previousMonth = month === 1 ? 12 : month - 1;
      const clamped = Math.min(day, daysInMonth(previousYear, previousMonth));
      return `${previousYear}-${String(previousMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
    },
    resolve: (time) => ("hoursAgo" in time ? hoursAgo(time.hoursAgo) : at(time.day, time.time)),
  };
}
