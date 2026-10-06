// The mechanic's bookings (src/server/mechanic/bookings.ts, booking-commands.ts): own bookings
// only, contact details and media only for confirmed (seeded) bookings, valid transitions (a
// pending-payment reservation can't be started), change orders and invoice math, approximate
// map points only, and presentation-mode wording (never "demo", never anything paid online).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BookingStatus } from "@/lib/domain";
import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import {
  completeJob,
  issueInvoice,
  proposeChangeOrder,
  startJob,
  withdrawChangeOrder,
  type ProposeChangeOrderInput,
} from "@/server/mechanic/booking-commands";
import {
  CHANGE_ORDER_APPROVED_NOTE,
  getMyBooking,
  listMyBookings,
  NEW_WORK_BLOCKED_MESSAGE,
  PENDING_CHANGE_ORDER_BLOCK,
} from "@/server/mechanic/bookings";
import {
  AWAITING_PAYMENT_NOTICE,
  NO_ONLINE_PAYMENT_NOTICE,
  NO_PAYOUT_NOTE,
  NOT_YET_ELIGIBLE_LABEL,
  PAYOUT_ACCOUNT_NOTICE,
  payoutNote,
} from "@/server/mechanic/payouts";
import { PAYMENTS_NOT_CONNECTED_LABEL } from "@/server/payments";
import { computeInvoiceTotals } from "@/server/pricing";
import { canViewFile } from "@/server/storage/file-access";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type DemoBookingInput,
  type TestMechanic,
  TEST_ZIPS,
  type TestRequest,
} from "../support/factories";

// Default quote items: $120.00 labor + $45.50 parts = $165.50. Requests: ZIP 85004 (Phoenix),
// customer phone 602-555-0199, street "123 Test Street".

const CONTACT_PHONE = "602-555-0199";
const STREET = "123 Test Street";

let t: TestContext;
let customer: Viewer;
let mechanic: TestMechanic;
let rival: TestMechanic;

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

function fixture(status: Exclude<BookingStatus, "pending_payment">, options: Partial<DemoBookingInput> = {}) {
  return createDemoFixtureBooking(t.ctx, { customer, mechanic, status, ...options });
}

async function pendingBooking(slotStart = new Date("2026-10-09T16:00:00.000Z")) {
  const request = await createOpenRequest(t.ctx, customer, { vehicleModel: "Pending" });
  const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart });
  return createPendingBooking(t.ctx, { quote, customer });
}

