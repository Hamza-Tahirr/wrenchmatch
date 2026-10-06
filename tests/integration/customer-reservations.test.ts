// Reserving a quote (pending payment), the payment guard, cancelling a reservation, and the
// customer's booking read models (money from snapshots, contact details only once confirmed).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BOOKING_CONSENTS, buildConsentSnapshot } from "@/lib/domain";
import { addDays, addHours } from "@/server/clock";
import type { AppContext, Viewer } from "@/server/context";
import { ONLINE_PAYMENT_SOON_SHORT, ONLINE_PAYMENTS_SOON_LABEL } from "@/server/customer/booking-views";
import { fieldErrorsOf } from "@/server/customer/form-errors";
import {
  cancelReservation,
  getMyBooking,
  getReservationPreview,
  listMyBookings,
  selectQuote,
} from "@/server/customer/reservations";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { computeBookingMoney, computeQuoteTotals } from "@/server/pricing";
import { createTestContext, openExtraConnection, withNow, type TestContext } from "../support/db";
import {
  bookingRowFor,
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createSubmittedQuote,
  createUser,
  TEST_ZIPS,
  type QuoteItemInput,
  type TestMechanic,
  type TestQuote,
  type TestRequest,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let marco: TestMechanic;
let dana: TestMechanic;
let request: TestRequest;
let quoteA: TestQuote; // Marco: $120 labor + $45.50 parts
let quoteB: TestQuote; // Dana: itemized with tax and fee

const CONSENTS = BOOKING_CONSENTS.map((consent) => consent.key);

const ITEMIZED: readonly QuoteItemInput[] = [
  { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 15_050 },
  { kind: "part", description: "Battery", quantity: 1, unitPriceCents: 18_999 },
  { kind: "tax", description: "Sales tax", quantity: 1, unitPriceCents: 1_520 },
  { kind: "fee", description: "Disposal fee", quantity: 1, unitPriceCents: 300 },
];

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  marco = await createMechanic(t.ctx, {
    displayName: "Marco R.",
    phone: "480-555-0177",
    businessName: "Rodriguez Auto LLC",
    serviceMode: "both",
  });
  dana = await createMechanic(t.ctx, { displayName: "Dana K.", baseZip: "85281" });
  request = await createOpenRequest(t.ctx, customer);
  quoteA = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });
  quoteB = await createSubmittedQuote(t.ctx, {
    requestId: request.id,
    mechanicId: dana.id,
    items: ITEMIZED,
    serviceMode: "garage",
  });
});

afterEach(async () => {
  await t.cleanup();
});

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

