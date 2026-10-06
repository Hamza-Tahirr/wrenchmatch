import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addHours, addMinutes } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { expireStaleRecords } from "@/server/expiry";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type TestMechanic,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let mechanicA: TestMechanic;
let mechanicB: TestMechanic;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  mechanicA = await createMechanic(t.ctx);
  mechanicB = await createMechanic(t.ctx);
});

afterEach(async () => {
  await t.cleanup();
});

const requestStatus = (id: string) =>
  (t.sqlite.prepare("SELECT status FROM repair_requests WHERE id = ?").get(id) as { status: string }).status;
const quoteStatus = (id: string) =>
  (t.sqlite.prepare("SELECT status FROM quotes WHERE id = ?").get(id) as { status: string }).status;

function expireAt(now: Date) {
  return writeTx(t.ctx.db, (trx) => expireStaleRecords(trx, now));
}

describe("expireStaleRecords", () => {
  it("does nothing while everything is current", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanicA.id });
    expect(await expireAt(t.ctx.now)).toEqual({ requestsExpired: 0, quotesExpired: 0, requestsReopened: 0 });
    expect(requestStatus(request.id)).toBe("quoted");
    expect(quoteStatus(quote.id)).toBe("submitted");
  });

  it("expires open requests at their expiry time (inclusive)", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const expiresAt = new Date(request.expiresAt);
    expect(await expireAt(addMinutes(expiresAt, -1))).toMatchObject({ requestsExpired: 0 });
    expect(requestStatus(request.id)).toBe("open");
    expect(await expireAt(expiresAt)).toEqual({ requestsExpired: 1, quotesExpired: 0, requestsReopened: 0 });
    expect(requestStatus(request.id)).toBe("expired");
  });

  it("expires a quoted request together with its submitted quotes", async () => {
    // A request submitted six days ago, with quotes that stay valid past the request's expiry.
    const request = await createOpenRequest(t.ctx, customer, { submittedAt: addHours(t.ctx.now, -6 * 24) });
    const slotStart = addHours(t.ctx.now, 72);
    const quoteA = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanicA.id,
      slotStart,
      expiresAt: slotStart,
    });
    const quoteB = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanicB.id,
      slotStart,
      expiresAt: slotStart,
    });
    t.sqlite.prepare("UPDATE quotes SET status = 'withdrawn' WHERE id = ?").run(quoteB.id);

    const counts = await expireAt(new Date(request.expiresAt));
    expect(counts).toEqual({ requestsExpired: 1, quotesExpired: 1, requestsReopened: 0 });
    expect(requestStatus(request.id)).toBe("expired");
    expect(quoteStatus(quoteA.id)).toBe("expired");
    expect(quoteStatus(quoteB.id)).toBe("withdrawn");
  });

  it("expires lapsed quotes and reopens a request left without a live quote", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanicA.id });
    expect(requestStatus(request.id)).toBe("quoted");

    const later = withNow(t.ctx, new Date(quote.expiresAt));
    expect(await expireAt(later.now)).toEqual({ requestsExpired: 0, quotesExpired: 1, requestsReopened: 1 });
    expect(quoteStatus(quote.id)).toBe("expired");
    expect(requestStatus(request.id)).toBe("open");
  });

  it("keeps a request quoted while another quote is still live", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const shortLived = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanicA.id,
      expiresAt: addHours(t.ctx.now, 2),
    });
    const longLived = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanicB.id,
      expiresAt: addHours(t.ctx.now, 30),
      slotStart: addHours(t.ctx.now, 40),
    });

    expect(await expireAt(addHours(t.ctx.now, 3))).toEqual({
      requestsExpired: 0,
      quotesExpired: 1,
      requestsReopened: 0,
    });
    expect(quoteStatus(shortLived.id)).toBe("expired");
    expect(quoteStatus(longLived.id)).toBe("submitted");
    expect(requestStatus(request.id)).toBe("quoted");
  });

  it("reopens a quoted request whose quotes were all withdrawn", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanicA.id });
    t.sqlite.prepare("UPDATE quotes SET status = 'withdrawn' WHERE id = ?").run(quote.id);
    expect(await expireAt(t.ctx.now)).toEqual({ requestsExpired: 0, quotesExpired: 0, requestsReopened: 1 });
    expect(requestStatus(request.id)).toBe("open");
  });

  it("leaves reserved requests and selected quotes alone", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const selected = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanicA.id });
    const other = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanicB.id,
      slotStart: addHours(t.ctx.now, 30),
    });
    await createPendingBooking(t.ctx, { quote: selected, customer });
    expect(requestStatus(request.id)).toBe("reserved");
    expect(quoteStatus(other.id)).toBe("declined");

    const muchLater = addHours(new Date(request.expiresAt), 24);
    expect(await expireAt(muchLater)).toEqual({ requestsExpired: 0, quotesExpired: 0, requestsReopened: 0 });
    expect(requestStatus(request.id)).toBe("reserved");
    expect(quoteStatus(selected.id)).toBe("selected");
  });

  it("is idempotent", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanicA.id });
    const end = new Date(request.expiresAt);
    expect(await expireAt(end)).toEqual({ requestsExpired: 1, quotesExpired: 1, requestsReopened: 0 });
    expect(await expireAt(end)).toEqual({ requestsExpired: 0, quotesExpired: 0, requestsReopened: 0 });
  });

  it("rolls back with the surrounding transaction", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    await expect(
      writeTx(t.ctx.db, async (trx) => {
        await expireStaleRecords(trx, new Date(request.expiresAt));
        throw new Error("later step failed");
      }),
    ).rejects.toThrow("later step failed");
    expect(requestStatus(request.id)).toBe("open");
  });
});