async function addMedia(request: TestRequest, kind: "photo" | "video", shareable: boolean): Promise<string> {
  const id = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id,
      owner_user_id: request.customerId,
      purpose: kind === "photo" ? "request_photo" : "request_video",
      storage_key: `test/${id}.bin`,
      mime_type: kind === "photo" ? "image/jpeg" : "video/mp4",
      size_bytes: 2048,
      sha256: "0".repeat(64),
      metadata_stripped: kind === "photo" ? 1 : 0,
      created_at: t.ctx.now.toISOString(),
    })
    .execute();
  await t.ctx.db
    .insertInto("request_media")
    .values({ file_id: id, request_id: request.id, kind, shareable_before_booking: shareable ? 1 : 0 })
    .execute();
  return id;
}

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<DomainError> {
  const error = await promise.then(
    () => {
      throw new Error(`expected DomainError ${code}`);
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

/** Every string value in a DTO (keys such as isDemoFixture are internal and not shown). */
function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

/** Presentation mode: nothing the mechanic reads says "demo". */
function expectNoDemoWording(dto: unknown) {
  for (const text of stringValues(dto)) expect(text).not.toMatch(/demo/i);
}

function changeOrder(bookingId: string, overrides: Partial<ProposeChangeOrderInput> = {}): ProposeChangeOrderInput {
  return {
    bookingId,
    description: "Replace the cracked serpentine belt",
    reason: "Found deep cracks while replacing the battery.",
    laborCents: 5_000,
    partsCents: 2_000,
    taxCents: 300,
    ...overrides,
  };
}

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer", displayName: "Dana Customer", email: "dana.private@example.test" });
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
  rival = await createMechanic(t.ctx, { displayName: "Rival Garage" });
});

afterEach(async () => {
  await t.cleanup();
});

describe("listMyBookings", () => {
  it("lists only the mechanic's own bookings, active first, with honest payment wording", async () => {
    const pending = await pendingBooking();
    const confirmed = await fixture("confirmed", { slotStart: new Date("2026-10-08T16:00:00.000Z") });
    const inProgress = await fixture("in_progress", { slotStart: new Date("2026-10-05T15:00:00.000Z") });
    const completed = await fixture("completed", { slotStart: new Date("2026-10-01T16:00:00.000Z"), payoutStatus: "sent" });
    await createDemoFixtureBooking(t.ctx, { customer, mechanic: rival });

    const list = await listMyBookings(t.ctx, mechanic);
    expect(list.map((booking) => [booking.id, booking.status])).toEqual([
      [inProgress.id, "in_progress"],
      [confirmed.id, "confirmed"],
      [pending.id, "pending_payment"],
      [completed.id, "completed"],
    ]);
    expect(list[2]).toMatchObject({
      isDemoFixture: false,
      requestIsDemoFixture: false,
      paymentNotice: AWAITING_PAYMENT_NOTICE,
      payout: { status: "not_eligible", note: NO_PAYOUT_NOTE },
      totalCents: 16_550,
      platformFeeCents: 1_200,
      mechanicPayoutCents: 15_350,
      vehicleLabel: "2016 Toyota Pending",
      hasInvoice: false,
      invoiceTotals: null,
    });
    expect(list[3]).toMatchObject({
      isDemoFixture: true,
      requestIsDemoFixture: true,
      paymentNotice: NO_ONLINE_PAYMENT_NOTICE,
      // Only test data reaches "sent"; it never reads as money paid out.
      payout: { status: "sent", label: "Marked sent", note: "Payout: marked sent - payouts start when online payments launch." },
    });
    // Map points are the request ZIP's centroid (85004 by default), never an address.
    for (const booking of list) expect(booking.approxPoint).toEqual({ lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng });
    expectNoDemoWording(list);
    const serialized = JSON.stringify(list);
    for (const secret of [customer.email, CONTACT_PHONE, STREET, "Dana Customer"]) expect(serialized).not.toContain(secret);
    await expectDomainError(listMyBookings(t.ctx, customer), "forbidden");
  });
});

describe("getMyBooking", () => {
  it("keeps the customer's contact details, address and media hidden while payment is pending", async () => {
    const pending = await pendingBooking();
    const photo = await addMedia(
      { id: pending.requestId, customerId: customer.id } as TestRequest,
      "photo",
      true,
    );
    const detail = await getMyBooking(t.ctx, mechanic, pending.id);
    expect(detail).toMatchObject({
      status: "pending_payment",
      customer: null,
      contactNotice: expect.stringContaining("Awaiting the customer's payment - online payments are coming soon"),
      media: { photoFileIds: [], videoFileId: null },
      actions: { canStart: false, canComplete: false, canProposeChangeOrder: false, canIssueInvoice: false },
      money: { totalCents: 16_550, platformFeeBps: 1000, platformFeeCents: 1_200, mechanicPayoutCents: 15_350 },
      payoutOnboarding: {
        connected: false,
        label: PAYMENTS_NOT_CONNECTED_LABEL,
        description: expect.stringContaining(PAYOUT_ACCOUNT_NOTICE),
      },
      paymentNotice: AWAITING_PAYMENT_NOTICE,
      payout: { status: "not_eligible", note: NO_PAYOUT_NOTE },
      approxPoint: { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng },
      // The mechanic's own base for the map: base ZIP centroid and travel radius only.
      base: {
        zip: "85004",
        areaLabel: "Phoenix, AZ 85004",
        point: { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng },
        travelRadiusMiles: 25,
        serviceMode: "both",
      },
    });
    expectNoDemoWording(detail);
    const serialized = JSON.stringify(detail);
    for (const secret of [customer.email, CONTACT_PHONE, STREET, "Dana Customer", photo]) expect(serialized).not.toContain(secret);
  });

  it("reveals contact details, the address and viewable media on a confirmed demo booking", async () => {
    const booking = await fixture("confirmed");
    const photo = await addMedia(booking.request, "photo", true);
    const unshared = await addMedia(booking.request, "photo", false);
    const video = await addMedia(booking.request, "video", false);

    const detail = await getMyBooking(t.ctx, mechanic, booking.id);
    expect(detail).toMatchObject({
      status: "confirmed",
      isDemoFixture: true,
      contactNotice: null,
      customer: {
        displayName: "Dana Customer",
        phone: CONTACT_PHONE,
        email: customer.email,
        address: { street: STREET, city: "Phoenix", state: "AZ", zip: "85004", label: "123 Test Street, Phoenix, AZ 85004" },
      },
      media: { videoFileId: video },
      serviceLocation: "At the customer's location",
      job: {
        scope: "Inspect and repair as described in the request.",
        partsIncluded: true,
        estimatedDurationMinutes: 90,
        items: [
          { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 12_000, amountCents: 12_000 },
          { kind: "part", description: "Parts", quantity: 1, unitPriceCents: 4_550, amountCents: 4_550 },
        ],
      },
      actions: { canStart: true, canComplete: false, canProposeChangeOrder: true, canIssueInvoice: false },
      // A seeded booking before completion: its payout becomes pending when the job is complete.
      payout: {
        status: "not_eligible",
        label: NOT_YET_ELIGIBLE_LABEL,
        note: "Payout: not eligible yet - payouts start when online payments launch.",
      },
      paymentNotice: NO_ONLINE_PAYMENT_NOTICE,
    });
    // The map still shows only the approximate area, even with the exact address on the page.
    expect(detail.approxPoint).toEqual({ lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng });
    expect(JSON.stringify({ approxPoint: detail.approxPoint, base: detail.base })).not.toContain(STREET);
    expect([...detail.media.photoFileIds].sort()).toEqual([photo, unshared].sort());
    // Every listed file id is one the file policy lets this mechanic open.
    for (const fileId of [...detail.media.photoFileIds, detail.media.videoFileId ?? ""]) {
      expect(await canViewFile(t.ctx, mechanic, fileId)).toBe(true);
    }
  });

  it("follows the privacy matrix for disputed and cancelled bookings", async () => {
    // Disputed keeps the confirmed-booking view: contact details, photos and video.
    const disputed = await fixture("disputed");
    const disputedVideo = await addMedia(disputed.request, "video", false);
    const disputedPhoto = await addMedia(disputed.request, "photo", false);
    const disputedDetail = await getMyBooking(t.ctx, mechanic, disputed.id);
    expect(disputedDetail.customer?.phone).toBe(CONTACT_PHONE);
    expect(disputedDetail.media).toEqual({ photoFileIds: [disputedPhoto], videoFileId: disputedVideo });
    for (const fileId of [disputedPhoto, disputedVideo]) {
      expect(await canViewFile(t.ctx, mechanic, fileId)).toBe(true);
    }

    const cancelled = await fixture("cancelled");
    const cancelledDetail = await getMyBooking(t.ctx, mechanic, cancelled.id);
    expect(cancelledDetail.customer).toBeNull();
    expect(cancelledDetail.contactNotice).toMatch(/cancelled/);
  });

  it("uses the snapshot's terms when they add up, and the quote's own items otherwise", async () => {
    const snapshot = {
      quote: { scope: "Snapshot scope: replace battery", exclusions: null, notes: "Snapshot note", partsIncluded: true, estimatedDurationMinutes: 45 },
      items: [
        { kind: "labor", description: "Battery install", quantity: 1, unitPriceCents: 12_000 },
        { kind: "part", description: "Group 35 battery", quantity: 1, unitPriceCents: 4_550 },
      ],
    };
    const fromSnapshot = await fixture("confirmed", { quoteSnapshotJson: JSON.stringify(snapshot) });
    expect((await getMyBooking(t.ctx, mechanic, fromSnapshot.id)).job).toEqual({
      scope: "Snapshot scope: replace battery",
      exclusions: null,
      notes: "Snapshot note",
      partsIncluded: true,
      estimatedDurationMinutes: 45,
      items: [
        { kind: "labor", description: "Battery install", quantity: 1, unitPriceCents: 12_000, amountCents: 12_000 },
        { kind: "part", description: "Group 35 battery", quantity: 1, unitPriceCents: 4_550, amountCents: 4_550 },
      ],
    });

    const tampered = { ...snapshot, items: [{ kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 99 }] };
    const fallback = await fixture("confirmed", { quoteSnapshotJson: JSON.stringify(tampered) });
    expect((await getMyBooking(t.ctx, mechanic, fallback.id)).job.items.map((item) => item.description)).toEqual(["Labor", "Parts"]);
  });

  it("is not_found for another mechanic's booking and forbidden for other roles", async () => {
    const theirs = await createDemoFixtureBooking(t.ctx, { customer, mechanic: rival });
    await expectDomainError(getMyBooking(t.ctx, mechanic, theirs.id), "not_found");
    await expectDomainError(getMyBooking(t.ctx, mechanic, newId()), "not_found");
    await expectDomainError(getMyBooking(t.ctx, customer, theirs.id), "forbidden");
    await expectDomainError(startJob(t.ctx, mechanic, theirs.id), "not_found");
    await expectDomainError(proposeChangeOrder(t.ctx, mechanic, changeOrder(theirs.id)), "not_found");
    expect(rows("SELECT status FROM bookings WHERE id = ?", theirs.id)).toEqual([{ status: "confirmed" }]);
  });
});

describe("startJob and completeJob", () => {
  it("refuses to start a pending-payment reservation", async () => {
    const pending = await pendingBooking();
    const error = await expectDomainError(startJob(t.ctx, mechanic, pending.id), "payment_not_connected");
    expect(error.userMessage).toMatch(/online payments are coming soon/);
    await expectDomainError(completeJob(t.ctx, mechanic, pending.id), "payment_not_connected");
    expect(rows("SELECT status, started_at FROM bookings WHERE id = ?", pending.id)).toEqual([
      { status: "pending_payment", started_at: null },
    ]);
  });

  it("moves a demo booking from confirmed to in progress to completed", async () => {
    const booking = await fixture("confirmed");
    await expectDomainError(completeJob(t.ctx, mechanic, booking.id), "conflict");

    expect(await startJob(t.ctx, mechanic, booking.id)).toEqual({ bookingId: booking.id, status: "in_progress" });
    expect((await expectDomainError(startJob(t.ctx, mechanic, booking.id), "conflict")).userMessage).toMatch(/in progress/);
    const later = withNow(t.ctx, "2026-10-05T19:30:00.000Z");
    expect(await completeJob(later, mechanic, booking.id)).toEqual({ bookingId: booking.id, status: "completed" });

    expect(rows("SELECT status, started_at, completed_at, payout_status FROM bookings WHERE id = ?", booking.id)).toEqual([
      {
        status: "completed",
        started_at: t.ctx.now.toISOString(),
        completed_at: "2026-10-05T19:30:00.000Z",
        payout_status: "pending",
      },
    ]);
    expect(
      rows<{ user_id: string; type: string; link_path: string }>(
        "SELECT user_id, type, link_path FROM notifications ORDER BY created_at",
      ),
    ).toEqual([
      { user_id: customer.id, type: "booking.started", link_path: `/bookings/${booking.id}` },
      { user_id: customer.id, type: "booking.completed", link_path: `/bookings/${booking.id}` },
    ]);
    expect(rows("SELECT action FROM audit_events ORDER BY created_at")).toEqual([
      { action: "booking.start" },
      { action: "booking.complete" },
    ]);
    const detail = await getMyBooking(later, mechanic, booking.id);
    expect(detail.payout).toEqual({
      status: "pending",
      label: "Pending",
      tone: "warning",
      note: "Payout: pending - payouts start when online payments launch.",
    });
    expect(detail.payout.note).toBe(payoutNote("Pending"));
    expectNoDemoWording(detail);
    expect(detail.actions).toMatchObject({ canStart: false, canComplete: false, canIssueInvoice: true });
  });
});

describe("a suspended mechanic", () => {
  it("can finish and invoice a job in progress but can't start work or add work", async () => {
    const confirmed = await fixture("confirmed");
    const inProgress = await fixture("in_progress");
    t.sqlite
      .prepare("UPDATE mechanic_profiles SET status = 'suspended', status_reason = 'Complaint under review' WHERE user_id = ?")
      .run(mechanic.id);

    expect((await getMyBooking(t.ctx, mechanic, confirmed.id)).actions).toMatchObject({
      canStart: false,
      canProposeChangeOrder: false,
      workBlockedReason: NEW_WORK_BLOCKED_MESSAGE,
    });
    await expectDomainError(startJob(t.ctx, mechanic, confirmed.id), "mechanic_not_eligible");
    await expectDomainError(proposeChangeOrder(t.ctx, mechanic, changeOrder(inProgress.id)), "mechanic_not_eligible");
    expect(rows("SELECT status FROM bookings WHERE id = ?", confirmed.id)).toEqual([{ status: "confirmed" }]);

    // Its own confirmed bookings stay visible, contact details included (privacy matrix).
    expect((await getMyBooking(t.ctx, mechanic, confirmed.id)).customer?.phone).toBe(CONTACT_PHONE);
    await completeJob(t.ctx, mechanic, inProgress.id);
    expect((await issueInvoice(t.ctx, mechanic, { bookingId: inProgress.id })).totalCents).toBe(16_550);
  });
});

describe("change orders", () => {
  it("are proposed on active bookings with strict integer cents and the booking's demo flags", async () => {
    const booking = await fixture("in_progress");
    const result = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id));
    expect(result).toEqual({ changeOrderId: result.changeOrderId, bookingId: booking.id, amountCents: 7_300 });
    expect(rows("SELECT * FROM change_orders")).toEqual([
      expect.objectContaining({
        id: result.changeOrderId,
        booking_id: booking.id,
        proposed_by: mechanic.id,
        labor_cents: 5_000,
        parts_cents: 2_000,
        tax_cents: 300,
        amount_cents: 7_300,
        status: "proposed",
        payment_state: "demo_fixture_no_real_payment",
        is_demo_fixture: 1,
      }),
    ]);
    const [note] = rows<{ user_id: string; type: string; body: string }>("SELECT user_id, type, body FROM notifications");
    expect(note).toMatchObject({ user_id: customer.id, type: "change_order.proposed" });
    expect(note.body).toContain("($73.00)");
    expect(note.body).toContain("Nothing extra is done or charged unless you approve it.");

    const detail = await getMyBooking(t.ctx, mechanic, booking.id);
    expect(detail.changeOrders).toEqual([
      expect.objectContaining({ id: result.changeOrderId, status: "proposed", statusLabel: "Awaiting approval", amountCents: 7_300, canWithdraw: true }),
    ]);
    expect(detail.pendingChangeOrderCount).toBe(1);

    for (const bad of [{ laborCents: 10.5 }, { laborCents: -100 }, { laborCents: 0, partsCents: 0, taxCents: 0 }, { reason: "  " }]) {
      await expectDomainError(proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id, bad)), "invalid_input");
    }
    expect(rows("SELECT id FROM change_orders")).toHaveLength(1);
  });

  it("are refused on pending reservations and finished bookings", async () => {
    const pending = await pendingBooking();
    await expectDomainError(proposeChangeOrder(t.ctx, mechanic, changeOrder(pending.id)), "payment_not_connected");
    const completed = await fixture("completed");
    await expectDomainError(proposeChangeOrder(t.ctx, mechanic, changeOrder(completed.id)), "conflict");
  });

  it("can be withdrawn by the mechanic until the customer decides", async () => {
    const booking = await fixture("confirmed");
    const { changeOrderId } = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id));
    const theirs = await createDemoFixtureBooking(t.ctx, { customer, mechanic: rival });
    const rivalOrder = await proposeChangeOrder(t.ctx, rival, changeOrder(theirs.id));
    await expectDomainError(withdrawChangeOrder(t.ctx, mechanic, rivalOrder.changeOrderId), "not_found");

    expect(await withdrawChangeOrder(t.ctx, mechanic, changeOrderId)).toEqual({ changeOrderId, bookingId: booking.id, status: "void" });
    expect(rows("SELECT status, decided_by, decided_at FROM change_orders WHERE id = ?", changeOrderId)).toEqual([
      { status: "void", decided_by: mechanic.id, decided_at: t.ctx.now.toISOString() },
    ]);
    await expectDomainError(withdrawChangeOrder(t.ctx, mechanic, changeOrderId), "conflict");
  });
});