function count(query: string, ...params: unknown[]): number {
  return (t.sqlite.prepare(query).get(...params) as { n: number }).n;
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

function select(ctx: AppContext, quote: TestQuote, viewer: Viewer = customer, consents: readonly string[] = CONSENTS) {
  return selectQuote(ctx, viewer, { quoteId: quote.id, acceptedConsentKeys: consents });
}

describe("selectQuote", () => {
  it("creates a pending-payment reservation with server-computed money and immutable snapshots", async () => {
    const nowIso = t.ctx.now.toISOString();
    const result = await select(t.ctx, quoteB);

    expect(result).toEqual({ bookingId: expect.any(String), requestId: request.id, created: true });
    const expected = computeBookingMoney(computeQuoteTotals(ITEMIZED));
    expect(expected).toMatchObject({ totalCents: 35_869, platformFeeCents: 1_505, mechanicPayoutCents: 34_364 });
    const [booking] = rows<Record<string, unknown>>(
      `SELECT status, payment_state, payout_status, customer_id, mechanic_id, service_mode, slot_start_at, slot_end_at,
              labor_cents, parts_cents, tax_cents, fee_cents, total_cents, platform_fee_bps, platform_fee_cents,
              mechanic_payout_cents, is_demo_fixture, quote_snapshot_json, consent_snapshot_json
         FROM bookings WHERE id = ?`,
      result.bookingId,
    );
    expect(booking).toMatchObject({
      status: "pending_payment",
      payment_state: "stripe_not_connected",
      payout_status: "not_eligible",
      customer_id: customer.id,
      mechanic_id: dana.id,
      service_mode: "garage",
      slot_start_at: quoteB.slotStartAt,
      slot_end_at: quoteB.slotEndAt,
      labor_cents: expected.laborCents,
      parts_cents: expected.partsCents,
      tax_cents: expected.taxCents,
      fee_cents: expected.feeCents,
      total_cents: expected.totalCents,
      platform_fee_bps: 1000,
      platform_fee_cents: expected.platformFeeCents,
      mechanic_payout_cents: expected.mechanicPayoutCents,
      is_demo_fixture: 0,
    });
    const snapshot = JSON.parse(booking.quote_snapshot_json as string);
    expect(snapshot).toMatchObject({
      version: 1,
      computedAt: nowIso,
      quote: { id: quoteB.id, requestId: request.id, serviceMode: "garage", slotStartAt: quoteB.slotStartAt },
      mechanic: { id: dana.id, displayName: "Dana K.", areaLabel: "Based near Tempe, AZ" },
      totals: expected,
    });
    expect(snapshot.items).toEqual(
      ITEMIZED.map((item) => ({ ...item, amountCents: item.quantity * item.unitPriceCents })),
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/555-|@|Garage Way|POLICY/);
    expect(JSON.parse(booking.consent_snapshot_json as string)).toEqual(buildConsentSnapshot(BOOKING_CONSENTS, nowIso));

    expect(rows("SELECT id, status FROM quotes ORDER BY status")).toEqual([
      { id: quoteA.id, status: "declined" },
      { id: quoteB.id, status: "selected" },
    ]);
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "reserved" }]);

    const notices = rows<{ user_id: string; type: string; title: string; link_path: string }>(
      "SELECT user_id, type, title, link_path FROM notifications ORDER BY type",
    );
    expect(notices).toEqual([
      { user_id: customer.id, type: "booking.reserved", title: "Reservation created - payment pending", link_path: `/bookings/${result.bookingId}` },
      { user_id: marco.id, type: "quote.declined", title: "Your quote wasn't selected", link_path: `/mechanic/jobs/${request.id}` },
      {
        user_id: dana.id,
        type: "quote.selected",
        title: "Customer reserved your quote - awaiting payment (online payments coming soon)",
        link_path: `/mechanic/jobs/${request.id}`,
      },
    ]);
    expect(rows("SELECT action, entity_id FROM audit_events WHERE action = 'quote.select'")).toEqual([
      { action: "quote.select", entity_id: quoteB.id },
    ]);
    // Every notice is also captured in the dev mailbox, without contact details.
    const emails = rows<{ to_user_id: string; template: string; body_text: string }>(
      "SELECT to_user_id, template, body_text FROM email_outbox ORDER BY template",
    );
    expect(emails.map((email) => [email.to_user_id, email.template])).toEqual([
      [customer.id, "booking_reserved"],
      [marco.id, "quote_declined"],
      [dana.id, "quote_selected"],
    ]);
    for (const email of emails) expect(email.body_text).not.toMatch(/555-|Garage Way|@/);
  });

  it("returns the same reservation when the same quote is selected again", async () => {
    const first = await select(t.ctx, quoteA);
    const second = await select(t.ctx, quoteA);
    expect(second).toEqual({ bookingId: first.bookingId, requestId: request.id, created: false });
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(1);
    expect(count("SELECT count(*) AS n FROM notifications WHERE type = 'quote.selected'")).toBe(1);
  });

  it("refuses a second, different quote on the same request", async () => {
    await select(t.ctx, quoteA);
    const error = await rejection(select(t.ctx, quoteB));
    expect(error.code).toBe("conflict");
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(1);
  });

  it("leaves exactly one reservation when two connections select at the same time", async () => {
    // Fail fast instead of blocking the shared event loop for the default 5 s busy timeout.
    t.sqlite.pragma("busy_timeout = 200");
    const extra = openExtraConnection(t.dir);
    extra.sqlite.pragma("busy_timeout = 200");
    const otherProcess: AppContext = { ...t.ctx, db: extra.db };

    const results = await Promise.allSettled([select(t.ctx, quoteA), select(otherProcess, quoteB)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [failure] = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(failure.reason).toBeInstanceOf(DomainError);
    expect((failure.reason as DomainError).code).toBe("conflict");
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(1);
    expect(count("SELECT count(*) AS n FROM quotes WHERE status = 'selected'")).toBe(1);
  });

  it("refuses an expired quote or request with quote_expired", async () => {
    const later = withNow(t.ctx, addHours(new Date(quoteA.expiresAt), 1));
    const expired = await rejection(select(later, quoteA));
    expect(expired.code).toBe("quote_expired");
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(0);

    const afterRequest = withNow(t.ctx, addDays(t.ctx.now, 8));
    expect((await rejection(select(afterRequest, quoteB))).code).toBe("quote_expired");
  });

  it("refuses mechanics who can no longer be booked", async () => {
    t.sqlite
      .prepare("UPDATE mechanic_profiles SET status = 'suspended', status_reason = 'Under review' WHERE user_id = ?")
      .run(marco.id);
    const suspended = await rejection(select(t.ctx, quoteA));
    expect(suspended.code).toBe("mechanic_not_eligible");
    expect(suspended.userMessage).not.toMatch(/suspend/i);

    t.sqlite.prepare("UPDATE mechanic_profiles SET accepting_jobs = 0 WHERE user_id = ?").run(dana.id);
    expect((await rejection(select(t.ctx, quoteB))).code).toBe("mechanic_not_eligible");
    t.sqlite.prepare("UPDATE mechanic_profiles SET accepting_jobs = 1, insurance_expires_on = '2026-10-06' WHERE user_id = ?").run(dana.id);
    expect((await rejection(select(t.ctx, quoteB))).code).toBe("mechanic_not_eligible");
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(0);
  });

  it("requires every booking consent", async () => {
    const error = await rejection(select(t.ctx, quoteA, customer, CONSENTS.slice(0, 2)));
    expect(error.code).toBe("invalid_input");
    expect(fieldErrorsOf(error)).toEqual({ acceptedConsentKeys: ["Tick all three statements to reserve this quote."] });
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(0);
  });

  it("hides other customers' quotes and refuses withdrawn or inconsistent ones", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    expect((await rejection(select(t.ctx, quoteA, other))).code).toBe("not_found");
    expect((await rejection(select(t.ctx, quoteA, marco))).code).toBe("forbidden");

    t.sqlite.prepare("UPDATE quotes SET status = 'withdrawn', withdrawn_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), quoteA.id);
    const withdrawn = await rejection(select(t.ctx, quoteA));
    expect([withdrawn.code, withdrawn.userMessage]).toEqual(["conflict", "The mechanic withdrew this quote. Choose another quote."]);

    t.sqlite
      .prepare(
        "INSERT INTO quote_items (id, quote_id, kind, description, quantity, unit_price_cents, amount_cents) VALUES ('extra-item', ?, 'part', 'Extra', 1, 100, 100)",
      )
      .run(quoteB.id);
    const inconsistent = await rejection(select(t.ctx, quoteB));
    expect(inconsistent.code).toBe("conflict");
    expect(inconsistent.userMessage).toMatch(/prices don't add up/);
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(0);
  });
});

describe("the payment guard", () => {
  it("never lets a pending reservation become confirmed", async () => {
    const { bookingId } = await select(t.ctx, quoteA);
    expect(() => t.sqlite.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(bookingId)).toThrow(
      "payment_not_connected",
    );
    const viaApp = await rejection(
      writeTx(t.ctx.db, (trx) =>
        trx.updateTable("bookings").set({ status: "in_progress" }).where("id", "=", bookingId).execute(),
      ),
    );
    expect(viaApp.code).toBe("payment_not_connected");
    expect(rows("SELECT status FROM bookings WHERE id = ?", bookingId)).toEqual([{ status: "pending_payment" }]);
  });
});

describe("cancelReservation", () => {
  it("cancels a pending reservation and frees the mechanic's slot", async () => {
    const { bookingId } = await select(t.ctx, quoteA);
    const elsewhere = await createOpenRequest(t.ctx, await createUser(t.ctx, { role: "customer" }));
    const overlapping = { requestId: elsewhere.id, mechanicId: marco.id, slotStart: addMinutesIso(quoteA.slotStartAt, 30) };
    await expect(createSubmittedQuote(t.ctx, overlapping)).rejects.toThrow("slot_conflict");
    t.sqlite.prepare("DELETE FROM notifications").run();

    await expect(cancelReservation(t.ctx, customer, { bookingId, reason: "Found a friend to help" })).resolves.toEqual({
      bookingId,
      requestId: request.id,
    });

    expect(rows("SELECT status, cancelled_at, cancel_reason FROM bookings WHERE id = ?", bookingId)).toEqual([
      { status: "cancelled", cancelled_at: t.ctx.now.toISOString(), cancel_reason: "Found a friend to help" },
    ]);
    expect(rows("SELECT status FROM quotes WHERE id = ?", quoteA.id)).toEqual([{ status: "declined" }]);
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "cancelled" }]);
    expect(rows("SELECT user_id, type FROM notifications")).toEqual([{ user_id: marco.id, type: "booking.cancelled" }]);
    expect(rows("SELECT action, reason FROM audit_events WHERE action = 'booking.cancel'")).toEqual([
      { action: "booking.cancel", reason: "Found a friend to help" },
    ]);
    await expect(createSubmittedQuote(t.ctx, overlapping)).resolves.toBeTruthy();

    expect((await rejection(cancelReservation(t.ctx, customer, { bookingId }))).code).toBe("conflict");
  });

  it("explains that a cancelled reservation's request can't be reserved again", async () => {
    const { bookingId } = await select(t.ctx, quoteA);
    await cancelReservation(t.ctx, customer, { bookingId });

    for (const quote of [quoteA, quoteB]) {
      const error = await rejection(select(t.ctx, quote));
      expect([error.code, error.userMessage]).toEqual([
        "conflict",
        "The reservation for this request was cancelled, so its quotes can't be reserved again. Send a new request instead.",
      ]);
    }
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(1);
    expect(rows("SELECT template FROM email_outbox WHERE to_user_id = ? AND template = 'booking_cancelled'", marco.id)).toHaveLength(1);
  });

  it("is limited to the customer's own pending reservations", async () => {
    const { bookingId } = await select(t.ctx, quoteA);
    const other = await createUser(t.ctx, { role: "customer" });
    expect((await rejection(cancelReservation(t.ctx, other, { bookingId }))).code).toBe("not_found");
    expect((await rejection(cancelReservation(t.ctx, marco, { bookingId }))).code).toBe("forbidden");

    const fixture = await createDemoFixtureBooking(t.ctx, { customer, mechanic: dana, slotStart: addDays(t.ctx.now, 4) });
    const confirmed = await rejection(cancelReservation(t.ctx, customer, { bookingId: fixture.id }));
    expect(confirmed.code).toBe("conflict");
    expect(confirmed.userMessage).toMatch(/help request/);
  });
});

