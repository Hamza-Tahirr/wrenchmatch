// Validation for the customer's reservation and post-booking forms (client and server).
// Amounts never appear here: prices come only from saved quote items on the server.

import { z } from "zod";

import { BOOKING_CONSENTS } from "@/lib/domain";

import {
  CANCEL_REASON_MAX_LENGTH,
  consentKeysField,
  optionalText,
  parseFormWith,
  recordIdField,
  toInteger,
  type FormParseResult,
} from "./request";

export const DECISION_NOTE_MAX_LENGTH = 500;
export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

// ---------------------------------------------------------------------------------
// Selecting a quote (creates a pending-payment reservation)
// ---------------------------------------------------------------------------------

export const selectQuoteSchema = z.object({
  quoteId: recordIdField("Choose a quote to reserve."),
  acceptedConsentKeys: consentKeysField(
    BOOKING_CONSENTS,
    "Tick all three statements to reserve this quote.",
  ),
});
export type SelectQuoteInput = z.output<typeof selectQuoteSchema>;

export function parseSelectQuoteForm(formData: FormData): FormParseResult<SelectQuoteInput> {
  return parseFormWith(selectQuoteSchema, formData, ["quoteId"], ["acceptedConsentKeys"]);
}

// ---------------------------------------------------------------------------------
// Cancelling a pending reservation
// ---------------------------------------------------------------------------------

export const cancelReservationSchema = z.object({
  bookingId: recordIdField("Choose a reservation to cancel."),
  reason: optionalText(
    CANCEL_REASON_MAX_LENGTH,
    `Keep the reason to ${CANCEL_REASON_MAX_LENGTH} characters or fewer.`,
  ),
});
export type CancelReservationInput = z.output<typeof cancelReservationSchema>;

export function parseCancelReservationForm(formData: FormData): FormParseResult<CancelReservationInput> {
  return parseFormWith(cancelReservationSchema, formData, ["bookingId", "reason"]);
}

// ---------------------------------------------------------------------------------
// Approving or declining a change order
// ---------------------------------------------------------------------------------

export const CHANGE_ORDER_DECISIONS = ["approve", "reject"] as const;
export type ChangeOrderDecision = (typeof CHANGE_ORDER_DECISIONS)[number];

export const changeOrderDecisionSchema = z.object({
  changeOrderId: recordIdField("Choose a change order."),
  decision: z.enum(CHANGE_ORDER_DECISIONS, { error: "Choose whether to approve or decline the extra work." }),
  note: optionalText(
    DECISION_NOTE_MAX_LENGTH,
    `Keep the note to ${DECISION_NOTE_MAX_LENGTH} characters or fewer.`,
  ),
});
export type ChangeOrderDecisionInput = z.output<typeof changeOrderDecisionSchema>;

export function parseChangeOrderDecisionForm(formData: FormData): FormParseResult<ChangeOrderDecisionInput> {
  return parseFormWith(changeOrderDecisionSchema, formData, ["changeOrderId", "decision", "note"]);
}

// ---------------------------------------------------------------------------------
// Reviewing a completed booking
// ---------------------------------------------------------------------------------

const RATING_MESSAGE = `Choose a rating from ${MIN_RATING} to ${MAX_RATING} stars.`;

export const reviewSchema = z.object({
  bookingId: recordIdField("Choose a booking to review."),
  rating: z.preprocess(
    toInteger,
    z
      .number({ error: RATING_MESSAGE })
      .int({ error: RATING_MESSAGE })
      .min(MIN_RATING, { error: RATING_MESSAGE })
      .max(MAX_RATING, { error: RATING_MESSAGE }),
  ),
  comment: optionalText(
    REVIEW_COMMENT_MAX_LENGTH,
    `Keep your review to ${REVIEW_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
  ),
});
export type ReviewInput = z.output<typeof reviewSchema>;

export function parseReviewForm(formData: FormData): FormParseResult<ReviewInput> {
  return parseFormWith(reviewSchema, formData, ["bookingId", "rating", "comment"]);
}
