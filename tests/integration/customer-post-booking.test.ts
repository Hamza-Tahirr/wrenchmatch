// After a (demo) booking is confirmed: change-order decisions and reviews, plus the account
// overview that summarizes everything a customer has.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BOOKING_CONSENTS } from "@/lib/domain";
import { addDays } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { getAccountOverview } from "@/server/customer/account";
import { fieldErrorsOf } from "@/server/customer/form-errors";
import { decideChangeOrder, submitReview } from "@/server/customer/post-booking";
import { getMyBooking, selectQuote } from "@/server/customer/reservations";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { computeInvoiceTotals } from "@/server/pricing";
import { createSupportRequest, requestAccountDeletion } from "@/server/support/requests";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createSubmittedQuote,
  createUser,
  type TestDemoBooking,
  type TestMechanic,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let otherCustomer: Viewer;
let mechanic: TestMechanic;
let slotDay = 3;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  otherCustomer = await createUser(t.ctx, { role: "customer" });
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
  slotDay = 3;
});

afterEach(async () => {
  await t.cleanup();
});

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

/** A demo fixture booking in its own time slot (fixtures for one mechanic must not overlap). */
function fixture(status: "confirmed" | "in_progress" | "completed" | "cancelled" = "confirmed") {
  slotDay += 1;
  return createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart: addDays(t.ctx.now, slotDay - 10) });
}

function insertChangeOrder(bookingId: string, amounts = { labor: 4_000, parts: 1_500 }): string {
  const id = newId();
  const nowIso = t.ctx.now.toISOString();
  t.sqlite
    .prepare(
      `INSERT INTO change_orders (id, booking_id, proposed_by, description, reason, labor_cents, parts_cents, tax_cents,
         amount_cents, status, payment_state, is_demo_fixture, created_at, updated_at)
       VALUES (?, ?, ?, 'Replace corroded battery terminal', 'Found corrosion during the job', ?, ?, 0, ?, 'proposed',
         'demo_fixture_no_real_payment', 1, ?, ?)`,
    )
    .run(id, bookingId, mechanic.id, amounts.labor, amounts.parts, amounts.labor + amounts.parts, nowIso, nowIso);
  return id;
}

function insertInvoice(booking: TestDemoBooking): string {
  const id = newId();
  const totals = computeInvoiceTotals(booking.quote.totals, []);
  t.sqlite
    .prepare(
      `INSERT INTO invoices (id, booking_id, invoice_number, currency, line_items_json, labor_cents, parts_cents, tax_cents,
         fee_cents, total_cents, platform_fee_bps, platform_fee_cents, mechanic_payout_cents, approved_change_order_count,
         notes, issued_by, issued_at, is_demo_fixture)
       VALUES (?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Thanks!', ?, ?, 1)`,
    )
    .run(
      id,
      booking.id,
      `DEMO-${id.slice(0, 6)}`,
      JSON.stringify([
        { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 12_000, amountCents: 12_000 },
        { kind: "part", description: "Parts", quantity: 1, unit_price_cents: 4_550, amount_cents: 4_550 },
      ]),
      totals.laborCents,
      totals.partsCents,
      totals.taxCents,
      totals.feeCents,
      totals.totalCents,
      totals.platformFeeBps,
      totals.platformFeeCents,
      totals.mechanicPayoutCents,
      mechanic.id,
      t.ctx.now.toISOString(),
    );
  return id;
}

