// Form state shared by the signup Server Action and its client form. Success always
// redirects, so the action only ever returns a failure state.

export type SignupFormValues = {
  role: string;
  displayName: string;
  email: string;
  acceptTerms: boolean;
};

export type SignupFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echoed back so a failed submit keeps what was typed; passwords are never echoed. */
  values?: SignupFormValues;
};

export const INITIAL_SIGNUP_STATE: SignupFormState = { ok: false };
