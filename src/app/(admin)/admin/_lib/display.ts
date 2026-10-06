// Display helpers for the admin pages (safe for server and client components).

import {
  MECHANIC_SERVICE_MODE_INFO,
  PREFERRED_WINDOW_INFO,
  QUOTE_SERVICE_MODE_INFO,
  type MechanicServiceMode,
  type PreferredWindow,
  type QuoteServiceMode,
  type RequestServiceMode,
} from "@/lib/domain";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatInZone } from "@/lib/time";

const REQUEST_MODE_LABELS: Readonly<Record<RequestServiceMode, string>> = {
  mobile: "Mobile",
  garage: "Garage",
  either: "Mobile or garage",
};

/** "Mobile", "Garage" or "Mobile or garage" (what the customer asked for). */
export function requestModeLabel(mode: RequestServiceMode): string {
  return REQUEST_MODE_LABELS[mode];
}

export function mechanicModeLabel(mode: MechanicServiceMode): string {
  return MECHANIC_SERVICE_MODE_INFO[mode].label;
}

export function quoteModeLabel(mode: QuoteServiceMode): string {
  return QUOTE_SERVICE_MODE_INFO[mode].label;
}

/** "Morning (8 AM–12 PM)" */
export function windowLabel(window: PreferredWindow): string {
  const info = PREFERRED_WINDOW_INFO[window];
  return `${info.label} (${info.hours})`;
}

/** "Oct 6, 2026 · Morning (8 AM–12 PM)" */
export function preferredTimeLabel(date: string, window: PreferredWindow): string {
  return `${formatDate(date)} · ${windowLabel(window)}`;
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const TIME_WITH_ZONE: Intl.DateTimeFormatOptions = { ...TIME_FORMAT, timeZoneName: "short" };

/** "Tue, Oct 6, 2026, 10:00 AM–11:30 AM MST" for a same-day slot, otherwise two full timestamps. */
export function slotLabel(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = formatInZone(start, timeZone, DAY_FORMAT);
  if (day !== formatInZone(end, timeZone, DAY_FORMAT)) {
    return `${formatDateTime(startIso, timeZone)} – ${formatDateTime(endIso, timeZone)}`;
  }
  return `${day}, ${formatInZone(start, timeZone, TIME_FORMAT)}–${formatInZone(end, timeZone, TIME_WITH_ZONE)}`;
}

/** "1 h 30 min", "45 min", "2 h" */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "in 2 days"; past a week, the date. */
export function relativeTime(iso: string, now: Date, timeZone?: string): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return iso;
  const size = Math.abs(elapsed);
  const sign = elapsed >= 0 ? -1 : 1;
  if (size < MINUTE) return elapsed >= 0 ? "just now" : "in under a minute";
  if (size < HOUR) return relative.format(sign * Math.floor(size / MINUTE), "minute");
  if (size < DAY) return relative.format(sign * Math.floor(size / HOUR), "hour");
  if (size < 7 * DAY) return relative.format(sign * Math.floor(size / DAY), "day");
  return formatDate(iso, timeZone);
}

/** "4.5 / 5" or "New" (no genuine reviews). */
export function ratingLabel(average: number | null, count: number): string {
  if (average === null || count === 0) return "New";
  return `${average.toFixed(1)} / 5 from ${count} ${count === 1 ? "review" : "reviews"}`;
}

export type QueryValue = string | number | boolean | null | undefined;

/**
 * `base` plus the given query parameters, leaving out empty values, `false` and page 1:
 * withQuery("/admin/requests", { status: "active", page: 1 }) → "/admin/requests?status=active".
 */
export function withQuery(base: string, params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false || value === "") continue;
    if (key === "page" && Number(value) <= 1) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/** "Mechanic", "Customer", "Admin", "System" */
export function roleLabel(role: string): string {
  return role ? role[0].toUpperCase() + role.slice(1) : role;
}

/**
 * "Marco R. (Mechanic)"; "System" for automatic events; a name that already says its role,
 * like the seeded "Avery (Admin)", is shown as it is.
 */
export function actorLabel(actor: { displayName: string; role: string }): string {
  if (actor.role === "system") return actor.displayName;
  const role = roleLabel(actor.role);
  return actor.displayName.toLowerCase().includes(`(${role.toLowerCase()})`) ? actor.displayName : `${actor.displayName} (${role})`;
}

/**
 * Captured email template names for people: "mechanic_invite" → "mechanic invite". Older
 * internal names that described seeded test data read without that word.
 */
export function templateLabel(template: string): string {
  return template
    .replaceAll("_", " ")
    .replace(/\bdemo\b\s*/gi, "")
    .trim();
}
