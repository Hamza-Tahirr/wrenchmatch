import "server-only";

import { z } from "zod";

import { SIGNUP_ROLES } from "./redirects";

// Form schemas for the login and signup Server Actions. Messages are written for the
// person filling in the form; FormData values arrive as strings, File objects or null.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 60;
const EMAIL_MAX_LENGTH = 254;
// The longest password the login form passes on (longer ones simply fail to match).
const LOGIN_PASSWORD_MAX_LENGTH = 1024;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const emailField = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter your email address." })
  .max(EMAIL_MAX_LENGTH, { error: `Enter an email address of ${EMAIL_MAX_LENGTH} characters or fewer.` })
  .pipe(z.email({ error: "Enter a valid email address, like name@example.com." }));

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ error: "Enter your password." })
    .min(1, { error: "Enter your password." })
    .max(LOGIN_PASSWORD_MAX_LENGTH, { error: "Email or password is incorrect." }),
});

export type LoginFields = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    role: z.enum(SIGNUP_ROLES, { error: "Choose whether you are signing up as a customer or a mechanic." }),
    displayName: z
      .string({ error: "Enter your name." })
      .trim()
      .min(1, { error: "Enter your name." })
      .max(DISPLAY_NAME_MAX_LENGTH, {
        error: `Keep your name to ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
      })
      .refine((value) => !CONTROL_CHARACTERS.test(value), { error: "Remove special control characters from your name." }),
    email: emailField,
    password: z
      .string({ error: "Create a password." })
      .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.` })
      .max(PASSWORD_MAX_LENGTH, { error: `Use ${PASSWORD_MAX_LENGTH} characters or fewer for your password.` }),
    confirmPassword: z.string({ error: "Enter your password again." }),
    acceptTerms: z.literal("on", {
      error: "Accept the terms and privacy notice to create an account.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "The passwords don't match. Enter the same password twice.",
  });

export type SignupFields = z.infer<typeof signupSchema>;

/** Field errors keyed by field name, for useActionState form states. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const { fieldErrors } = z.flattenError(error);
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) result[field] = messages;
  }
  return result;
}
