import "server-only";

import { randomBytes } from "node:crypto";

import type { AppContext, Viewer } from "@/server/context";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./demo-accounts";
import { hashPassword, verifyPassword } from "./password";
import { isUserRole } from "./redirects";
import {
  checkRateLimit,
  clearRateLimit,
  deleteExpiredRateLimits,
  recordFailure,
  type RateLimitResult,
} from "./rate-limit";
import { createSession, deleteExpiredSessions } from "./session";

export type LoginInput = {
  email: string;
  password: string;
  /** Client address for the per-IP limit (see client-ip.ts). */
  ip: string;
};

export type LoginResult =
  | { ok: true; viewer: Viewer; token: string }
  /** Unknown email or wrong password; deliberately not told apart. */
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterMinutes: number }
  /** Correct password, but an admin disabled the account. */
  | { ok: false; reason: "account_disabled" };

export const INVALID_CREDENTIALS_MESSAGE = "Email or password is incorrect.";
export const ACCOUNT_DISABLED_MESSAGE =
  "This account has been disabled by an administrator, so it can't log in. If you think this is a mistake, contact support.";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Verifying against a throwaway hash when the email is unknown makes both cases take
// about as long, so response times do not reveal which emails have accounts.
let unknownUserHash: Promise<string> | undefined;
function hashForUnknownUser(): Promise<string> {
  unknownUserHash ??= hashPassword(randomBytes(24).toString("base64url"));
  return unknownUserHash;
}

function longestWait(results: readonly RateLimitResult[]): number {
  return Math.max(1, ...results.filter((result) => !result.ok).map((result) => result.retryAfterMinutes));
}

function findUserByEmail(ctx: AppContext, email: string) {
  return ctx.db
    .selectFrom("users")
    .select(["id", "email", "password_hash", "role", "display_name", "disabled_at", "is_demo_account"])
    .where("email", "=", email)
    .executeTakeFirst();
}

/** Starts a session for an account whose credentials were just verified. */
async function startSession(ctx: AppContext, viewer: Viewer): Promise<{ ok: true; viewer: Viewer; token: string }> {
  // Housekeeping while we are here; both tables only ever need their recent rows.
  await deleteExpiredSessions(ctx);
  await deleteExpiredRateLimits(ctx);
  return { ok: true, viewer, token: await createSession(ctx, viewer.id) };
}

/**
 * Checks credentials and starts a session. Failed attempts count toward the per-email and
 * per-IP limits whether or not the email has an account; once either limit is reached,
 * no password is checked until its window ends. A successful login clears the email's
 * failures. The caller stores `token` in the session cookie.
 */
export async function logIn(ctx: AppContext, input: LoginInput): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  const limits = [
    await checkRateLimit(ctx, "login_email", email),
    await checkRateLimit(ctx, "login_ip", input.ip),
  ];
  if (limits.some((limit) => !limit.ok)) {
    return { ok: false, reason: "rate_limited", retryAfterMinutes: longestWait(limits) };
  }

  const user = await findUserByEmail(ctx, email);
  const passwordMatches = await verifyPassword(input.password, user?.password_hash ?? (await hashForUnknownUser()));

  if (!user || !passwordMatches || !isUserRole(user.role)) {
    const failures = [
      await recordFailure(ctx, "login_email", email),
      await recordFailure(ctx, "login_ip", input.ip),
    ];
    if (failures.some((failure) => !failure.ok)) {
      return { ok: false, reason: "rate_limited", retryAfterMinutes: longestWait(failures) };
    }
    return { ok: false, reason: "invalid_credentials" };
  }

  // Revealed only to someone who knows the password.
  if (user.disabled_at !== null) return { ok: false, reason: "account_disabled" };

  await clearRateLimit(ctx, "login_email", email);
  return startSession(ctx, { id: user.id, role: user.role, email: user.email, displayName: user.display_name });
}

export type DemoLoginResult =
  | { ok: true; viewer: Viewer; token: string }
  /** Not a listed sample account, missing from the database, or no longer on the shared password. */
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "account_disabled" };

/**
 * One-click login as a listed sample account (DEMO_ACCOUNTS). The caller decides whether
 * one-click logins are allowed at all (DEMO_MODE, requests to localhost only).
 *
 * Nothing is guessed here: the email must be on the list and belong to a seeded sample
 * account (is_demo_account = 1), and the password is always the documented DEMO_PASSWORD,
 * checked against the stored hash, so the button can only do what typing that password
 * could. The failed-login limits therefore neither block nor count it, and a success leaves
 * an email's lockout from typed attempts in place. Disabled accounts and sessions work as
 * in logIn.
 */
export async function logInDemoAccount(ctx: AppContext, input: { email: string }): Promise<DemoLoginResult> {
  const email = normalizeEmail(input.email);
  if (!DEMO_ACCOUNTS.some((account) => account.email === email)) return { ok: false, reason: "invalid_credentials" };

  const user = await findUserByEmail(ctx, email);
  if (
    !user ||
    user.is_demo_account !== 1 ||
    !isUserRole(user.role) ||
    !(await verifyPassword(DEMO_PASSWORD, user.password_hash))
  ) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (user.disabled_at !== null) return { ok: false, reason: "account_disabled" };

  return startSession(ctx, { id: user.id, role: user.role, email: user.email, displayName: user.display_name });
}
