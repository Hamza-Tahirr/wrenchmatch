import "server-only";

import { CONSENT_VERSION } from "@/lib/domain";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { normalizeEmail } from "./login";
import { hashPassword } from "./password";
import { checkAndConsume, rateLimitError } from "./rate-limit";
import { isSignupRole, type SignupRole } from "./redirects";
import { createSession } from "./session";
import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./validation";

export type SignUpInput = {
  /** Checked again here: anything but "customer" or "mechanic" is refused. */
  role: SignupRole;
  displayName: string;
  email: string;
  password: string;
  /** Client address for the per-IP sign-up limit. */
  ip: string;
};

export type SignUpResult = { viewer: Viewer; token: string };

/** Shown on the email field when the address already has an account. */
export const DUPLICATE_EMAIL_MESSAGE =
  "An account with this email already exists. Log in instead, or use a different email address.";

const WELCOME: Record<SignupRole, { title: string; body: string; linkPath: string }> = {
  customer: {
    title: "Welcome to WrenchMatch",
    body: "Describe what is wrong with your car to get itemized quotes from approved mechanics near you.",
    linkPath: "/request",
  },
  mechanic: {
    title: "Welcome to WrenchMatch",
    body: "Complete your mechanic application. An admin reviews every application before you receive matched jobs.",
    linkPath: "/mechanic/apply",
  },
};

function invalid(message: string): DomainError {
  return new DomainError("invalid_input", message);
}

/** True when DomainError `error` is the users.email unique violation (a duplicate account). */
export function isDuplicateEmailError(error: unknown): boolean {
  return error instanceof DomainError && error.code === "conflict" && error.details?.dbReason === "users.email";
}

/**
 * Creates a customer or mechanic account and starts its session. Admin accounts cannot be
 * created here (they exist only through the seed), and a role never changes afterwards
 * (a database trigger rejects it). Every attempt counts toward the per-IP sign-up limit.
 * Throws DomainError: "forbidden" for any other role, "invalid_input", "rate_limited",
 * or "conflict" for an email that already has an account (see isDuplicateEmailError).
 */
export async function signUp(ctx: AppContext, input: SignUpInput): Promise<SignUpResult> {
  if (!isSignupRole(input.role)) {
    throw new DomainError("forbidden", "New accounts can only be customer or mechanic accounts.");
  }
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    throw invalid(`Enter a name of 1-${DISPLAY_NAME_MAX_LENGTH} characters.`);
  }
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw invalid("Enter a valid email address, like name@example.com.");
  }
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    throw invalid(`Use ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters for your password.`);
  }

  const limit = await checkAndConsume(ctx, "signup_ip", input.ip);
  if (!limit.ok) throw rateLimitError("signup_ip", limit);

  // Hash before the transaction: scrypt is deliberately slow and must not hold the write lock.
  const passwordHash = await hashPassword(input.password);
  const id = newId();
  const nowIso = ctx.now.toISOString();
  const viewer: Viewer = { id, role: input.role, email, displayName };

  await writeTx(ctx.db, async (trx) => {
    await trx
      .insertInto("users")
      .values({
        id,
        email,
        password_hash: passwordHash,
        role: input.role,
        display_name: displayName,
        // Local development auto-verifies new emails: nothing is sent, and the address is
        // treated as verified immediately. Hosted Supabase Auth must enforce real email
        // verification before an account is trusted.
        email_verified_at: nowIso,
        is_demo_account: 0,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .execute();
    // The account record of accepting the (demo) terms and privacy notice.
    await recordAudit(trx, {
      actor: viewer,
      action: "account.signup",
      entityType: "user",
      entityId: id,
      metadata: { role: input.role, termsAccepted: true, termsVersion: CONSENT_VERSION },
      at: ctx.now,
    });
    await notify(trx, { userId: id, type: "account.welcome", ...WELCOME[input.role], at: ctx.now });
  });

  const token = await createSession(ctx, id);
  return { viewer, token };
}
