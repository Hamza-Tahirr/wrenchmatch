// Form state shared by the login Server Action and its client form. Success always
// redirects, so the action only ever returns a failure state.

export type LoginFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echoed back so the form keeps the email after a failed attempt; never the password. */
  values?: { email: string };
};

export const INITIAL_LOGIN_STATE: LoginFormState = { ok: false };
