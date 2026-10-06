"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getClientIp } from "@/server/auth/client-ip";
import { DEMO_ACCOUNTS } from "@/server/auth/demo-accounts";
import {
  ACCOUNT_DISABLED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  logIn,
  logInDemoAccount,
  type LoginResult,
} from "@/server/auth/login";
import { rateLimitMessage } from "@/server/auth/rate-limit";
import { postLoginPath, sanitizeNextPath } from "@/server/auth/redirects";
import { clearSessionCookie, deleteSession, readSessionCookie, replaceSessionCookie } from "@/server/auth/session";
import { fieldErrorsOf, loginSchema } from "@/server/auth/validation";
import { DEMO_MODE } from "@/server/config";
import { createAppContext } from "@/server/context";
import type { LoginFormState } from "./form-state";
import { isLocalHost } from "./local-host";

const MAX_ECHOED_EMAIL_LENGTH = 254;

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function failureMessage(result: Exclude<LoginResult, { ok: true }>): string {
  switch (result.reason) {
    case "invalid_credentials":
      return INVALID_CREDENTIALS_MESSAGE;
    case "rate_limited":
      return rateLimitMessage("login_email", result.retryAfterMinutes);
    case "account_disabled":
      return ACCOUNT_DISABLED_MESSAGE;
  }
}

/** Logs in with email and password, then redirects by role (or to a safe "next" path). */
export async function loginAction(_previous: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const values = { email: textValue(formData.get("email")).trim().slice(0, MAX_ECHOED_EMAIL_LENGTH) };
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), values };

  const ctx = createAppContext();
  const result = await logIn(ctx, { ...parsed.data, ip: await getClientIp() });
  if (!result.ok) return { ok: false, formError: failureMessage(result), values };

  await replaceSessionCookie(ctx, result.token);
  redirect(postLoginPath(result.viewer.role, formData.get("next")));
}

/**
 * DEMO_MODE only: one-click login as a listed sample account, for requests to localhost only;
 * any other email is ignored. It signs in with the documented shared password through
 * logInDemoAccount (disabled accounts and sessions as usual), so it guesses nothing and the
 * failed-login limits never block it. Typed logins (loginAction) keep counting failures.
 */
export async function demoLoginAction(formData: FormData): Promise<void> {
  const email = textValue(formData.get("email"));
  // Sample accounts include the admin, so one-click login only works on this computer: a
  // shared link, LAN address or tunnel (a different Host) never gets it.
  const local = isLocalHost((await headers()).get("host"));
  const account = DEMO_MODE && local ? DEMO_ACCOUNTS.find((candidate) => candidate.email === email) : undefined;
  const next = sanitizeNextPath(textValue(formData.get("next")));
  const back = next ? `/login?next=${encodeURIComponent(next)}&` : "/login?";
  if (!account) redirect(back.slice(0, -1));

  const ctx = createAppContext();
  const result = await logInDemoAccount(ctx, { email: account.email });
  if (!result.ok) redirect(`${back}sample_error=${result.reason}`);

  await replaceSessionCookie(ctx, result.token);
  redirect(postLoginPath(result.viewer.role, next));
}

/** Ends the current session (database row and cookie) and returns to the home page. */
export async function logoutAction(): Promise<void> {
  const ctx = createAppContext();
  await deleteSession(ctx, await readSessionCookie());
  await clearSessionCookie();
  redirect("/");
}
