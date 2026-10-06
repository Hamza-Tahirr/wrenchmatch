import "server-only";

import { formatCents, pluralize } from "@/lib/format";
import { formatInZone } from "@/lib/time";
import { APP_NAME, REQUEST_TTL_DAYS } from "@/server/config";
import type { NotifyInput } from "@/server/notifications/notify";

// In-app notification and dev-mailbox copy for customer-domain events. Every notice is also
// captured as a local email (nothing is sent). Bodies carry only coarse request facts
// (category, vehicle, city) and amounts: never phone numbers, emails or exact addresses
// (ARCHITECTURE section 9).

export type Notice = Omit<NotifyInput, "userId" | "at">;

/** The coarse facts every notice may mention. */
export type RequestFacts = {
  requestId: string;
  categoryName: string;
  /** "2016 Toyota Camry" */
  vehicle: string;
  /** The request ZIP's city and state. */
  city: string;
  state: string;
};

export const NO_MATCH_TITLE = "No approved mechanics are available yet - our team has been alerted";

const MAX_QUOTED_TEXT = 160;

function slotLabel(slotStartAt: string, timeZone: string): string {
  return formatInZone(new Date(slotStartAt), timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Free text written by the other party, shortened for a notification body. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_QUOTED_TEXT ? flat : `${flat.slice(0, MAX_QUOTED_TEXT - 1).trimEnd()}…`;
}

/** A notice whose captured email repeats the body, adds `extraLines` and links back. */
function notice(
  fields: { type: string; title: string; body: string; linkPath: string },
  extraLines: readonly string[] = [],
): Notice {
  const text = [fields.body, ...extraLines, "", `Open ${APP_NAME}: ${fields.linkPath}`].join("\n");
  return { ...fields, email: { subject: fields.title, text, template: fields.type.replaceAll(".", "_") } };
}

// ---------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------

/** To the customer, with the actual number of mechanics notified. */
export function requestSubmittedNotice(facts: RequestFacts, matchedCount: number): Notice {
  const linkPath = `/requests/${facts.requestId}`;
  const ttl = pluralize(REQUEST_TTL_DAYS, "day");
  if (matchedCount === 0) {
    const body =
      `No approved mechanic near ${facts.city}, ${facts.state} matches your ${facts.categoryName} request for the ` +
      `${facts.vehicle} right now. Our team has been alerted and will follow up. The request stays open for ${ttl}.`;
    return notice({ type: "request.no_match", title: NO_MATCH_TITLE, body, linkPath });
  }
  const title = `Sent to ${pluralize(matchedCount, "nearby mechanic")}`;
  const body =
    `Your ${facts.categoryName} request for the ${facts.vehicle} went to ${pluralize(matchedCount, "approved mechanic")} ` +
    `near ${facts.city}, ${facts.state}. We'll notify you when quotes arrive. The request stays open for ${ttl}.`;
  return notice({ type: "request.submitted", title, body, linkPath }, [
    "",
    "Your phone, email and exact address are shared only with the mechanic you book, after the booking is confirmed.",
  ]);
}

/** To every admin when a submitted request matched nobody. */
export function noMatchAdminNotice(facts: RequestFacts): Notice {
  const title = "Request needs follow-up: no mechanics matched";
  const body =
    `A ${facts.categoryName} request near ${facts.city}, ${facts.state} matched no approved mechanics. ` +
    "Check the matching diagnostics, re-run matching or invite mechanics, and follow up with the customer.";
  return notice({ type: "admin.request_no_match", title, body, linkPath: `/admin/requests/${facts.requestId}` });
}

/** To each mechanic notified about a request the customer cancelled. */
export function requestCancelledMechanicNotice(facts: RequestFacts, quoteDeclined: boolean): Notice {
  const title = `Request cancelled: ${facts.categoryName} near ${facts.city}`;
  const body =
    `The customer cancelled their ${facts.categoryName} request for a ${facts.vehicle} near ${facts.city}, ${facts.state}.` +
    (quoteDeclined ? " Your quote was declined and the time you offered is free again." : "");
  return notice({ type: "request.cancelled", title, body, linkPath: `/mechanic/jobs/${facts.requestId}` });
}

// ---------------------------------------------------------------------------------
// Quotes and reservations
// ---------------------------------------------------------------------------------

export type QuoteFacts = RequestFacts & {
  totalCents: number;
  currency: string;
  slotStartAt: string;
  timeZone: string;
};

/** To the mechanic whose quote the customer reserved. */
export function quoteReservedMechanicNotice(facts: QuoteFacts): Notice {
  const title = "Customer reserved your quote - awaiting payment (online payments coming soon)";
  const body =
    `A customer reserved your ${formatCents(facts.totalCents, facts.currency)} quote for the ${facts.categoryName} ` +
    `request near ${facts.city}, ${facts.state} (${slotLabel(facts.slotStartAt, facts.timeZone)}). Online payments ` +
    "are coming soon, so the reservation stays pending payment and the customer's contact details stay hidden.";
  return notice({ type: "quote.selected", title, body, linkPath: `/mechanic/jobs/${facts.requestId}` });
}

/** To mechanics whose submitted quotes were declined because another quote was reserved. */
export function quoteDeclinedMechanicNotice(facts: RequestFacts): Notice {
  const title = "Your quote wasn't selected";
  const body =
    `The customer chose another quote for the ${facts.categoryName} request near ${facts.city}, ${facts.state}. ` +
    "The time you offered is free again.";
  return notice({ type: "quote.declined", title, body, linkPath: `/mechanic/jobs/${facts.requestId}` });
}

/** To the customer after reserving a quote. */
export function reservationCreatedCustomerNotice(
  bookingId: string,
  mechanicName: string,
  totalCents: number,
  currency: string,
): Notice {
  const body =
    `You reserved ${mechanicName}'s quote for ${formatCents(totalCents, currency)}. Online payments are coming ` +
    "soon, so the reservation stays pending: it isn't a confirmed booking yet, and contact details stay hidden.";
  return notice(
    { type: "booking.reserved", title: "Reservation created - payment pending", body, linkPath: `/bookings/${bookingId}` },
    ["", "No card details were collected and nothing was charged. You can cancel the reservation from its page."],
  );
}

/** To the mechanic when the customer cancels a pending reservation. */
export function reservationCancelledMechanicNotice(facts: QuoteFacts): Notice {
  const title = `Reservation cancelled: ${facts.categoryName} near ${facts.city}`;
  const body =
    `The customer cancelled their pending reservation for ${slotLabel(facts.slotStartAt, facts.timeZone)}. ` +
    "No payment was taken, and the time you offered is free again.";
  return notice({ type: "booking.cancelled", title, body, linkPath: `/mechanic/jobs/${facts.requestId}` });
}

// ---------------------------------------------------------------------------------
// After a confirmed booking
// ---------------------------------------------------------------------------------

export type ChangeOrderFacts = {
  bookingId: string;
  /** The mechanic's own description of the extra work. */
  description: string;
  amountCents: number;
  currency: string;
};

/** To the mechanic when the customer approves or declines a change order. */
export function changeOrderDecidedMechanicNotice(facts: ChangeOrderFacts, approved: boolean): Notice {
  const amount = formatCents(facts.amountCents, facts.currency);
  const work = excerpt(facts.description);
  const linkPath = `/mechanic/bookings/${facts.bookingId}`;
  if (approved) {
    return notice({
      type: "change_order.approved",
      title: "Change order approved",
      body:
        `The customer approved your ${amount} change order: ${work}. Online payments are coming soon, so nothing ` +
        "has been charged.",
      linkPath,
    });
  }
  return notice({
    type: "change_order.rejected",
    title: "Change order declined",
    body: `The customer declined your ${amount} change order: ${work}. Please don't carry out this extra work.`,
    linkPath,
  });
}

/** To the mechanic when the customer reviews a completed booking. */
export function reviewReceivedMechanicNotice(bookingId: string, rating: number, isDemoFixture: boolean): Notice {
  return notice({
    type: "review.received",
    title: `New review: ${pluralize(rating, "star")}`,
    body: isDemoFixture
      ? "A customer reviewed a completed booking. It doesn't count toward your rating yet: only reviews of paid jobs count, and online payments are coming soon."
      : "A customer reviewed a completed job. It now counts toward your rating.",
    linkPath: `/mechanic/bookings/${bookingId}`,
  });
}
