// Help / dispute requests raised by customers and mechanics (support_requests, migration
// 0002): topics, labels and the form schema, shared by client and server.

import { z } from "zod";

import type { OptionInfo, StatusInfo } from "@/lib/domain";

import {
  characterCount,
  optionalRecordIdField,
  parseFormWith,
  trimmedString,
  type FormParseResult,
} from "./request";

/** Values match the support_requests.topic CHECK constraint. */
export const SUPPORT_TOPICS = [
  "booking_issue",
  "cancellation",
  "quote_question",
  "dispute",
  "safety",
  "account",
  "other",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_INFO: Readonly<Record<SupportTopic, OptionInfo>> = {
  booking_issue: {
    label: "Problem with a booking",
    description: "Something went wrong with a reservation or a booked job.",
  },
  cancellation: {
    label: "Cancellation",
    description: "Help cancelling, or a question about a cancellation.",
  },
  quote_question: {
    label: "Question about a quote",
    description: "Something in a quote is unclear or looks wrong.",
  },
  dispute: {
    label: "Dispute",
    description: "You disagree with the other party about the work, the price or what was agreed.",
  },
  safety: {
    label: "Safety concern",
    description: "Anything that affected or could affect someone's safety. For emergencies, call 911.",
  },
  account: {
    label: "Account",
    description: "Signing in, your profile, your account details or deleting your account.",
  },
  other: { label: "Something else", description: "Anything not covered above." },
};

export const SUPPORT_STATUSES = ["open", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_STATUS_INFO: Readonly<Record<SupportStatus, StatusInfo>> = {
  open: { label: "Open", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

export const SUPPORT_MESSAGE_MIN_LENGTH = 10;
export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;

export const supportRequestSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS, { error: "Choose what your request is about." }),
  message: z.preprocess(
    (value) => {
      const text = trimmedString(value);
      return typeof text === "string" ? text.replace(/\r\n?/g, "\n") : text;
    },
    z
      .string({ error: "Tell us what happened." })
      .min(1, { error: "Tell us what happened.", abort: true })
      .refine((text) => characterCount(text) >= SUPPORT_MESSAGE_MIN_LENGTH, {
        error: `Add a little more detail: at least ${SUPPORT_MESSAGE_MIN_LENGTH} characters.`,
      })
      .max(SUPPORT_MESSAGE_MAX_LENGTH, {
        error: `Keep your message to ${SUPPORT_MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      }),
  ),
  /** One of the viewer's own repair requests (or, for mechanics, a job they were matched to). */
  requestId: optionalRecordIdField("Choose one of your requests, or leave this empty."),
  /** One of the viewer's own bookings. */
  bookingId: optionalRecordIdField("Choose one of your bookings, or leave this empty."),
});
export type SupportRequestInput = z.output<typeof supportRequestSchema>;

export const SUPPORT_FIELD_LABELS: Readonly<Record<keyof SupportRequestInput, string>> = {
  topic: "Topic",
  message: "Message",
  requestId: "Related request",
  bookingId: "Related booking",
};

export function parseSupportRequestForm(formData: FormData): FormParseResult<SupportRequestInput> {
  return parseFormWith(supportRequestSchema, formData, ["topic", "message", "requestId", "bookingId"]);
}

// ---------------------------------------------------------------------------------
// Account deletion requests (MVP_PLAN section 10)
// ---------------------------------------------------------------------------------

/**
 * First words of the help request that "Request account deletion" sends (topic "account").
 * Nothing is deleted automatically: the help desk confirms with the person and handles it.
 */
export const ACCOUNT_DELETION_MESSAGE =
  "Account deletion request: please delete my WrenchMatch account and the personal data linked to it.";

export const ACCOUNT_DELETION_DETAILS_MAX_LENGTH = 1000;

export const accountDeletionSchema = z.object({
  details: z.preprocess(
    (value) => {
      const text = trimmedString(value);
      if (typeof text !== "string") return text ?? null;
      const normalized = text.replace(/\r\n?/g, "\n");
      return normalized === "" ? null : normalized;
    },
    z
      .string({ error: "Enter text here." })
      .max(ACCOUNT_DELETION_DETAILS_MAX_LENGTH, {
        error: `Keep this to ${ACCOUNT_DELETION_DETAILS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      })
      .nullable(),
  ),
});
export type AccountDeletionInput = z.output<typeof accountDeletionSchema>;

export function parseAccountDeletionForm(formData: FormData): FormParseResult<AccountDeletionInput> {
  return parseFormWith(accountDeletionSchema, formData, ["details"]);
}

/** The deletion request's message: the fixed first line, then anything the person added. */
export function accountDeletionMessage(details: string | null): string {
  return details ? `${ACCOUNT_DELETION_MESSAGE}\n\nMore detail: ${details}` : ACCOUNT_DELETION_MESSAGE;
}

/** Whether a help request is an account deletion request sent from the account page. */
export function isAccountDeletionMessage(topic: string, message: string): boolean {
  return topic === "account" && message.startsWith(ACCOUNT_DELETION_MESSAGE);
}