describe("decideChangeOrder", () => {
  it("approves a proposed change order, says payment isn't connected, and notifies the mechanic", async () => {
    const booking = await fixture("in_progress");
    const changeOrderId = insertChangeOrder(booking.id);

    const result = await decideChangeOrder(t.ctx, customer, { changeOrderId, decision: "approve", note: "Go ahead" });

    expect(result).toEqual({
      changeOrderId,
      bookingId: booking.id,
      status: "approved",
      message:
        "You approved the extra work ($55.00). Online payments are coming soon, so nothing has been charged.",
    });
    expect(rows("SELECT status, decided_by, decided_at, decision_note FROM change_orders WHERE id = ?", changeOrderId)).toEqual([
      { status: "approved", decided_by: customer.id, decided_at: t.ctx.now.toISOString(), decision_note: "Go ahead" },
    ]);
    const [notice] = rows<{ user_id: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, title, body, link_path FROM notifications",
    );
    expect(notice).toMatchObject({ user_id: mechanic.id, title: "Change order approved", link_path: `/mechanic/bookings/${booking.id}` });
    expect(notice.body).toContain("Online payments are coming soon");
    expect(notice.body).not.toMatch(/demo/i);
    expect(rows("SELECT action, reason FROM audit_events")).toEqual([{ action: "change_order.approve", reason: "Go ahead" }]);
    expect(rows("SELECT to_user_id, template FROM email_outbox")).toEqual([
      { to_user_id: mechanic.id, template: "change_order_approved" },
    ]);

    const again = await rejection(decideChangeOrder(t.ctx, customer, { changeOrderId, decision: "reject" }));
    expect(again.code).toBe("conflict");
  });

  it("declines a change order and shows decisions on the booking", async () => {
    const booking = await fixture("confirmed");
    const declined = insertChangeOrder(booking.id);
    const pending = insertChangeOrder(booking.id, { labor: 2_000, parts: 0 });

    await expect(decideChangeOrder(t.ctx, customer, { changeOrderId: declined, decision: "reject" })).resolves.toMatchObject({
      status: "rejected",
    });
    expect(rows("SELECT title FROM notifications WHERE user_id = ?", mechanic.id)).toEqual([{ title: "Change order declined" }]);

    const detail = await getMyBooking(t.ctx, customer, booking.id);
    expect(detail.pendingChangeOrderCount).toBe(1);
    expect(
      detail.changeOrders.map((order) => [order.id, order.status, order.canDecide, order.amountCents]).sort(),
    ).toEqual(
      [
        [declined, "rejected", false, 5_500],
        [pending, "proposed", true, 2_000],
      ].sort(),
    );
  });

  it("only lets the booking's customer decide, and only while the booking is active", async () => {
    const booking = await fixture("confirmed");
    const changeOrderId = insertChangeOrder(booking.id);

    expect((await rejection(decideChangeOrder(t.ctx, otherCustomer, { changeOrderId, decision: "approve" }))).code).toBe(
      "not_found",
    );
    expect((await rejection(decideChangeOrder(t.ctx, mechanic, { changeOrderId, decision: "approve" }))).code).toBe("forbidden");
    expect(
      (await rejection(decideChangeOrder(t.ctx, customer, { changeOrderId: "missing", decision: "approve" }))).code,
    ).toBe("not_found");

    t.sqlite.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), booking.id);
    const inactive = await rejection(decideChangeOrder(t.ctx, customer, { changeOrderId, decision: "approve" }));
    expect([inactive.code, inactive.userMessage]).toEqual([
      "conflict",
      "This booking is no longer active, so its change orders can't be decided.",
    ]);
    expect(rows("SELECT status FROM change_orders WHERE id = ?", changeOrderId)).toEqual([{ status: "proposed" }]);
  });
});

