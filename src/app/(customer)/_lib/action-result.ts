import "server-only";

import type { FieldErrors } from "@/lib/validation/request";
import { isDomainError } from "@/server/errors";

// Shared plumbing of the customer Server Actions. A refused domain command becomes a
// message the form or dialog shows; anything that isn't a DomainError (a bug, an outage,
// Next's redirect) is rethrown so the error boundary handles it instead of a vague message.

/** The result of a one-click or dialog action (ConfirmDialog keeps itself open on `ok: false`). */
export type ActionResult = { ok: true } | { ok: false; formError: string };

export function actionFailure(error: unknown): ActionResult {
  if (!isDomainError(error)) throw error;
  return { ok: false, formError: error.userMessage };
}

/** The first message of a failed parse, for actions that show a single message. */
export function firstFieldError(fieldErrors: FieldErrors, fallback: string): string {
  return Object.values(fieldErrors).find((messages) => messages.length > 0)?.[0] ?? fallback;
}

export const STALE_FORM_MESSAGE = "That form is out of date. Refresh the page and try again.";
