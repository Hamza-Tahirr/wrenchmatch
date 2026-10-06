"use server";

import { redirect } from "next/navigation";

import { getClientIp } from "@/server/auth/client-ip";
import { postSignupPath } from "@/server/auth/redirects";
import { replaceSessionCookie } from "@/server/auth/session";
import { DUPLICATE_EMAIL_MESSAGE, isDuplicateEmailError, signUp, type SignUpResult } from "@/server/auth/signup";
import { fieldErrorsOf, signupSchema } from "@/server/auth/validation";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import type { SignupFormState, SignupFormValues } from "./form-state";

function textValue(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

/**
 * Creates a customer or mechanic account, logs it in and redirects: customers to the
 * safe "next" path or /request, mechanics to /mechanic/apply. Never creates an admin.
 */
export async function signupAction(_previous: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const values: SignupFormValues = {
    role: textValue(formData.get("role"), 20),
    displayName: textValue(formData.get("displayName"), 100),
    email: textValue(formData.get("email"), 254).trim(),
    acceptTerms: formData.get("acceptTerms") === "on",
  };
  const parsed = signupSchema.safeParse({
    role: formData.get("role"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), values };

  const ctx = createAppContext();
  let result: SignUpResult;
  try {
    result = await signUp(ctx, {
      role: parsed.data.role,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      password: parsed.data.password,
      ip: await getClientIp(),
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return { ok: false, fieldErrors: { email: [DUPLICATE_EMAIL_MESSAGE] }, values };
    }
    if (isDomainError(error)) return { ok: false, formError: error.userMessage, values };
    throw error;
  }

  await replaceSessionCookie(ctx, result.token);
  redirect(postSignupPath(parsed.data.role, formData.get("next")));
}
