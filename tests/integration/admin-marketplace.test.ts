// Marketplace views (quotes, reservations, bookings, reviews) and the demo-fixture-only
// interventions: cancel, mark disputed, hold/release a demo payout. Real bookings are
// refused with payment_not_connected (refunds and payouts need Stripe).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cancelDemoBooking, markDemoBookingDisputed, setDemoPayoutHold } from "@/server/admin/interventions";
import { listBookings, listQuotes, listReservations, listReviews } from "@/server/admin/marketplace";
import { addHours } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { newId } from "@/server/ids";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type TestMechanic,
} from "../support/factories";

let t: TestContext;
let admin: Viewer;
let customer: Viewer;
let mechanic: TestMechanic;

beforeEach(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin" });
  customer = await createUser(t.ctx, { role: "customer", displayName: "Dana" });
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
});

afterEach(async () => {
  await t.cleanup();
});

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

function one<T>(query: string, ...params: unknown[]): T {
  return t.sqlite.prepare(query).get(...params) as T;
}

async function expectDomainError(promise: Promise<unknown>, code: DomainErrorCode): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

const bookingRow = (id: string) =>
  one<{ status: string; payout_status: string; cancelled_at: string | null; cancel_reason: string | null }>(
    "SELECT status, payout_status, cancelled_at, cancel_reason FROM bookings WHERE id = ?",
    id,
  );

const notificationsFor = (userId: string) =>
  rows<{ type: string; title: string; body: string; link_path: string }>(
    "SELECT type, title, body, link_path FROM notifications WHERE user_id = ? ORDER BY rowid",
    userId,
  );

const audits = () =>
  rows<{ action: string; entity_id: string; reason: string | null; metadata_json: string; actor_user_id: string }>(
    "SELECT action, entity_id, reason, metadata_json, actor_user_id FROM audit_events ORDER BY rowid",
  );

async function insertChangeOrder(bookingId: string, status: "proposed" | "approved"): Promise<string> {
  const id = newId();
  const nowIso = t.ctx.now.toISOString();
  await t.ctx.db
    .insertInto("change_orders")
    .values({
      id,
      booking_id: bookingId,
      proposed_by: mechanic.id,
      description: "Replace the cracked serpentine belt",
      reason: "Found during the inspection",
      labor_cents: 4_000,
      parts_cents: 2_500,
      tax_cents: 0,
      amount_cents: 6_500,
      status,
      payment_state: "demo_fixture_no_real_payment",
      decided_by: status === "approved" ? customer.id : null,
      decided_at: status === "approved" ? nowIso : null,
      is_demo_fixture: 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .execute();
  return id;
}

async function realPendingBooking() {
  const request = await createOpenRequest(t.ctx, customer);
  const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart: addHours(t.ctx.now, 100) });
  return createPendingBooking(t.ctx, { quote, customer });
}

