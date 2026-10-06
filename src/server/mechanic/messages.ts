import "server-only";

import { DOCUMENT_KIND_INFO, type DocumentKind } from "@/lib/domain";
import { formatCents, pluralize } from "@/lib/format";
import { APP_NAME } from "@/server/config";
import type { NotifyInput } from "@/server/notifications/notify";

import { excerpt } from "./labels";

// In-app notification and dev-mailbox copy for events caused by mechanics. Customers see the
// mechanic's public display name only; admins get links to their review screens. Bodies never
// contain phone numbers, emails or exact addresses.

export type Message = Omit<NotifyInput, "userId" | "at">;

function message(type: string, title: string, body: string, linkPath: string, extraEmailLines: string[] = []): Message {
  const text = [body, ...extraEmailLines, "", `Open ${APP_NAME}: ${linkPath}`].join("\n");
  return { type, title, body, linkPath, email: { subject: title, text, template: type.replace(".", "_") } };
}

// ---------------------------------------------------------------------------------
// Applications (to admins and the applicant)
// ---------------------------------------------------------------------------------

export type ApplicationMessageInput = {
  mechanicId: string;
  displayName: string;
  baseZip: string;
  /** "Phoenix, AZ" */
  baseArea: string;
  serviceCount: number;
  /** Names of safety-sensitive categories waiting for an admin safety review. */
  safetyReviewNames: string[];
};

function applicationBody(input: ApplicationMessageInput, opening: string): string {
  const safety =
    input.safetyReviewNames.length > 0 ? ` Safety review needed for: ${input.safetyReviewNames.join(", ")}.` : "";
  return (
    `${opening} (base ZIP ${input.baseZip}, ${input.baseArea}; ${pluralize(input.serviceCount, "service")}).` +
    `${safety} Review the documents, then approve or reject the application.`
  );
}

export function applicationSubmittedMessage(input: ApplicationMessageInput): Message {
  return message(
    "mechanic.application_submitted",
    `New mechanic application: ${input.displayName}`,
    applicationBody(input, `${input.displayName} applied to join ${APP_NAME}`),
    `/admin/mechanics/${input.mechanicId}`,
  );
}

export function applicationResubmittedMessage(input: ApplicationMessageInput): Message {
  return message(
    "mechanic.application_resubmitted",
    `Application resubmitted: ${input.displayName}`,
    applicationBody(input, `${input.displayName} updated and resubmitted their rejected application`),
    `/admin/mechanics/${input.mechanicId}`,
  );
}

export function applicationReceivedMessage(displayName: string): Message {
  return {
    type: "mechanic.application_received",
    title: "Application received",
    body: `Thanks, ${displayName}. An admin will review your application and documents. You'll get a notification when it's decided; until then you won't receive jobs.`,
    linkPath: "/mechanic/profile",
  };
}

export function documentUploadedMessage(input: { mechanicId: string; displayName: string; kind: DocumentKind }): Message {
  const kind = DOCUMENT_KIND_INFO[input.kind].label;
  return {
    type: "mechanic.document_uploaded",
    title: `${input.displayName} uploaded a document`,
    body: `${kind} uploaded for review by ${input.displayName}.`,
    linkPath: `/admin/mechanics/${input.mechanicId}`,
  };
}

// ---------------------------------------------------------------------------------
// Quotes (to the request's customer)
// ---------------------------------------------------------------------------------

export type QuoteMessageInput = {
  requestId: string;
  mechanicName: string;
  vehicle: string;
  categoryName: string;
  totalCents: number;
};

export function quoteReceivedMessage(input: QuoteMessageInput & { slotText: string; expiresText: string }): Message {
  return message(
    "quote.received",
    `New quote for your ${input.vehicle}`,
    `${input.mechanicName} quoted ${formatCents(input.totalCents)} for ${input.categoryName}. ` +
      `Earliest time offered: ${input.slotText}. The quote is valid until ${input.expiresText}.`,
    `/requests/${input.requestId}`,
    ["", "Compare the itemized quotes on your request page. Contact details are shared only after a confirmed booking."],
  );
}

export function quoteWithdrawnMessage(input: QuoteMessageInput & { remainingQuotes: number }): Message {
  const rest =
    input.remainingQuotes > 0
      ? ` You still have ${pluralize(input.remainingQuotes, "quote")} to compare.`
      : " Your request stays open for new quotes until it expires.";
  return message(
    "quote.withdrawn",
    `A quote for your ${input.vehicle} was withdrawn`,
    `${input.mechanicName} withdrew their ${formatCents(input.totalCents)} quote for ${input.categoryName}.${rest}`,
    `/requests/${input.requestId}`,
  );
}

// ---------------------------------------------------------------------------------
// Bookings (to the booking's customer)
// ---------------------------------------------------------------------------------

export type BookingMessageInput = {
  bookingId: string;
  mechanicName: string;
  vehicle: string;
  categoryName: string;
  /** Internal flag only: notification copy is the same for seeded and real bookings. */
  isDemoFixture: boolean;
};

export function bookingStartedMessage(input: BookingMessageInput): Message {
  return message(
    "booking.started",
    `Work has started on your ${input.vehicle}`,
    `${input.mechanicName} started the ${input.categoryName} job.`,
    `/bookings/${input.bookingId}`,
  );
}

export function bookingCompletedMessage(input: BookingMessageInput): Message {
  return message(
    "booking.completed",
    `Your ${input.categoryName} job is complete`,
    `${input.mechanicName} marked the job on your ${input.vehicle} complete. The final invoice follows, and you can leave a review.`,
    `/bookings/${input.bookingId}`,
  );
}

export function changeOrderProposedMessage(
  input: BookingMessageInput & { description: string; amountCents: number },
): Message {
  return message(
    "change_order.proposed",
    `Approval needed: extra work on your ${input.vehicle}`,
    `${input.mechanicName} proposed extra work: ${excerpt(input.description, 120)} (${formatCents(input.amountCents)}). ` +
      "Nothing extra is done or charged unless you approve it.",
    `/bookings/${input.bookingId}`,
  );
}

export function changeOrderWithdrawnMessage(
  input: BookingMessageInput & { description: string; amountCents: number },
): Message {
  return message(
    "change_order.withdrawn",
    `Change order withdrawn for your ${input.vehicle}`,
    `${input.mechanicName} withdrew the proposed extra work (${excerpt(input.description, 120)}, ${formatCents(input.amountCents)}). No decision is needed.`,
    `/bookings/${input.bookingId}`,
  );
}

export function invoiceIssuedMessage(input: BookingMessageInput & { invoiceNumber: string; totalCents: number }): Message {
  const payment = " Nothing is charged online: online payments are coming soon.";
  return message(
    "invoice.issued",
    `Invoice ${input.invoiceNumber} for your ${input.vehicle}`,
    `${input.mechanicName} issued the final invoice for the ${input.categoryName} job: ${formatCents(input.totalCents)}.${payment}`,
    `/bookings/${input.bookingId}`,
  );
}
