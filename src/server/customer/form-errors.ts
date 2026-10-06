import "server-only";

import type { FieldErrors } from "@/lib/validation/request";
import { DomainError, isDomainError, type DomainErrorCode } from "@/server/errors";

// Domain commands report field-level problems (a ZIP outside the pilot, a disabled category)
// as DomainErrors with `details.fieldErrors`, so Server Actions can show them inline:
//
//   try {
//     await selectQuote(ctx, viewer, parsed.data);
//   } catch (error) {
//     return formFailure(error, values); // rethrows anything that isn't a DomainError
//   }
//   redirect(`/bookings/${bookingId}`);

/** A DomainError (default "invalid_input") carrying field errors keyed by form field name. */
export function invalidFields(
  fieldErrors: FieldErrors,
  options: { message?: string; code?: DomainErrorCode } = {},
): DomainError {
  const first = Object.values(fieldErrors).find((messages) => messages.length > 0)?.[0];
  const message = options.message ?? first ?? "Check the highlighted fields and try again.";
  return new DomainError(options.code ?? "invalid_input", message, { fieldErrors });
}

/** A failed form submission, in the shape the UI's useActionState forms render. */
export type FormFailure<Values> = {
  ok: false;
  /** About the whole form (a rate limit, a conflict...); null when the field errors say it all. */
  formError: string | null;
  fieldErrors: FieldErrors;
  /** What was submitted, to refill the form (file inputs can't be refilled). */
  values: Values;
};

/**
 * The FormFailure for a DomainError thrown by a domain command: its field errors, or its
 * message as the form error. Anything else (a bug, an outage, Next's redirect) is rethrown.
 */
export function formFailure<Values>(error: unknown, values: Values): FormFailure<Values> {
  if (!isDomainError(error)) throw error;
  const fieldErrors = fieldErrorsOf(error);
  return { ok: false, formError: fieldErrors ? null : error.userMessage, fieldErrors: fieldErrors ?? {}, values };
}

/** The field errors carried by a DomainError, if any. */
export function fieldErrorsOf(error: unknown): FieldErrors | undefined {
  if (!(error instanceof DomainError)) return undefined;
  const value: unknown = error.details?.fieldErrors;
  if (!value || typeof value !== "object") return undefined;
  const result: FieldErrors = {};
  for (const [field, messages] of Object.entries(value)) {
    if (!Array.isArray(messages)) continue;
    const strings = messages.filter((message): message is string => typeof message === "string");
    if (strings.length > 0) result[field] = strings;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
