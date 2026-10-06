import "server-only";

import { z } from "zod";

import type { ActionResult, FieldErrors, MechanicFormState } from "@/lib/validation/mechanic";
import { isDomainError } from "@/server/errors";
import { domainFieldErrors } from "@/server/mechanic/shared";

// Shared plumbing of the mechanic Server Actions: reading record ids from hidden inputs and
// turning a refused domain command into a form state. Anything that is not a DomainError is
// a bug and is rethrown, so the error boundary shows it instead of a misleading message.

const RECORD_ID = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z-]+$/);

/** A record id from a hidden input, or null when it is missing or malformed. */
export function readId(formData: FormData, name: string): string | null {
  const parsed = RECORD_ID.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

/**
 * The form state for a DomainError: its field errors (keyed by input name) and its message,
 * which is left out when a field error already says the same thing.
 */
export function formFailure<V>(error: unknown, values: V): MechanicFormState<V> {
  if (!isDomainError(error)) throw error;
  const fieldErrors = domainFieldErrors(error);
  const repeated = Object.values(fieldErrors ?? {}).some((messages) => messages.includes(error.userMessage));
  return {
    ok: false,
    code: error.code,
    formError: repeated ? undefined : error.userMessage,
    fieldErrors,
    values,
  };
}

/** The result of a one-click action for a DomainError. */
export function actionFailure(error: unknown): ActionResult {
  if (!isDomainError(error)) throw error;
  return { ok: false, formError: error.userMessage };
}

/** Field errors of two independent checks (form fields and uploads), merged per field. */
export function mergeFieldErrors(...sources: Array<FieldErrors | undefined>): FieldErrors {
  const merged: FieldErrors = {};
  for (const source of sources) {
    for (const [field, messages] of Object.entries(source ?? {})) {
      merged[field] = [...(merged[field] ?? []), ...messages];
    }
  }
  return merged;
}

export const MISSING_RECORD_MESSAGE = "That record wasn't found. Refresh the page and try again.";

export const MISSING_RECORD: ActionResult = { ok: false, formError: MISSING_RECORD_MESSAGE };