describe("marketplace lists", () => {
  it("lists quotes by status as of now, reservations, bookings with interventions and reviews", async () => {
    const live = await createOpenRequest(t.ctx, customer);
    const liveQuote = await createSubmittedQuote(t.ctx, { requestId: live.id, mechanicId: mechanic.id, slotStart: addHours(t.ctx.now, 30) });
    const lapsedRequest = await createOpenRequest(t.ctx, customer);
    const lapsedQuote = await createSubmittedQuote(t.ctx, {
      requestId: lapsedRequest.id,
      mechanicId: mechanic.id,
      slotStart: addHours(t.ctx.now, 60),
      expiresAt: addHours(t.ctx.now, -1),
    });
    const pending = await realPendingBooking();
    const confirmed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, slotStart: addHours(t.ctx.now, 200) });
    const completed = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic,
      status: "completed",
      payoutStatus: "pending",
      slotStart: addHours(t.ctx.now, 300),
    });
    await t.ctx.db
      .insertInto("reviews")
      .values({
        id: newId(),
        booking_id: completed.id,
        customer_id: customer.id,
        mechanic_id: mechanic.id,
        rating: 5,
        comment: "Quick and friendly (demo review).",
        is_demo_fixture: 1,
        created_at: t.ctx.now.toISOString(),
      })
      .execute();

    const quotes = await listQuotes(t.ctx, admin);
    expect(quotes.totalCount).toBe(5);
    expect((await listQuotes(t.ctx, admin, { status: "expired" })).items.map((quote) => quote.id)).toEqual([lapsedQuote.id]);
    expect((await listQuotes(t.ctx, admin, { status: "submitted" })).items.map((quote) => quote.id)).toEqual([liveQuote.id]);
    expect((await listQuotes(t.ctx, admin, { status: "selected" })).totalCount).toBe(3);
    const expired = quotes.items.find((quote) => quote.id === lapsedQuote.id);
    expect(expired).toMatchObject({
      status: "expired",
      storedStatus: "submitted",
      mechanic: { id: mechanic.id, displayName: "Marco R." },
      customer: { id: customer.id, displayName: "Dana" },
      categoryName: "Diagnostic visit",
      vehicle: "2016 Toyota Camry",
      totalCents: 16_550,
      isDemoFixture: false,
    });

    expect((await listReservations(t.ctx, admin)).map((booking) => booking.id)).toEqual([pending.id]);

    const bookings = await listBookings(t.ctx, admin);
    expect(bookings.totalCount).toBe(3);
    const byId = new Map(bookings.items.map((booking) => [booking.id, booking]));
    expect(byId.get(pending.id)).toMatchObject({
      status: "pending_payment",
      paymentState: "stripe_not_connected",
      payoutStatus: "not_eligible",
      isDemoFixture: false,
      interventions: { cancel: false, markDisputed: false, holdPayout: false, releasePayout: false },
    });
    expect(byId.get(confirmed.id)).toMatchObject({
      status: "confirmed",
      paymentState: "demo_fixture_no_real_payment",
      isDemoFixture: true,
      interventions: { cancel: true, markDisputed: true, holdPayout: false, releasePayout: false },
    });
    expect(byId.get(completed.id)).toMatchObject({
      status: "completed",
      payoutStatus: "pending",
      interventions: { cancel: false, markDisputed: true, holdPayout: true, releasePayout: false },
    });
    expect((await listBookings(t.ctx, admin, { bookedOnly: true })).items.map((booking) => booking.id).sort()).toEqual(
      [confirmed.id, completed.id].sort(),
    );
    expect((await listBookings(t.ctx, admin, { status: "completed" })).items.map((booking) => booking.id)).toEqual([completed.id]);

    const reviews = await listReviews(t.ctx, admin);
    expect(reviews.items).toEqual([
      {
        id: expect.any(String),
        bookingId: completed.id,
        requestId: completed.requestId,
        rating: 5,
        comment: "Quick and friendly (demo review).",
        isDemoFixture: true,
        mechanic: { id: mechanic.id, displayName: "Marco R." },
        customer: { id: customer.id, displayName: "Dana" },
        createdAt: t.ctx.now.toISOString(),
      },
    ]);
    expect(live.id).not.toBe(lapsedRequest.id);
  });
});

