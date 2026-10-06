import type { FieldErrors } from "@/lib/validation/request";

// Form state shared by the help-request Server Action and its client form.

export type SupportFormValues = { topic?: string; message?: string; requestId?: string; bookingId?: string };

export type SupportFormState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: FieldErrors;
  /** What was sent, to refill the form after a refusal; empty after a success. */
  values: SupportFormValues;
};

export function initialSupportFormState(values: SupportFormValues = {}): SupportFormState {
  return { ok: false, formError: null, fieldErrors: {}, values };
}
