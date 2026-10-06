import "server-only";

import type { BadgeTone, BookingStatus, QuoteStatus, RequestStatus } from "@/lib/domain";
import { formatCents, pluralize } from "@/lib/format";
import { REQUEST_TTL_DAYS } from "@/server/config";

// The request page's history, derived from stored timestamps (no extra event table):
// submission and matching, quotes received / withdrawn / expired, the reservation and,
// for confirmed bookings (seeded fixtures while payments are off), the booking's progress.
// Presentation mode: no "demo" wording, and nothing is ever described as paid.

export type RequestTimelineKind =
  | "submitted"
  | "matched"
  | "no_match"
  | "quote_received"
  | "quote_withdrawn"
  | "quote_expired"
  | "reserved"
  | "booking_confirmed"
  | "work_started"
  | "work_completed"
  | "booking_cancelled"
  | "request_cancelled"
  | "request_expired";

export type RequestTimelineEvent = {
  /** Stable key for lists. */
  id: string;
  kind: RequestTimelineKind;
  /** UTC ISO time; show it in the request's time zone. */
  at: string;
  title: string;
  detail: string | null;
  tone: BadgeTone;
};

export type TimelineInput = {
  /** Effective status. */
  status: RequestStatus;
  submittedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  /** Notification batches from job_matches, oldest first. */
  matchBatches: readonly { notifiedAt: string; count: number }[];
  quotes: readonly {
    id: string;
    mechanicName: string;
    /** Effective status. */
    status: QuoteStatus;
    quotedAt: string;
    withdrawnAt: string | null;
    expiresAt: string;
    totalCents: number;
    currency: string;
  }[];
  booking: {
    id: string;
    status: BookingStatus;
    mechanicName: string;
    isDemoFixture: boolean;
    createdAt: string;
    confirmedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  } | null;
};

export function buildRequestTimeline(input: TimelineInput): RequestTimelineEvent[] {
  const events: RequestTimelineEvent[] = [];
  const add = (event: RequestTimelineEvent) => events.push(event);

  if (input.submittedAt) {
    add({ id: "submitted", kind: "submitted", at: input.submittedAt, title: "Request sent", detail: null, tone: "info" });
    if (input.matchBatches.length === 0) {
      add({
        id: "no-match",
        kind: "no_match",
        at: input.submittedAt,
        title: "No approved mechanics are available yet",
        detail: "Our team has been alerted and will follow up.",
        tone: "warning",
      });
    }
  }
  input.matchBatches.forEach((batch, index) =>
    add({
      id: `matched-${index}`,
      kind: "matched",
      at: batch.notifiedAt,
      title:
        index === 0
          ? `Sent to ${pluralize(batch.count, "nearby mechanic")}`
          : `Sent to ${pluralize(batch.count, "more mechanic")}`,
      detail: null,
      tone: "info",
    }),
  );

  for (const quote of input.quotes) {
    add({
      id: `quote-${quote.id}`,
      kind: "quote_received",
      at: quote.quotedAt,
      title: `Quote received from ${quote.mechanicName}`,
      detail: formatCents(quote.totalCents, quote.currency),
      tone: "info",
    });
    if (quote.status === "withdrawn" && quote.withdrawnAt) {
      add({
        id: `quote-withdrawn-${quote.id}`,
        kind: "quote_withdrawn",
        at: quote.withdrawnAt,
        title: `${quote.mechanicName} withdrew their quote`,
        detail: null,
        tone: "neutral",
      });
    }
    if (quote.status === "expired") {
      const requestEnd = input.expiresAt && input.expiresAt < quote.expiresAt ? input.expiresAt : quote.expiresAt;
      add({
        id: `quote-expired-${quote.id}`,
        kind: "quote_expired",
        at: requestEnd,
        title: `${quote.mechanicName}'s quote expired`,
        detail: null,
        tone: "neutral",
      });
    }
  }

  const booking = input.booking;
  if (booking) {
    add({
      id: `reserved-${booking.id}`,
      kind: "reserved",
      at: booking.createdAt,
      title: booking.isDemoFixture
        ? `Booked with ${booking.mechanicName}`
        : `You reserved ${booking.mechanicName}'s quote`,
      detail: booking.isDemoFixture
        ? "Online payments are coming soon, so nothing was charged."
        : "Payment pending: online payments are coming soon, so this reservation isn't confirmed yet.",
      tone: booking.isDemoFixture ? "info" : "warning",
    });
    const progress: [string | null, RequestTimelineKind, string][] = [
      [booking.confirmedAt, "booking_confirmed", "Booking confirmed"],
      [booking.startedAt, "work_started", "Work started"],
      [booking.completedAt, "work_completed", "Work completed"],
      [booking.cancelledAt, "booking_cancelled", booking.confirmedAt ? "Booking cancelled" : "Reservation cancelled"],
    ];
    for (const [at, kind, title] of progress) {
      if (!at) continue;
      const tone: BadgeTone = kind === "booking_cancelled" ? "neutral" : "success";
      add({ id: `${kind}-${booking.id}`, kind, at, title, detail: null, tone });
    }
  }

  if (input.status === "cancelled" && !booking?.cancelledAt) {
    add({
      id: "request-cancelled",
      kind: "request_cancelled",
      at: input.updatedAt,
      title: "You cancelled this request",
      detail: null,
      tone: "neutral",
    });
  }
  if (input.status === "expired" && input.expiresAt) {
    add({
      id: "request-expired",
      kind: "request_expired",
      at: input.expiresAt,
      title: "Request expired",
      detail: `Requests stay open for ${pluralize(REQUEST_TTL_DAYS, "day")}.`,
      tone: "neutral",
    });
  }

  // Stable sort: events at the same instant keep the order they were added in.
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.at < b.event.at ? -1 : a.event.at > b.event.at ? 1 : a.index - b.index))
    .map(({ event }) => event);
}