describe("issueInvoice", () => {
  async function decide(changeOrderId: string, status: "approved" | "rejected" | "void") {
    t.sqlite
      .prepare("UPDATE change_orders SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?")
      .run(status, customer.id, t.ctx.now.toISOString(), changeOrderId);
  }

  it("bills the quote plus approved change orders only, with the platform fee on the combined labor", async () => {
    const booking = await fixture("in_progress");
    const approved = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id));
    const rejected = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id, { laborCents: 9_999, partsCents: 0, taxCents: 0 }));
    const voided = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id, { laborCents: 0, partsCents: 1_234, taxCents: 0 }));
    await decide(approved.changeOrderId, "approved");
    await decide(rejected.changeOrderId, "rejected");
    await decide(voided.changeOrderId, "void");
    await completeJob(t.ctx, mechanic, booking.id);

    const invoice = await issueInvoice(t.ctx, mechanic, { bookingId: booking.id, notes: "Thanks for choosing us." });
    const expected = computeInvoiceTotals(
      { laborCents: 12_000, partsCents: 4_550, taxCents: 0, feeCents: 0, totalCents: 16_550 },
      [{ laborCents: 5_000, partsCents: 2_000, taxCents: 300 }],
    );
    expect(expected).toEqual({
      laborCents: 17_000,
      partsCents: 6_550,
      taxCents: 300,
      feeCents: 0,
      totalCents: 23_850,
      platformFeeBps: 1000,
      platformFeeCents: 1_700,
      mechanicPayoutCents: 22_150,
      approvedChangeOrderCount: 1,
    });
    expect(invoice).toMatchObject({ ...expected, bookingId: booking.id });
    // Seeded and real invoices share the INV- format; the fixture flag stays on the row.
    expect(invoice.invoiceNumber).toMatch(/^INV-[A-HJ-KM-NP-Z2-9]{6}$/);

    const [row] = rows<Record<string, unknown>>("SELECT * FROM invoices WHERE booking_id = ?", booking.id);
    expect(row).toMatchObject({
      id: invoice.invoiceId,
      invoice_number: invoice.invoiceNumber,
      labor_cents: 17_000,
      parts_cents: 6_550,
      tax_cents: 300,
      fee_cents: 0,
      total_cents: 23_850,
      platform_fee_bps: 1000,
      platform_fee_cents: 1_700,
      mechanic_payout_cents: 22_150,
      approved_change_order_count: 1,
      notes: "Thanks for choosing us.",
      issued_by: mechanic.id,
      is_demo_fixture: 1,
    });
    const lines = JSON.parse(String(row.line_items_json)) as { source: string; kind: string; amountCents: number; changeOrderId: string | null }[];
    expect(lines.map((line) => [line.source, line.kind, line.amountCents])).toEqual([
      ["quote", "labor", 12_000],
      ["quote", "part", 4_550],
      ["change_order", "labor", 5_000],
      ["change_order", "part", 2_000],
      ["change_order", "tax", 300],
    ]);
    expect(lines.filter((line) => line.source === "change_order").every((line) => line.changeOrderId === approved.changeOrderId)).toBe(true);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(23_850);

    const detail = await getMyBooking(t.ctx, mechanic, booking.id);
    expect(detail.invoice).toMatchObject({ invoiceNumber: invoice.invoiceNumber, totalCents: 23_850, isDemoFixture: true });
    expect(detail.invoice?.lineItems).toHaveLength(5);
    expect(detail.actions.canIssueInvoice).toBe(false);
    expect(detail.changeOrders.find((order) => order.id === approved.changeOrderId)?.paymentNote).toBe(CHANGE_ORDER_APPROVED_NOTE);
    expectNoDemoWording(detail);

    // Once invoiced, the board shows the invoice's money (quote plus approved change orders), so
    // the list and the booking page show one payout figure, never the stale quote payout.
    const summary = (await listMyBookings(t.ctx, mechanic)).find((item) => item.id === booking.id);
    expect(summary).toMatchObject({
      hasInvoice: true,
      mechanicPayoutCents: 15_350,
      invoiceTotals: { totalCents: 23_850, mechanicPayoutCents: 22_150 },
    });

    const [note] = rows<{ title: string; body: string }>("SELECT title, body FROM notifications WHERE type = 'invoice.issued'");
    expect(note.title).toBe(`Invoice ${invoice.invoiceNumber} for your 2016 Toyota Camry`);
    expect(note.body).toContain("$238.50");
    expect(note.body).toContain("Nothing is charged online: online payments are coming soon.");
    expect(note.body).not.toMatch(/demo/i);
    expect(rows("SELECT action FROM audit_events WHERE entity_id = ?", invoice.invoiceId)).toEqual([{ action: "invoice.issue" }]);

    expect((await expectDomainError(issueInvoice(t.ctx, mechanic, { bookingId: booking.id }), "conflict")).userMessage).toMatch(
      /already been issued/,
    );
  });

  it("waits for completion and for pending change orders to be decided", async () => {
    const pending = await pendingBooking();
    await expectDomainError(issueInvoice(t.ctx, mechanic, { bookingId: pending.id }), "payment_not_connected");
    const confirmed = await fixture("confirmed");
    await expectDomainError(issueInvoice(t.ctx, mechanic, { bookingId: confirmed.id }), "conflict");

    const booking = await fixture("in_progress");
    const { changeOrderId } = await proposeChangeOrder(t.ctx, mechanic, changeOrder(booking.id));
    await completeJob(t.ctx, mechanic, booking.id);
    const blocked = await expectDomainError(issueInvoice(t.ctx, mechanic, { bookingId: booking.id }), "conflict");
    expect(blocked.userMessage).toBe(PENDING_CHANGE_ORDER_BLOCK);
    expect((await getMyBooking(t.ctx, mechanic, booking.id)).actions).toMatchObject({
      canIssueInvoice: false,
      invoiceBlockedReason: PENDING_CHANGE_ORDER_BLOCK,
    });

    await withdrawChangeOrder(t.ctx, mechanic, changeOrderId);
    const invoice = await issueInvoice(t.ctx, mechanic, { bookingId: booking.id });
    expect(invoice).toMatchObject({ totalCents: 16_550, platformFeeCents: 1_200, approvedChangeOrderCount: 0 });
    await expectDomainError(issueInvoice(t.ctx, rival, { bookingId: booking.id }), "not_found");
  });
});
