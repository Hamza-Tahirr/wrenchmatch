import { describe, expect, it } from "vitest";

import {
  addDaysToDate,
  formatInZone,
  formatMinuteOfDay,
  isValidDateString,
  isValidTimeZone,
  todayInZone,
  toZonedDateTimeInput,
  utcToZonedParts,
  weekdayOfDate,
  zonedDateTimeToUtc,
} from "@/lib/time";

const PHOENIX = "America/Phoenix"; // UTC-7 all year
const NEW_YORK = "America/New_York"; // DST 2026: starts 8 March 02:00, ends 1 November 02:00

const utc = (local: string, zone: string) => zonedDateTimeToUtc(local, zone).toISOString();
// Intl puts a narrow no-break space before AM/PM; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("zonedDateTimeToUtc", () => {
  it("converts Phoenix wall time with a fixed UTC-7 offset all year", () => {
    expect(utc("2026-10-05T10:00", PHOENIX)).toBe("2026-10-05T17:00:00.000Z");
    expect(utc("2026-01-15T23:45", PHOENIX)).toBe("2026-01-16T06:45:00.000Z");
    // 02:30 on the US spring-forward night exists in Phoenix (no DST)
    expect(utc("2026-03-08T02:30", PHOENIX)).toBe("2026-03-08T09:30:00.000Z");
    expect(utc("2026-11-01T01:30", PHOENIX)).toBe("2026-11-01T08:30:00.000Z");
  });

  it("uses the right New York offset on each side of a DST change", () => {
    expect(utc("2026-01-15T09:00", NEW_YORK)).toBe("2026-01-15T14:00:00.000Z"); // EST, UTC-5
    expect(utc("2026-07-15T09:00", NEW_YORK)).toBe("2026-07-15T13:00:00.000Z"); // EDT, UTC-4
  });

  it("handles the spring-forward gap (2026-03-08)", () => {
    expect(utc("2026-03-08T01:59", NEW_YORK)).toBe("2026-03-08T06:59:00.000Z");
    expect(utc("2026-03-08T03:00", NEW_YORK)).toBe("2026-03-08T07:00:00.000Z");
    // 02:30 never happens; it moves forward by the one-hour gap to 03:30 EDT
    expect(utc("2026-03-08T02:30", NEW_YORK)).toBe("2026-03-08T07:30:00.000Z");
    expect(utc("2026-03-08T03:30", NEW_YORK)).toBe("2026-03-08T07:30:00.000Z");
    expect(() =>
      zonedDateTimeToUtc("2026-03-08T02:30", NEW_YORK, { disambiguation: "reject" }),
    ).toThrow(RangeError);
    expect(zonedDateTimeToUtc("2026-03-08T03:30", NEW_YORK, { disambiguation: "reject" }).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("handles the fall-back overlap (2026-11-01)", () => {
    expect(utc("2026-11-01T00:59", NEW_YORK)).toBe("2026-11-01T04:59:00.000Z");
    // 01:30 happens twice; the earlier (EDT) instant is used
    expect(utc("2026-11-01T01:30", NEW_YORK)).toBe("2026-11-01T05:30:00.000Z");
    expect(utc("2026-11-01T01:59", NEW_YORK)).toBe("2026-11-01T05:59:00.000Z");
    expect(utc("2026-11-01T02:00", NEW_YORK)).toBe("2026-11-01T07:00:00.000Z");
  });

  it("accepts optional seconds", () => {
    expect(utc("2026-10-05T10:00:30", PHOENIX)).toBe("2026-10-05T17:00:30.000Z");
  });

  it("rejects malformed values, impossible dates and unknown zones", () => {
    for (const value of ["2026-10-05 10:00", "2026-10-05", "2026-10-05T24:00", "2026-10-05T10:60", "2026-02-30T10:00", "10:00"]) {
      expect(() => zonedDateTimeToUtc(value, PHOENIX), value).toThrow(RangeError);
    }
    expect(() => zonedDateTimeToUtc("2026-10-05T10:00", "Mars/Olympus_Mons")).toThrow(RangeError);
  });
});

describe("utcToZonedParts", () => {
  it("reads the default test clock as Monday 10:00 in Phoenix", () => {
    expect(utcToZonedParts(new Date("2026-10-05T17:00:00.000Z"), PHOENIX)).toEqual({
      year: 2026,
      month: 10,
      day: 5,
      hour: 10,
      minute: 0,
      second: 0,
      weekday: 1,
      date: "2026-10-05",
      time: "10:00",
      minuteOfDay: 600,
    });
  });

  it("reports both readings of the repeated New York hour", () => {
    const edt = utcToZonedParts(new Date("2026-11-01T05:30:00.000Z"), NEW_YORK);
    const est = utcToZonedParts(new Date("2026-11-01T06:30:00.000Z"), NEW_YORK);
    expect([edt.time, est.time]).toEqual(["01:30", "01:30"]);
    expect(est.weekday).toBe(0); // Sunday
  });

  it("round-trips with zonedDateTimeToUtc across the DST change", () => {
    for (const instant of ["2026-03-08T06:59:00.000Z", "2026-03-08T07:00:00.000Z", "2026-11-01T05:59:00.000Z", "2026-11-01T07:00:00.000Z"]) {
      const local = toZonedDateTimeInput(new Date(instant), NEW_YORK);
      expect(zonedDateTimeToUtc(local, NEW_YORK).toISOString()).toBe(instant);
    }
  });
});

describe("calendar dates", () => {
  it("gives today's date in a zone, which can differ from the UTC date", () => {
    const lateEvening = new Date("2026-10-06T06:30:00.000Z");
    expect(todayInZone(lateEvening, PHOENIX)).toBe("2026-10-05"); // 23:30 MST
    expect(todayInZone(lateEvening, NEW_YORK)).toBe("2026-10-06"); // 02:30 EDT
  });

  it("computes the weekday (0 = Sunday)", () => {
    expect(weekdayOfDate("2026-10-05")).toBe(1);
    expect(weekdayOfDate("2026-11-01")).toBe(0);
    expect(weekdayOfDate("2026-10-10")).toBe(6);
    expect(weekdayOfDate("2024-02-29")).toBe(4);
  });

  it("adds days across month, year, leap-day and DST boundaries", () => {
    expect(addDaysToDate("2026-10-05", 2)).toBe("2026-10-07");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDate("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysToDate("2026-10-05", 365)).toBe("2027-10-05");
    expect(() => addDaysToDate("2026-10-05", 1.5)).toThrow(RangeError);
  });

  it("validates YYYY-MM-DD strings", () => {
    expect(isValidDateString("2026-10-05")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    for (const value of ["2026-02-30", "2026-13-01", "2026-1-05", "2026-10-5", "", "0999-01-01", null, 20261005]) {
      expect(isValidDateString(value), String(value)).toBe(false);
    }
    expect(() => weekdayOfDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("formats instants in the given zone with a fixed en-US locale", () => {
    const instant = new Date("2026-10-05T17:00:00.000Z");
    expect(plain(formatInZone(instant, PHOENIX))).toBe("Oct 5, 2026, 10:00 AM");
    expect(plain(formatInZone(instant, NEW_YORK))).toBe("Oct 5, 2026, 1:00 PM");
    expect(
      plain(formatInZone(instant, PHOENIX, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })),
    ).toBe("Mon, 10:00 AM MST");
  });

  it("produces datetime-local input values", () => {
    expect(toZonedDateTimeInput(new Date("2026-10-05T17:05:00.000Z"), PHOENIX)).toBe("2026-10-05T10:05");
  });

  it("labels minutes since midnight", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(480)).toBe("8:00 AM");
    expect(formatMinuteOfDay(720)).toBe("12:00 PM");
    expect(formatMinuteOfDay(1020)).toBe("5:00 PM");
    expect(formatMinuteOfDay(1439)).toBe("11:59 PM");
    expect(formatMinuteOfDay(1440)).toBe("12:00 AM");
    expect(() => formatMinuteOfDay(1441)).toThrow(RangeError);
  });

  it("recognises IANA time zones", () => {
    expect(isValidTimeZone(PHOENIX)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
