import type { FieldErrors } from "@/lib/validation/request";

// Form state shared by the reserve Server Action and its client form. Success always
// redirects to the new reservation, so the action only ever returns a refusal.

export type ReserveFormState = {
  ok: false;
  /** The DomainError code when the server refused (quote_expired, mechanic_not_eligible, conflict...). */
  code: string | null;
  formError: string | null;
  fieldErrors: FieldErrors;
  /** The consents that were ticked, to tick them again. */
  acceptedConsentKeys: string[];
};

export const INITIAL_RESERVE_STATE: ReserveFormState = {
  ok: false,
  code: null,
  formError: null,
  fieldErrors: {},
  acceptedConsentKeys: [],
};
