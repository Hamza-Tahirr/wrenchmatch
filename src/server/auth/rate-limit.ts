import "server-only";

import { createHash } from "node:crypto";

import { sql } from "kysely";

import { pluralize } from "@/lib/format";
import type { AppContext } from "@/server/context";
import { DomainError } from "@/server/errors";

// Fixed-window counters in the rate_limits table (ARCHITECTURE section 9). A bucket is one
// limit applied to one subject (an email, an IP address or a user id). Its window starts
// with the first counted attempt and lasts `windowMinutes`; the count restarts after that.
// Subjects are stored as SHA-256 digests, so the table holds no emails or IP addresses.

export type RateLimitRule = { readonly limit: number; readonly windowMinutes: number };

export const RATE_LIMITS = {
  /** Failed logins per email address. */
  login_email: { limit: 5, windowMinutes: 15 },
  /** Failed logins per client IP address. */
  login_ip: { limit: 20, windowMinutes: 15 },
  /** Sign-up attempts per client IP address. */
  signup_ip: { limit: 5, windowMinutes: 60 },
  /** Repair requests submitted per customer (subject: the customer's user id). */
  request_submit: { limit: 10, windowMinutes: 60 },
  /** Quotes submitted per mechanic (subject: the mechanic's user id). */
  quote_submit: { limit: 30, windowMinutes: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * What the limiter uses from AppContext. Inside writeTx pass `{ ...ctx, db: trx }`: the
 * attempt is then counted only if the transaction commits.
 */
export type RateLimitContext = Pick<AppContext, "db" | "now">;

export type RateLimitResult = {
  /**
   * checkRateLimit / recordFailure: another attempt is still allowed.
   * checkAndConsume: this attempt was within the limit.
   */
  ok: boolean;
  /** Attempts counted in the current window. */
  count: number;
  limit: number;
  /** When the current window ends (UTC ISO); with no active window, a window starting now. */
  resetAt: string;
  /** Whole minutes until resetAt (at least 1) when `ok` is false; otherwise 0. */
  retryAfterMinutes: number;
};

const MINUTE_MS = 60_000;

/** The rate_limits.bucket_key for a limit and subject (subjects compare case-insensitively). */
export function bucketKey(name: RateLimitName, subject: string): string {
  const digest = createHash("sha256").update(subject.trim().toLowerCase(), "utf8").digest("hex");
  return `${name}:${digest}`;
}

function windowMs(name: RateLimitName): number {
  return RATE_LIMITS[name].windowMinutes * MINUTE_MS;
}

function toResult(
  name: RateLimitName,
  ctx: RateLimitContext,
  row: { window_started_at: string; attempt_count: number } | undefined,
  ok: (count: number, limit: number) => boolean,
): RateLimitResult {
  const { limit } = RATE_LIMITS[name];
  const nowMs = ctx.now.getTime();
  const startedMs = row ? Date.parse(row.window_started_at) : Number.NaN;
  const active = row !== undefined && Number.isFinite(startedMs) && startedMs + windowMs(name) > nowMs;
  const count = active ? row.attempt_count : 0;
  const resetMs = active ? startedMs + windowMs(name) : nowMs + windowMs(name);
  const allowed = ok(count, limit);
  return {
    ok: allowed,
    count,
    limit,
    resetAt: new Date(resetMs).toISOString(),
    retryAfterMinutes: allowed ? 0 : Math.max(1, Math.ceil((resetMs - nowMs) / MINUTE_MS)),
  };
}

/** Counts one attempt atomically (one UPSERT), starting a new window if the old one ended. */
async function increment(ctx: RateLimitContext, name: RateLimitName, subject: string) {
  const nowIso = ctx.now.toISOString();
  // A window that started at or before this instant has ended.
  const expiredBefore = new Date(ctx.now.getTime() - windowMs(name)).toISOString();
  // In an UPSERT, column references on the right-hand side read the existing row.
  return ctx.db
    .insertInto("rate_limits")
    .values({ bucket_key: bucketKey(name, subject), window_started_at: nowIso, attempt_count: 1 })
    .onConflict((oc) =>
      oc.column("bucket_key").doUpdateSet({
        window_started_at: sql<string>`CASE WHEN rate_limits.window_started_at <= ${expiredBefore}
          THEN excluded.window_started_at ELSE rate_limits.window_started_at END`,
        attempt_count: sql<number>`CASE WHEN rate_limits.window_started_at <= ${expiredBefore}
          THEN 1 ELSE rate_limits.attempt_count + 1 END`,
      }),
    )
    .returning(["window_started_at", "attempt_count"])
    .executeTakeFirstOrThrow();
}

/** Read-only: is another attempt allowed right now? (`ok` is false once the limit is reached.) */
export async function checkRateLimit(
  ctx: RateLimitContext,
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const row = await ctx.db
    .selectFrom("rate_limits")
    .select(["window_started_at", "attempt_count"])
    .where("bucket_key", "=", bucketKey(name, subject))
    .executeTakeFirst();
  return toResult(name, ctx, row, (count, limit) => count < limit);
}

/**
 * Counts this attempt and reports whether it was within the limit: with a limit of 10,
 * attempts 1-10 in a window are `ok`, the 11th and later are not (and are still counted).
 */
export async function checkAndConsume(
  ctx: RateLimitContext,
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const row = await increment(ctx, name, subject);
  return toResult(name, ctx, row, (count, limit) => count <= limit);
}

/**
 * Counts a failure (e.g. a wrong password) and reports whether further attempts are still
 * allowed: with a limit of 5, the 5th failure in a window returns `ok: false`.
 */
export async function recordFailure(
  ctx: RateLimitContext,
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const row = await increment(ctx, name, subject);
  return toResult(name, ctx, row, (count, limit) => count < limit);
}

/** Forgets a bucket, e.g. an email's failed logins after a successful login. */
export async function clearRateLimit(ctx: RateLimitContext, name: RateLimitName, subject: string): Promise<void> {
  await ctx.db.deleteFrom("rate_limits").where("bucket_key", "=", bucketKey(name, subject)).execute();
}

/** Deletes buckets whose window ended long enough ago to be irrelevant for every limit. */
export async function deleteExpiredRateLimits(ctx: RateLimitContext): Promise<number> {
  const longestWindowMs = Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.windowMinutes)) * MINUTE_MS;
  const result = await ctx.db
    .deleteFrom("rate_limits")
    .where("window_started_at", "<=", new Date(ctx.now.getTime() - longestWindowMs).toISOString())
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** User-facing explanation for a limit that was hit. */
export function rateLimitMessage(name: RateLimitName, retryAfterMinutes: number): string {
  const wait = pluralize(Math.max(1, retryAfterMinutes), "minute");
  switch (name) {
    case "login_email":
    case "login_ip":
      return `Too many failed login attempts. For your security, wait ${wait} and try again.`;
    case "signup_ip":
      return `Too many sign-up attempts from this network. Try again in ${wait}.`;
    case "request_submit":
      return `You can send up to ${RATE_LIMITS.request_submit.limit} repair requests an hour. Try again in ${wait}.`;
    case "quote_submit":
      return `You can send up to ${RATE_LIMITS.quote_submit.limit} quotes an hour. Try again in ${wait}.`;
  }
}

export function rateLimitError(name: RateLimitName, result: RateLimitResult): DomainError {
  return new DomainError("rate_limited", rateLimitMessage(name, result.retryAfterMinutes), {
    limit: name,
    retryAfterMinutes: result.retryAfterMinutes,
    resetAt: result.resetAt,
  });
}

/**
 * Counts one attempt for `subject` and throws DomainError("rate_limited") with a friendly
 * message when it exceeds the limit. For example, in a request submission:
 *
 *   await writeTx(ctx.db, async (trx) => {
 *     await assertWithinRateLimit({ ...ctx, db: trx }, "request_submit", viewer.id);
 *     ...
 *   });
 *
 * Called inside the transaction, only committed submissions count; called before it
 * (with `ctx`), every attempt counts.
 */
export async function assertWithinRateLimit(
  ctx: RateLimitContext,
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const result = await checkAndConsume(ctx, name, subject);
  if (!result.ok) throw rateLimitError(name, result);
  return result;
}