describe("submitReview", () => {
  it("records one review for a completed booking, flagged as a demo fixture when the booking is one", async () => {
    const booking = await fixture("completed");

    const result = await submitReview(t.ctx, customer, { bookingId: booking.id, rating: 5, comment: "Quick and tidy" });

    expect(result).toEqual({ reviewId: expect.any(String), bookingId: booking.id, isDemoFixture: true });
    expect(rows("SELECT customer_id, mechanic_id, rating, comment, is_demo_fixture FROM reviews")).toEqual([
      { customer_id: customer.id, mechanic_id: mechanic.id, rating: 5, comment: "Quick and tidy", is_demo_fixture: 1 },
    ]);
    const [notice] = rows<{ user_id: string; title: string; body: string }>("SELECT user_id, title, body FROM notifications");
    expect(notice).toMatchObject({ user_id: mechanic.id, title: "New review: 5 stars" });
    expect(notice.body).toMatch(/doesn't count toward your rating/);
    expect(notice.body).not.toMatch(/demo/i);
    expect(rows("SELECT action FROM audit_events")).toEqual([{ action: "review.submit" }]);
    expect(rows("SELECT to_user_id, template FROM email_outbox")).toEqual([
      { to_user_id: mechanic.id, template: "review_received" },
    ]);

    const detail = await getMyBooking(t.ctx, customer, booking.id);
    expect(detail.review).toMatchObject({ rating: 5, isDemoFixture: true, countsTowardRating: false });
    expect([detail.canReview, detail.hasReview]).toEqual([false, true]);

    const again = await rejection(submitReview(t.ctx, customer, { bookingId: booking.id, rating: 1 }));
    expect([again.code, again.userMessage]).toEqual(["conflict", "You've already reviewed this booking."]);
  });

  it("refuses bookings that aren't completed, other customers' bookings and invalid ratings", async () => {
    const confirmed = await fixture("confirmed");
    const notDone = await rejection(submitReview(t.ctx, customer, { bookingId: confirmed.id, rating: 4 }));
    expect([notDone.code, notDone.userMessage]).toEqual(["conflict", "You can leave a review once the work is completed."]);

    const request = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const { bookingId } = await selectQuote(t.ctx, customer, {
      quoteId: quote.id,
      acceptedConsentKeys: BOOKING_CONSENTS.map((consent) => consent.key),
    });
    expect((await rejection(submitReview(t.ctx, customer, { bookingId, rating: 4 }))).code).toBe("conflict");

    const completed = await fixture("completed");
    expect((await rejection(submitReview(t.ctx, otherCustomer, { bookingId: completed.id, rating: 4 }))).code).toBe("not_found");
    expect((await rejection(submitReview(t.ctx, mechanic, { bookingId: completed.id, rating: 4 }))).code).toBe("forbidden");
    const invalid = await rejection(submitReview(t.ctx, customer, { bookingId: completed.id, rating: 6 }));
    expect(fieldErrorsOf(invalid)).toEqual({ rating: ["Choose a rating from 1 to 5 stars."] });
    expect(rows("SELECT count(*) AS n FROM reviews")).toEqual([{ n: 0 }]);
  });
});

describe("getAccountOverview", () => {
  it("counts and lists the customer's requests, quotes, reservations, confirmed bookings and follow-ups", async () => {
    const otherMechanic = await createMechanic(t.ctx);
    await createOpenRequest(t.ctx, customer); // open, waiting for quotes
    const quoted = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: quoted.id, mechanicId: mechanic.id, slotStart: addDays(t.ctx.now, 20) });
    await createSubmittedQuote(t.ctx, { requestId: quoted.id, mechanicId: otherMechanic.id, slotStart: addDays(t.ctx.now, 20) });
    const reservedRequest = await createOpenRequest(t.ctx, customer);
    const reservedQuote = await createSubmittedQuote(t.ctx, {
      requestId: reservedRequest.id,
      mechanicId: otherMechanic.id,
      slotStart: addDays(t.ctx.now, 25),
    });
    await selectQuote(t.ctx, customer, {
      quoteId: reservedQuote.id,
      acceptedConsentKeys: BOOKING_CONSENTS.map((consent) => consent.key),
    });

    const active = await fixture("confirmed");
    insertChangeOrder(active.id);
    const invoiced = await fixture("completed");
    insertInvoice(invoiced);
    const reviewed = await fixture("completed");
    await submitReview(t.ctx, customer, { bookingId: reviewed.id, rating: 4 });
    await createSupportRequest(t.ctx, customer, {
      topic: "booking_issue",
      message: "The mechanic arrived an hour late.",
      bookingId: active.id,
    });
    await createOpenRequest(t.ctx, otherCustomer); // never counted

    const overview = await getAccountOverview(t.ctx, customer);

    expect(overview.openRequests.count).toBe(2);
    expect(overview.quotesAwaitingDecision).toMatchObject({
      count: 2,
      requests: [{ requestId: quoted.id, liveQuoteCount: 2, lowestLiveQuoteCents: 16_550 }],
    });
    expect(overview.pendingReservations.count).toBe(1);
    expect(overview.pendingReservations.items[0].requestId).toBe(reservedRequest.id);
    expect(overview.confirmedBookings.count).toBe(3);
    expect(overview.confirmedBookings.countsByStatus).toMatchObject({ confirmed: 1, completed: 2, pending_payment: 0 });
    expect(overview.invoices).toMatchObject({ count: 1, items: [{ bookingId: invoiced.id, totalCents: 16_550 }] });
    expect(overview.changeOrdersAwaitingApproval).toMatchObject({
      count: 1,
      items: [{ bookingId: active.id, amountCents: 5_500 }],
    });
    expect(overview.reviews.givenCount).toBe(1);
    expect(overview.reviews.awaitingReview.map((booking) => booking.id)).toEqual([invoiced.id]);
    expect(overview.reviews.awaitingReviewCount).toBe(1);
    expect(overview.supportRequests.openCount).toBe(1);
    expect(overview.unreadNotificationCount).toBe(
      (t.sqlite.prepare("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(customer.id) as { n: number }).n,
    );
    expect(overview.totals).toEqual({ requests: 6, bookings: 4 });

    const empty = await getAccountOverview(t.ctx, otherCustomer);
    expect([empty.openRequests.count, empty.confirmedBookings.count, empty.invoices.count]).toEqual([1, 0, 0]);
    expect((await rejection(getAccountOverview(t.ctx, mechanic))).code).toBe("forbidden");
  });

  it("shows an open account deletion request until the help desk resolves it", async () => {
    const admin = await createUser(t.ctx, { role: "admin" });
    expect((await getAccountOverview(t.ctx, customer)).accountDeletion).toBeNull();

    const { supportRequestId } = await requestAccountDeletion(t.ctx, customer);
    expect((await getAccountOverview(t.ctx, customer)).accountDeletion).toEqual({
      requestedAt: t.ctx.now.toISOString(),
      timeZone: expect.any(String),
    });
    expect((await getAccountOverview(t.ctx, otherCustomer)).accountDeletion).toBeNull();

    t.sqlite
      .prepare(
        "UPDATE support_requests SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution_note = 'Handled.' WHERE id = ?",
      )
      .run(admin.id, t.ctx.now.toISOString(), supportRequestId);
    expect((await getAccountOverview(t.ctx, customer)).accountDeletion).toBeNull();
  });

  it("parses issued invoice lines for the booking page", async () => {
    const booking = await fixture("completed");
    insertInvoice(booking);
    const detail = await getMyBooking(t.ctx, customer, booking.id);
    expect(detail.invoice).toMatchObject({ totalCents: 16_550, platformFeeCents: 1_200, isDemoFixture: true, notes: "Thanks!" });
    expect(detail.invoice?.lineItems).toEqual([
      { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 12_000, amountCents: 12_000 },
      { kind: "part", description: "Parts", quantity: 1, unitPriceCents: 4_550, amountCents: 4_550 },
    ]);
    expect(JSON.stringify(detail.invoice)).not.toMatch(/payout/i);
  });
});