describe("cancelDemoBooking", () => {
  it("cancels a confirmed demo booking, voids its proposed change orders and notifies both parties", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, payoutStatus: "pending" });
    const proposed = await insertChangeOrder(booking.id, "proposed");
    const approved = await insertChangeOrder(booking.id, "approved");

    const result = await cancelDemoBooking(t.ctx, admin, { bookingId: booking.id, reason: "Customer moved out of state" });

    expect(result).toEqual({ bookingId: booking.id, status: "cancelled", payoutStatus: "not_eligible" });
    expect(bookingRow(booking.id)).toEqual({
      status: "cancelled",
      payout_status: "not_eligible",
      cancelled_at: t.ctx.now.toISOString(),
      cancel_reason: "Customer moved out of state",
    });
    expect(rows("SELECT id, status, decided_by FROM change_orders ORDER BY rowid")).toEqual([
      { id: proposed, status: "void", decided_by: admin.id },
      { id: approved, status: "approved", decided_by: customer.id },
    ]);
    expect(notificationsFor(customer.id)).toEqual([
      {
        type: "booking.demo_cancelled",
        title: "Your booking was cancelled",
        body: expect.stringContaining("Reason: Customer moved out of state. No online payment was taken, so there is nothing to refund."),
        link_path: `/bookings/${booking.id}`,
      },
    ]);
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ type: "booking.demo_cancelled", link_path: `/mechanic/bookings/${booking.id}` }),
    ]);
    expect(rows("SELECT template FROM email_outbox ORDER BY rowid")).toEqual([
      { template: "booking_admin_cancelled" },
      { template: "booking_admin_cancelled" },
    ]);
    // Presentation mode: what people read never calls the booking a demo.
    const shown = [
      ...rows<{ title: string; body: string }>("SELECT title, body FROM notifications"),
      ...rows<{ subject: string; body_text: string }>("SELECT subject, body_text FROM email_outbox"),
    ];
    expect(JSON.stringify(shown)).not.toMatch(/demo/i);
    const [audit] = audits();
    expect(audit).toMatchObject({ action: "booking.demo_cancelled", entity_id: booking.id, reason: "Customer moved out of state", actor_user_id: admin.id });
    expect(JSON.parse(audit.metadata_json)).toEqual({
      requestId: booking.requestId,
      quoteId: booking.quoteId,
      from: "confirmed",
      to: "cancelled",
      payoutFrom: "pending",
      payoutTo: "not_eligible",
      voidedChangeOrders: 1,
      quoteDeclined: true,
    });
    // the request has no status after "booked"; the booking carries the cancellation
    expect(one("SELECT status FROM repair_requests WHERE id = ?", booking.requestId)).toEqual({ status: "booked" });
  });

  it("declines the booking's quote, which frees the mechanic's slot", async () => {
    const slotStart = addHours(t.ctx.now, 50);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, slotStart });
    const other = await createOpenRequest(t.ctx, customer);
    const overlapping = () => createSubmittedQuote(t.ctx, { requestId: other.id, mechanicId: mechanic.id, slotStart, expiresAt: addHours(t.ctx.now, 24) });
    await expect(overlapping()).rejects.toThrow("slot_conflict");

    await cancelDemoBooking(t.ctx, admin, { bookingId: booking.id, reason: "Mechanic is unavailable" });

    expect(one("SELECT status FROM quotes WHERE id = ?", booking.quoteId)).toEqual({ status: "declined" });
    await expect(overlapping()).resolves.toMatchObject({ mechanicId: mechanic.id });
  });

  it("refuses bookings that are not confirmed or in progress, real bookings and missing reasons", async () => {
    const completed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
    const pending = await realPendingBooking();

    const wrongState = await expectDomainError(
      cancelDemoBooking(t.ctx, admin, { bookingId: completed.id, reason: "Changed my mind" }),
      "conflict",
    );
    expect(wrongState.userMessage).toContain("This one is completed.");
    const real = await expectDomainError(
      cancelDemoBooking(t.ctx, admin, { bookingId: pending.id, reason: "Changed my mind" }),
      "payment_not_connected",
    );
    expect(real.userMessage).toBe(
      "Refunds and payouts are available once online payments launch. This booking has no online payment yet, so it can't be changed here.",
    );
    await expectDomainError(cancelDemoBooking(t.ctx, admin, { bookingId: completed.id, reason: "no" }), "invalid_input");
    await expectDomainError(cancelDemoBooking(t.ctx, admin, { bookingId: newId(), reason: "Changed my mind" }), "not_found");

    expect(bookingRow(completed.id).status).toBe("completed");
    expect(bookingRow(pending.id).status).toBe("pending_payment");
    expect(audits()).toEqual([]);
    expect(rows("SELECT id FROM notifications")).toEqual([]);
  });
});

