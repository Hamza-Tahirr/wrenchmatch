import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertWithinRateLimit,
  bucketKey,
  checkAndConsume,
  checkRateLimit,
  clearRateLimit,
  deleteExpiredRateLimits,
  RATE_LIMITS,
  rateLimitMessage,
  recordFailure,
} from "@/server/auth/rate-limit";
import { addMinutes } from "@/server/clock";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { createTestContext, withNow, type TestContext } from "../support/db";

let t: TestContext;

beforeEach(() => {
  t = createTestContext();
});

afterEach(async () => {
  await t.cleanup();
});

const at = (minutes: number) => withNow(t.ctx, addMinutes(t.ctx.now, minutes));
const rows = () =>
  t.sqlite.prepare("SELECT bucket_key, window_started_at, attempt_count FROM rate_limits ORDER BY bucket_key").all() as {
    bucket_key: string;
    window_started_at: string;
    attempt_count: number;
  }[];

describe("RATE_LIMITS", () => {
  it("matches ARCHITECTURE section 9", () => {
    expect(RATE_LIMITS).toEqual({
      login_email: { limit: 5, windowMinutes: 15 },
      login_ip: { limit: 20, windowMinutes: 15 },
      signup_ip: { limit: 5, windowMinutes: 60 },
      request_submit: { limit: 10, windowMinutes: 60 },
      quote_submit: { limit: 30, windowMinutes: 60 },
    });
  });
});

describe("checkAndConsume", () => {
  it("allows attempts up to the limit in one window, then refuses (still counting)", async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = await checkAndConsume(t.ctx, "request_submit", "customer-1");
      expect(result).toMatchObject({ ok: true, count: attempt, limit: 10, retryAfterMinutes: 0 });
    }
    const blocked = await checkAndConsume(at(20), "request_submit", "customer-1");
    expect(blocked).toMatchObject({ ok: false, count: 11, limit: 10, retryAfterMinutes: 40 });
    expect(blocked.resetAt).toBe(addMinutes(t.ctx.now, 60).toISOString());
  });

  it("uses fixed windows: the window starts at the first attempt and restarts after it ends", async () => {
    await checkAndConsume(t.ctx, "signup_ip", "127.0.0.1");
    expect((await checkAndConsume(at(59), "signup_ip", "127.0.0.1")).count).toBe(2);
    const fresh = await checkAndConsume(at(60), "signup_ip", "127.0.0.1");
    expect(fresh).toMatchObject({ ok: true, count: 1 });
    expect(fresh.resetAt).toBe(addMinutes(t.ctx.now, 120).toISOString());
    expect(rows()).toEqual([
      { bucket_key: bucketKey("signup_ip", "127.0.0.1"), window_started_at: addMinutes(t.ctx.now, 60).toISOString(), attempt_count: 1 },
    ]);
  });

  it("keeps separate buckets per limit and per subject", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await checkAndConsume(t.ctx, "signup_ip", "10.0.0.1");
    expect((await checkAndConsume(t.ctx, "signup_ip", "10.0.0.1")).ok).toBe(false);
    expect((await checkAndConsume(t.ctx, "signup_ip", "10.0.0.2")).ok).toBe(true);
    expect((await checkAndConsume(t.ctx, "request_submit", "10.0.0.1")).ok).toBe(true);
  });
});

describe("recordFailure / checkRateLimit / clearRateLimit", () => {
  it("blocks once the limit-th failure is recorded; checking never counts", async () => {
    for (let failure = 1; failure <= 4; failure += 1) {
      expect((await recordFailure(t.ctx, "login_email", "dana@example.com")).ok).toBe(true);
    }
    expect((await checkRateLimit(t.ctx, "login_email", "dana@example.com")).ok).toBe(true);
    const fifth = await recordFailure(t.ctx, "login_email", "dana@example.com");
    expect(fifth).toMatchObject({ ok: false, count: 5, limit: 5, retryAfterMinutes: 15 });

    const check = await checkRateLimit(at(10.5), "login_email", "dana@example.com");
    expect(check).toMatchObject({ ok: false, count: 5, retryAfterMinutes: 5 }); // 4.5 minutes, rounded up
    await checkRateLimit(t.ctx, "login_email", "dana@example.com");
    expect(rows()[0]?.attempt_count).toBe(5);

    expect((await checkRateLimit(at(15), "login_email", "dana@example.com")).ok).toBe(true);
  });

  it("treats subjects case-insensitively and stores only their digests", async () => {
    await recordFailure(t.ctx, "login_email", " Dana@Example.com ");
    expect((await checkRateLimit(t.ctx, "login_email", "dana@example.com")).count).toBe(1);
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.bucket_key).toMatch(/^login_email:[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("dana");
  });

  it("clearRateLimit forgets one bucket only", async () => {
    await recordFailure(t.ctx, "login_email", "a@example.com");
    await recordFailure(t.ctx, "login_ip", "127.0.0.1");
    await clearRateLimit(t.ctx, "login_email", "a@example.com");
    expect((await checkRateLimit(t.ctx, "login_email", "a@example.com")).count).toBe(0);
    expect((await checkRateLimit(t.ctx, "login_ip", "127.0.0.1")).count).toBe(1);
  });

  it("deleteExpiredRateLimits removes only windows older than the longest limit", async () => {
    await recordFailure(t.ctx, "login_email", "old@example.com");
    await recordFailure(at(30), "login_email", "recent@example.com");
    expect(await deleteExpiredRateLimits(at(60))).toBe(1);
    expect(rows().map((row) => row.bucket_key)).toEqual([bucketKey("login_email", "recent@example.com")]);
  });
});

describe("assertWithinRateLimit", () => {
  it("throws DomainError('rate_limited') with the minutes left once the limit is exceeded", async () => {
    for (let quote = 0; quote < 30; quote += 1) await assertWithinRateLimit(t.ctx, "quote_submit", "mechanic-1");
    let caught: unknown;
    try {
      await assertWithinRateLimit(at(45), "quote_submit", "mechanic-1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toMatchObject({
      code: "rate_limited",
      userMessage: "You can send up to 30 quotes an hour. Try again in 15 minutes.",
      details: { limit: "quote_submit", retryAfterMinutes: 15 },
    });
  });

  it("counts only committed attempts when used inside writeTx", async () => {
    await expect(
      writeTx(t.ctx.db, async (trx) => {
        await assertWithinRateLimit({ ...t.ctx, db: trx }, "request_submit", "customer-2");
        throw new Error("submission failed later in the transaction");
      }),
    ).rejects.toThrow("submission failed");
    expect((await checkRateLimit(t.ctx, "request_submit", "customer-2")).count).toBe(0);

    await writeTx(t.ctx.db, (trx) => assertWithinRateLimit({ ...t.ctx, db: trx }, "request_submit", "customer-2"));
    expect((await checkRateLimit(t.ctx, "request_submit", "customer-2")).count).toBe(1);
  });
});

describe("rateLimitMessage", () => {
  it("explains each limit with the wait in minutes", () => {
    expect(rateLimitMessage("login_email", 1)).toBe(
      "Too many failed login attempts. For your security, wait 1 minute and try again.",
    );
    expect(rateLimitMessage("login_ip", 12)).toContain("wait 12 minutes");
    expect(rateLimitMessage("signup_ip", 42)).toBe("Too many sign-up attempts from this network. Try again in 42 minutes.");
    expect(rateLimitMessage("request_submit", 5)).toBe(
      "You can send up to 10 repair requests an hour. Try again in 5 minutes.",
    );
  });
});
