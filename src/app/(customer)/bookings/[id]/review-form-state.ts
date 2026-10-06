import type { FieldErrors } from "@/lib/validation/request";

// Form state shared by the review Server Action and its client form.

export type ReviewFormState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: FieldErrors;
  /** What was sent, to refill the form after a refusal. */
  values: { rating?: string; comment?: string };
};

export const INITIAL_REVIEW_STATE: ReviewFormState = { ok: false, formError: null, fieldErrors: {}, values: {} };
