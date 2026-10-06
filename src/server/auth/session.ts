import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { addDays } from "@/server/clock";
import { SESSION_TTL_DAYS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { isUserRole } from "./redirects";

// Database sessions. The browser holds a random token in an httpOnly cookie; the database
// stores only its SHA-256 digest (sessions.id), so a leaked database cannot be replayed as
// cookies. Sessions last SESSION_TTL_DAYS from login and are not extended.

export const SESSION_COOKIE_NAME = "wm_session";
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

const TOKEN_BYTES = 32;
// 32 bytes in unpadded base64url.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * What the session functions use from AppContext. Inside writeTx pass
 * `{ ...ctx, db: trx }` so the queries run in the transaction.
 */
export type SessionContext = Pick<AppContext, "db" | "now">;

/** The value stored in sessions.id for a cookie token (hex SHA-256). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Starts a session for `userId` and returns the token to put in the cookie. */
export async function createSession(ctx: SessionContext, userId: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const nowIso = ctx.now.toISOString();
  await ctx.db
    .insertInto("sessions")
    .values({
      id: hashSessionToken(token),
      user_id: userId,
      created_at: nowIso,
      expires_at: addDays(ctx.now, SESSION_TTL_DAYS).toISOString(),
      last_seen_at: nowIso,
    })
    .execute();
  return token;
}

/**
 * The signed-in user for a cookie token, or null when the token is malformed, unknown or
 * expired, or the account is disabled.
 */
export async function lookupSession(ctx: SessionContext, token: string | null | undefined): Promise<Viewer | null> {
  if (!isWellFormedToken(token)) return null;
  const row = await ctx.db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select(["users.id as id", "users.role as role", "users.email as email", "users.display_name as displayName"])
    .where("sessions.id", "=", hashSessionToken(token))
    .where("sessions.expires_at", ">", ctx.now.toISOString())
    .where("users.disabled_at", "is", null)
    .executeTakeFirst();
  if (!row || !isUserRole(row.role)) return null;
  return { id: row.id, role: row.role, email: row.email, displayName: row.displayName };
}

/** Ends the session for a token (logout). Unknown or malformed tokens are ignored. */
export async function deleteSession(ctx: SessionContext, token: string | null | undefined): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await ctx.db.deleteFrom("sessions").where("id", "=", hashSessionToken(token)).execute();
}

/** Removes sessions whose expiry has passed. Returns how many were deleted. */
export async function deleteExpiredSessions(ctx: SessionContext): Promise<number> {
  const result = await ctx.db
    .deleteFrom("sessions")
    .where("expires_at", "<=", ctx.now.toISOString())
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

// ---------------------------------------------------------------------------------
// Cookie helpers. Reading works anywhere on the server; setting and clearing only in
// Server Actions and Route Handlers (Next.js cannot set cookies while rendering).
// ---------------------------------------------------------------------------------

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Plain http://localhost in development; production must be served over HTTPS.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** The session token from the request's cookie, if it has one. */
export async function readSessionCookie(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return value ? value : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  // Same attributes as when it was set, so the browser replaces (and drops) that cookie.
  (await cookies()).set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
}

/**
 * Puts a new session token in the cookie after login or signup, ending the session the
 * browser was using before (if any) so switching demo accounts leaves no stale session.
 */
export async function replaceSessionCookie(ctx: SessionContext, token: string): Promise<void> {
  const previous = await readSessionCookie();
  if (previous && previous !== token) await deleteSession(ctx, previous);
  await setSessionCookie(token);
}