function addMinutesIso(iso: string, minutes: number): Date {
  return new Date(new Date(iso).getTime() + minutes * 60_000);
}

describe("getMyBooking and listMyBookings", () => {
  it("show a pending reservation from its snapshots, without contact details or payout state", async () => {
    const { bookingId } = await select(t.ctx, quoteB);
    const booking = await getMyBooking(t.ctx, customer, bookingId);

    expect(booking).toMatchObject({
      id: bookingId,
      status: "pending_payment",
      statusLabel: "Pending payment",
      isDemoFixture: false,
      mechanicDisplayName: "Dana K.",
      serviceMode: "garage",
      canCancel: true,
      canReview: false,
      money: {
        currency: "USD",
        laborCents: 15_050,
        partsCents: 18_999,
        taxCents: 1_520,
        feeCents: 300,
        totalCents: 35_869,
        platformFeeBps: 1000,
        platformFeeCents: 1_505,
      },
      payment: { state: "stripe_not_connected", label: ONLINE_PAYMENTS_SOON_LABEL, gatewayConnected: false },
      contactVisibility: "hidden_until_confirmed",
      mechanicContact: null,
      serviceLocation: { mode: "garage", label: "At the mechanic's garage", customerAddress: null },
      terms: { partsIncluded: true, estimatedDurationMinutes: 90, snapshotTakenAt: t.ctx.now.toISOString() },
      changeOrders: [],
      invoice: null,
      review: null,
    });
    expect(booking.lineItems.parts.map((line) => [line.description, line.amountCents])).toEqual([["Battery", 18_999]]);
    // Map points are ZIP centroids only: the request's ZIP and the mechanic's base ZIP.
    expect(booking.request.approxLocation).toEqual({ lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng });
    expect(booking.mechanic.approxLocation).toEqual({ lat: TEST_ZIPS["85281"].lat, lng: TEST_ZIPS["85281"].lng });
    expect(booking.lineItems.fees.map((line) => line.description)).toEqual(["Disposal fee"]);
    expect(booking.consent?.items.map((item) => item.key)).toEqual(CONSENTS);
    expect(booking.consent?.acceptedAt).toBe(t.ctx.now.toISOString());

    const serialized = JSON.stringify(booking);
    expect(serialized).not.toMatch(/payout/i);
    for (const secret of [dana.email, "602-555-0142", "100 Test Garage Way", "TEST-POLICY"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("reveal mechanic contact only for confirmed demo bookings, with the garage address only for garage jobs", async () => {
    const garageJob = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: marco,
      serviceMode: "garage",
      slotStart: addDays(t.ctx.now, 4),
    });
    const mobileJob = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: marco,
      serviceMode: "mobile",
      status: "completed",
      slotStart: addDays(t.ctx.now, -2),
    });
    const cancelledJob = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: marco,
      status: "cancelled",
      slotStart: addDays(t.ctx.now, 6),
    });

    const garage = await getMyBooking(t.ctx, customer, garageJob.id);
    expect(garage).toMatchObject({
      status: "confirmed",
      isDemoFixture: true,
      contactVisibility: "visible",
      mechanicContact: {
        phone: "480-555-0177",
        email: marco.email,
        garageAddress: { line1: "100 Test Garage Way", city: "Phoenix", state: "AZ", zip: "85004" },
      },
      payment: { state: "demo_fixture_no_real_payment", label: ONLINE_PAYMENT_SOON_SHORT },
    });
    expect(JSON.stringify(garage)).not.toContain("Rodriguez Auto LLC");
    // Presentation mode: no "demo" copy, and nothing is ever described as paid.
    expect(`${garage.payment.label} ${garage.payment.description}`).not.toMatch(/demo|paid/i);

    const mobile = await getMyBooking(t.ctx, customer, mobileJob.id);
    expect(mobile.mechanicContact).toEqual({ phone: "480-555-0177", email: marco.email, garageAddress: null });
    expect(mobile.serviceLocation.customerAddress?.streetAddress).toBe("123 Test Street");
    expect(mobile.canReview).toBe(true);
    expect(mobile.lineItems.labor.map((line) => line.amountCents)).toEqual([12_000]);

    const cancelled = await getMyBooking(t.ctx, customer, cancelledJob.id);
    expect([cancelled.contactVisibility, cancelled.mechanicContact]).toEqual(["hidden", null]);

    const list = await listMyBookings(t.ctx, customer);
    expect(list.map((item) => item.id).sort()).toEqual([garageJob.id, mobileJob.id, cancelledJob.id].sort());
    expect(JSON.stringify(list)).not.toMatch(/payout|480-555-0177/i);
  });

  it("show the quote's own items when a seeded snapshot's items don't add up to the booking", async () => {
    const mismatched = JSON.stringify({
      quote: { scope: "Seeded scope" },
      items: [{ kind: "labor", description: "Labor (wrong price)", quantity: 1, unitPriceCents: 99 }],
    });
    const fixture = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: dana,
      items: ITEMIZED,
      slotStart: addDays(t.ctx.now, 5),
      quoteSnapshotJson: mismatched,
    });
    const booking = await getMyBooking(t.ctx, customer, fixture.id);
    expect(booking.lineItems.labor.map((line) => [line.description, line.amountCents])).toEqual([["Labor", 15_050]]);
    expect(booking.lineItems.parts.map((line) => line.amountCents)).toEqual([18_999]);
    expect(booking.terms.scope).toBe("Seeded scope");
    expect(booking.money.totalCents).toBe(35_869);

    // A flat snapshot (terms at the top level) whose items add up is shown as recorded.
    const flat = JSON.stringify({
      scope: "Flat seeded scope",
      estimatedDurationMinutes: 45,
      items: [
        { kind: "labor", description: "Install battery", quantity: 1, unitPriceCents: 12_000 },
        { kind: "part", description: "Group 35 battery", quantity: 1, unitPriceCents: 4_550 },
      ],
    });
    const flatFixture = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: dana,
      slotStart: addDays(t.ctx.now, 6),
      quoteSnapshotJson: flat,
    });
    const flatBooking = await getMyBooking(t.ctx, customer, flatFixture.id);
    expect(flatBooking.lineItems.labor.map((line) => line.description)).toEqual(["Install battery"]);
    expect(flatBooking.lineItems.parts.map((line) => [line.description, line.amountCents])).toEqual([["Group 35 battery", 4_550]]);
    expect([flatBooking.terms.scope, flatBooking.terms.estimatedDurationMinutes]).toEqual(["Flat seeded scope", 45]);
  });

  it("are private to the booking's customer", async () => {
    const { bookingId } = await select(t.ctx, quoteA);
    const other = await createUser(t.ctx, { role: "customer" });
    expect((await rejection(getMyBooking(t.ctx, other, bookingId))).code).toBe("not_found");
    expect(await listMyBookings(t.ctx, other)).toEqual([]);
    expect((await rejection(getMyBooking(t.ctx, marco, bookingId))).code).toBe("forbidden");
  });
});

