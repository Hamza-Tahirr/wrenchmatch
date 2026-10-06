// Display helpers of the mechanic pages, safe in Server and Client Components. Times are
// always shown in the record's own IANA time zone (the request's), never the browser's.

import type { RequestServiceMode } from "@/lib/domain";
import { formatMiles } from "@/lib/format";
import { formatInZone, utcToZonedParts } from "@/lib/time";

const DAY: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const TIME_WITH_ZONE: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };

/** "Wed, Oct 7, 2026 · 8:00 AM – 9:30 AM MST" (both days shown when the slot crosses midnight). */
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

/** 90 -> "1 hr 30 min", 45 -> "45 min", 120 -> "2 hr". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Durations offered by the quote form, in minutes (15 minutes to a full day). */
export const DURATION_CHOICES = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720, 1440] as const;

/** What the customer asked for, worded for the mechanic. */
export function requestModeText(mode: RequestServiceMode, maxGarageDistanceMiles?: number): string {
  switch (mode) {
    case "mobile":
      return "Mobile: you go to the customer";
    case "garage":
      return maxGarageDistanceMiles
        ? `Garage: the customer drives up to ${maxGarageDistanceMiles} mi`
        : "Garage: the customer brings the car";
    case "either":
      return "Mobile or garage: either works for the customer";
  }
}

/** "Phoenix, AZ 85004 · about 6 mi away" */
export function areaWithDistance(areaLabel: string, distanceMiles: number): string {
  return `${areaLabel} · ${formatMiles(distanceMiles)} away`;
}

/** Labels of quote, booking and invoice line kinds. */
export const LINE_KIND_LABELS: Readonly<Record<string, string>> = {
  labor: "Labor",
  part: "Part",
  tax: "Tax",
  fee: "Fee",
};