describe("markDemoBookingDisputed", () => {
  it("marks a completed demo booking disputed and holds its pending demo payout", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed", payoutStatus: "pending" });

    const result = await markDemoBookingDisputed(t.ctx, admin, { bookingId: booking.id, reason: "Customer says the noise is back" });

    expect(result).toEqual({ bookingId: booking.id, status: "disputed", payoutStatus: "held" });
    expect(bookingRow(booking.id)).toMatchObject({ status: "disputed", payout_status: "held" });
    expect(notificationsFor(customer.id)).toEqual([
      expect.objectContaining({ type: "booking.demo_disputed", body: expect.not.stringContaining("payout") }),
    ]);
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({
        type: "booking.demo_disputed",
        body: expect.stringContaining("The payout is on hold while it is reviewed."),
      }),
    ]);
    expect(audits()).toEqual([
      expect.objectContaining({ action: "booking.demo_disputed", reason: "Customer says the noise is back" }),
    ]);
  });

  it("keeps a payout that isn't pending as it is, and refuses cancelled or real bookings", async () => {
    const inProgress = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "in_progress" });
    const cancelled = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "cancelled", slotStart: addHours(t.ctx.now, 90) });
    const pending = await realPendingBooking();

    await expect(
      markDemoBookingDisputed(t.ctx, admin, { bookingId: inProgress.id, reason: "Work stopped halfway" }),
    ).resolves.toEqual({ bookingId: inProgress.id, status: "disputed", payoutStatus: "not_eligible" });
    await expectDomainError(markDemoBookingDisputed(t.ctx, admin, { bookingId: cancelled.id, reason: "Late dispute" }), "conflict");
    await expectDomainError(markDemoBookingDisputed(t.ctx, admin, { bookingId: pending.id, reason: "Late dispute" }), "payment_not_connected");
  });
});

describe("setDemoPayoutHold", () => {
  it("holds and releases a demo payout, telling only the mechanic", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed", payoutStatus: "pending" });

    await expect(setDemoPayoutHold(t.ctx, admin, { bookingId: booking.id, hold: true, reason: "Invoice under review" })).resolves.toEqual({
      bookingId: booking.id,
      status: "completed",
      payoutStatus: "held",
    });
    expect(bookingRow(booking.id).payout_status).toBe("held");
    await expectDomainError(setDemoPayoutHold(t.ctx, admin, { bookingId: booking.id, hold: true, reason: "Again" }), "conflict");

    await expect(setDemoPayoutHold(t.ctx, admin, { bookingId: booking.id, hold: false, reason: "Invoice checked" })).resolves.toMatchObject({
      payoutStatus: "pending",
    });
    expect(bookingRow(booking.id).payout_status).toBe("pending");
    await expectDomainError(setDemoPayoutHold(t.ctx, admin, { bookingId: booking.id, hold: false, reason: "Again" }), "conflict");

    expect(notificationsFor(customer.id)).toEqual([]);
    expect(notificationsFor(mechanic.id).map((row) => row.type)).toEqual(["booking.demo_payout_held", "booking.demo_payout_released"]);
    expect(audits().map((row) => [row.action, row.reason])).toEqual([
      ["booking.demo_payout_held", "Invoice under review"],
      ["booking.demo_payout_released", "Invoice checked"],
    ]);
  });

  it("refuses payouts of real bookings and payouts that are not eligible", async () => {
    const confirmed = await createDemoFixtureBooking(t.ctx, { customer, mechanic });
    const pending = await realPendingBooking();
    await expectDomainError(setDemoPayoutHold(t.ctx, admin, { bookingId: confirmed.id, hold: true, reason: "Hold it" }), "conflict");
    await expectDomainError(setDemoPayoutHold(t.ctx, admin, { bookingId: pending.id, hold: true, reason: "Hold it" }), "payment_not_connected");
    await expectDomainError(setDemoPayoutHold(t.ctx, admin, { bookingId: pending.id, hold: "yes please" as unknown as boolean, reason: "Hold it" }), "invalid_input");
    expect(bookingRow(pending.id).payout_status).toBe("not_eligible");
  });
});