describe("getReservationPreview", () => {
  it("shows the money, consents and payment status before reserving, then points to the booking", async () => {
    const preview = await getReservationPreview(t.ctx, customer, quoteB.id);
    expect(preview).toMatchObject({
      request: { id: request.id, status: "quoted" },
      quote: { id: quoteB.id, isSelectable: true },
      money: { totalCents: 35_869, platformFeeCents: 1_505, platformFeeBps: 1000 },
      consents: { items: BOOKING_CONSENTS },
      payment: { connected: false, label: ONLINE_PAYMENTS_SOON_LABEL },
      requestArea: { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng },
      existingBookingId: null,
    });
    expect(JSON.stringify(preview)).not.toMatch(/payout/i);

    const { bookingId } = await select(t.ctx, quoteB);
    const after = await getReservationPreview(t.ctx, customer, quoteB.id);
    expect([after.existingBookingId, after.quote.isSelectable]).toEqual([bookingId, false]);

    const other = await createUser(t.ctx, { role: "customer" });
    expect((await rejection(getReservationPreview(t.ctx, other, quoteB.id))).code).toBe("not_found");
  });
});

describe("database guards behind selectQuote", () => {
  it("UNIQUE(bookings.request_id) stops a second reservation even if the checks are bypassed", async () => {
    await select(t.ctx, quoteA);
    const duplicate = await rejection(
      writeTx(t.ctx.db, (trx) => trx.insertInto("bookings").values(bookingRowFor(t.ctx, quoteB, customer.id)).execute()),
    );
    expect([duplicate.code, duplicate.userMessage]).toEqual(["conflict", "This request already has a reservation."]);
    expect(count("SELECT count(*) AS n FROM bookings")).toBe(1);
  });
});
