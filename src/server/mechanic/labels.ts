import "server-only";

import {
  PREFERRED_WINDOW_INFO,
  type BadgeTone,
  type BookingStatus,
  type PreferredWindow,
  type RequestStatus,
  type StatusInfo,
} from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { weekdayOfDate } from "@/lib/time";

// Display text shared by the mechanic DTOs. Everything here is derived from coarse request
// fields only; no contact details or exact addresses.

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function vehicleLabel(year: number, make: string, model: string): string {
  return `${year} ${make} ${model}`;
}

/** The first `max` characters of a description, cut at a word boundary, with an ellipsis. */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** "Wed, Oct 7, 2026 · Morning (8 AM–12 PM)" or "Wed, Oct 7, 2026 · Flexible (any time that week)". */
export function preferredTimeLabel(preferredDate: string, preferredWindow: PreferredWindow): string {
  const day = `${WEEKDAY_SHORT[weekdayOfDate(preferredDate)]}, ${formatDate(preferredDate)}`;
  const info = PREFERRED_WINDOW_INFO[preferredWindow];
  return `${day} · ${info.label} (${preferredWindow === "flexible" ? "any time that week" : info.hours})`;
}

/** The zone's abbreviation or name at `at`, e.g. "MST" or "Mountain Standard Time". */
export function timeZoneName(at: Date, timeZone: string, style: "short" | "long" = "short"): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style })
    .formatToParts(at)
    .find((entry) => entry.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Request statuses that still accept quotes (before the request's expires_at). */
export function isRequestOpenForQuotes(status: RequestStatus, expiresAt: string | null, nowIso: string): boolean {
  return (status === "open" || status === "quoted") && expiresAt !== null && expiresAt > nowIso;
}

/**
 * A request's status as a matched mechanic may see it. Another mechanic's reservation, a
 * cancellation and an expiry all read "No longer available": nobody else is ever named.
 */
export type JobAvailability = "open" | "quoted_by_you" | "selected_pending_payment" | "booked_with_you" | "unavailable";

export const JOB_AVAILABILITY_INFO: Readonly<Record<JobAvailability, StatusInfo>> = {
  open: { label: "Open", tone: "info" },
  quoted_by_you: { label: "Quoted by you", tone: "success" },
  selected_pending_payment: { label: "You were selected · payment pending", tone: "warning" },
  booked_with_you: { label: "Booked with you", tone: "success" },
  unavailable: { label: "No longer available", tone: "neutral" },
};

export type JobAvailabilityInput = {
  requestStatus: RequestStatus;
  requestExpiresAt: string | null;
  nowIso: string;
  /** True when this mechanic has a submitted, unexpired quote on the request. */
  hasActiveQuote: boolean;
  /** Status of the request's booking when it is with this mechanic, else null. */
  myBookingStatus: BookingStatus | null;
};

export function jobAvailability(input: JobAvailabilityInput): JobAvailability {
  if (input.myBookingStatus !== null) {
    if (input.myBookingStatus === "pending_payment") return "selected_pending_payment";
    return input.myBookingStatus === "cancelled" ? "unavailable" : "booked_with_you";
  }
  if (!isRequestOpenForQuotes(input.requestStatus, input.requestExpiresAt, input.nowIso)) return "unavailable";
  return input.hasActiveQuote ? "quoted_by_you" : "open";
}

export function availabilityInfo(availability: JobAvailability): { label: string; tone: BadgeTone } {
  return JOB_AVAILABILITY_INFO[availability];
}
