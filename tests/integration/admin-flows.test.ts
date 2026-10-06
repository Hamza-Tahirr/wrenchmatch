// The admin views on data written by the real customer, mechanic and support commands (not
// factories): a request submitted with a photo, matching and a re-run after an approval,
// quotes, a reservation and a help request, as an admin follows them from the dashboard.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BOOKING_CONSENTS, REQUEST_CONSENTS } from "@/lib/domain";
import { parseQuoteForm, type QuoteFormValues } from "@/lib/validation/quote";
import type { RepairRequestInput } from "@/lib/validation/request";
import { listAuditEvents } from "@/server/admin/audit-log";
import { getDashboard } from "@/server/admin/dashboard";
import { cancelDemoBooking, markDemoBookingDisputed, setDemoPayoutHold } from "@/server/admin/interventions";
import { listBookings, listQuotes, listReservations } from "@/server/admin/marketplace";
import { listMatchingFailures, rerunMatching } from "@/server/admin/matching";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { getMechanic } from "@/server/admin/mechanics";
import { getRequest, listRequests } from "@/server/admin/requests";
import { listSupportRequests, resolveSupportRequest } from "@/server/admin/support";
import { addHours } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { decideChangeOrder, submitReview } from "@/server/customer/post-booking";
import type { RequestUpload } from "@/server/customer/request-uploads";
import { submitRepairRequest } from "@/server/customer/requests";
import { selectQuote } from "@/server/customer/reservations";
import { DomainError } from "@/server/errors";
import { completeJob, issueInvoice, proposeChangeOrder, startJob } from "@/server/mechanic/booking-commands";
import { submitQuote } from "@/server/mechanic/quotes";
import { canViewFile } from "@/server/storage/file-access";
import { prepareUpload } from "@/server/storage/uploads";
import { createSupportRequest } from "@/server/support/requests";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createUser,
  createZip,
  TEST_ZIPS,
  type TestMechanic,
} from "../support/factories";

// ctx.now: Monday 5 Oct 2026, 10:00 in Phoenix. One shared database; each step builds on
// the previous one, like an admin following a single request through the demo.

let t: TestContext;
let admin: Viewer;
let customer: Viewer;
let marco: TestMechanic;
let applicant: TestMechanic;
let requestId: string;
let photoFileId: string;
let marcoQuoteId: string;
let bookingId: string;
let supportRequestId: string;

const PRIVATE_DETAILS = ["602-555-0199", "riley@example.test", "742 Private Lane", "Gate code 4242"];

function requestInput(): RepairRequestInput {
  return {
    zip: "85004",
    streetAddress: "742 Private Lane",
    city: "Phoenix",
    state: "AZ",
    locationNotes: "Gate code 4242",
    vehicleYear: 2016,
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    mileage: 98_000,
    categoryId: "battery_replacement",
    description: "The car won't start in the morning. The battery is four years old.",
    drivable: false,
    preferredDate: "2026-10-07",
    preferredWindow: "morning",
    serviceMode: "mobile",
    maxGarageDistanceMiles: 15,
    contactPhone: "602-555-0199",
    contactEmail: "riley@example.test",
    acceptedConsentKeys: REQUEST_CONSENTS.map((consent) => consent.key),
  };
}

function quoteInput(overrides: Partial<QuoteFormValues> = {}) {
  const parsed = parseQuoteForm({
    laborPrice: "120",
    partsIncluded: "yes",
    parts: [{ description: "AGM battery, group 35", quantity: "1", unitPrice: "189.99" }],
    taxes: [{ description: "Sales tax on parts", amount: "16.34" }],
    fees: [],
    earliestStart: "2026-10-07T09:00",
    durationMinutes: "90",
    serviceMode: "mobile",
    scope: "Test the battery and charging system, then replace the battery.",
    exclusions: "",
    notes: "",
    validityHours: "24",
    ...overrides,
  });
  if (!parsed.ok) throw new Error(`invalid test quote: ${JSON.stringify(parsed.fieldErrors)}`);
  return { requestId, ...parsed.data };
}

beforeAll(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin", displayName: "Avery Admin" });
  customer = await createUser(t.ctx, { role: "customer", displayName: "Riley" });
  await createZip(t.ctx, { zip: "85004", ...TEST_ZIPS["85004"], metroLabel: "Phoenix metro" });
  marco = await createMechanic(t.ctx, { displayName: "Marco R.", baseZip: "85004" });
  applicant = await createMechanic(t.ctx, { displayName: "Ana P.", baseZip: "85281", status: "under_review" });
});

afterAll(async () => {
  await t.cleanup();
});

describe("an admin following one request through the demo", () => {
  it("sees the submitted request, its photo and the one mechanic it reached", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();
    const photo: RequestUpload = {
      prepared: await prepareUpload({ bytes: jpeg, name: "battery.jpg", size: jpeg.byteLength }, "request_photo"),
      originalName: "battery.jpg",
    };
    const submitted = await submitRepairRequest(t.ctx, customer, requestInput(), { photos: [photo], videos: [] });
    requestId = submitted.requestId;
    expect(submitted.matchedCount).toBe(1);

    const detail = await getRequest(t.ctx, admin, requestId);
    expect(detail).toMatchObject({
      status: "open",
      matchedCount: 1,
      categoryName: "Battery replacement",
      vehicle: "2016 Toyota Camry",
      areaLabel: "Phoenix, AZ 85004",
      customer: { id: customer.id, displayName: "Riley" },
      consent: { items: expect.arrayContaining([expect.objectContaining({ key: "contact_sharing" })]) },
      rerunBlockedReason: null,
    });
    expect(detail.media).toEqual([expect.objectContaining({ kind: "photo", shareableBeforeBooking: true, mimeType: "image/jpeg" })]);
    photoFileId = detail.media[0].fileId;
    await expect(canViewFile(t.ctx, admin, photoFileId)).resolves.toBe(true);
    expect(detail.jobMatches.map((match) => match.mechanic.id)).toEqual([marco.id]);
    expect(detail.evaluations.find((evaluation) => evaluation.mechanic.id === applicant.id)).toMatchObject({
      eligible: false,
      reasons: [expect.objectContaining({ code: "status_not_approved", label: "Not approved" })],
    });
    for (const secret of PRIVATE_DETAILS) expect(JSON.stringify(detail)).not.toContain(secret);
  });

  it("finds it under matching failures, approves a mechanic and re-runs matching", async () => {
    let [failure] = (await listMatchingFailures(t.ctx, admin)).requests;
    expect(failure).toMatchObject({ request: { id: requestId, matchedCount: 1 }, rerun: { allowed: true, wouldNotify: 0 } });

    await setMechanicStatus(t.ctx, admin, { mechanicId: applicant.id, status: "approved" });
    [failure] = (await listMatchingFailures(t.ctx, admin)).requests;
    expect(failure.rerun).toEqual({ allowed: true, eligibleNow: 2, wouldNotify: 1 });

    const rerun = await rerunMatching(t.ctx, admin, requestId);
    expect(rerun).toMatchObject({ notifiedCount: 2, newlyNotified: [{ id: applicant.id, displayName: "Ana P." }] });
    expect((await listMatchingFailures(t.ctx, admin)).requests).toEqual([]);
  });

  it("compares the quotes the mechanics sent", async () => {
    marcoQuoteId = (await submitQuote(t.ctx, marco, quoteInput())).quoteId;
    await submitQuote(t.ctx, applicant, quoteInput({ laborPrice: "95", earliestStart: "2026-10-07T10:00" }));

    const detail = await getRequest(t.ctx, admin, requestId);
    expect(detail.status).toBe("quoted");
    expect(detail.quotes.map((quote) => [quote.mechanic.displayName, quote.status, quote.laborCents, quote.totalCents])).toEqual([
      ["Marco R.", "submitted", 12_000, 12_000 + 18_999 + 1_634],
      ["Ana P.", "submitted", 9_500, 9_500 + 18_999 + 1_634],
    ]);
    expect(detail.quotes[0].items.map((item) => item.kind)).toEqual(["labor", "part", "tax"]);
    expect((await listQuotes(t.ctx, admin, { status: "submitted" })).totalCount).toBe(2);
    expect((await listRequests(t.ctx, admin, { status: "quoted" })).items).toEqual([
      expect.objectContaining({ id: requestId, quotesCount: 2, activeQuotesCount: 2 }),
    ]);
  });

  it("sees the reservation stay pending payment, and cannot change it", async () => {
    const selection = await selectQuote(t.ctx, customer, {
      quoteId: marcoQuoteId,
      acceptedConsentKeys: BOOKING_CONSENTS.map((consent) => consent.key),
    });
    bookingId = selection.bookingId;

    expect((await listReservations(t.ctx, admin)).map((booking) => booking.id)).toEqual([bookingId]);
    const detail = await getRequest(t.ctx, admin, requestId);
    expect(detail).toMatchObject({
      status: "reserved",
      booking: {
        id: bookingId,
        status: "pending_payment",
        paymentState: "stripe_not_connected",
        isDemoFixture: false,
        interventions: { cancel: false, markDisputed: false, holdPayout: false, releasePayout: false },
      },
    });
    expect(detail.quotes.map((quote) => quote.status)).toEqual(["selected", "declined"]);
    expect((await listBookings(t.ctx, admin)).items[0]).toMatchObject({ id: bookingId, mechanic: { id: marco.id } });

    const refused = await cancelDemoBooking(t.ctx, admin, { bookingId, reason: "Customer asked us to cancel" }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(DomainError);
    expect(refused).toMatchObject({ code: "payment_not_connected" });
  });

  it("works the customer's help request about the reservation", async () => {
    ({ supportRequestId } = await createSupportRequest(t.ctx, customer, {
      topic: "booking_issue",
      message: "Can I move the appointment to the afternoon?",
      bookingId,
    }));

    const [item] = (await listSupportRequests(t.ctx, admin, { status: "open" })).items;
    expect(item).toMatchObject({
      id: supportRequestId,
      topicLabel: "Problem with a booking",
      requester: { id: customer.id, displayName: "Riley", role: "customer" },
      linkedRequest: { id: requestId, summary: "Battery replacement · 2016 Toyota Camry" },
      linkedBooking: { id: bookingId, status: "pending_payment", isDemoFixture: false },
    });
    expect((await getRequest(t.ctx, admin, requestId)).supportRequests).toEqual([
      expect.objectContaining({ id: supportRequestId, status: "open" }),
    ]);

    await resolveSupportRequest(t.ctx, admin, { supportRequestId, resolutionNote: "Ask the mechanic in the quote notes." });
    expect((await listSupportRequests(t.ctx, admin, { status: "open" })).totalCount).toBe(0);
  });

  it("reads it all back from the dashboard, the audit log and the mechanic's history", async () => {
    const dashboard = await getDashboard(t.ctx, admin);
    expect(dashboard).toMatchObject({
      reportingTimeZone: "America/Phoenix",
      mechanics: { awaitingReview: 0, byStatus: { approved: 2 } },
      requests: { open: 0, openWithZeroMatches: 0, byStatus: { reserved: 1 } },
      quotes: { active: 0 },
      bookings: { pendingPayment: 1, bookedTotal: 0 },
      supportRequestsOpen: 0,
    });
    expect(dashboard.emailsCapturedToday).toBeGreaterThan(0);
    expect(dashboard.recentRequests.map((request) => request.id)).toEqual([requestId]);

    const log = await listAuditEvents(t.ctx, admin);
    const events = log.items.map((event) => [event.actionLabel, event.actor.displayName, event.entityHref]);
    const requestPage = `/admin/requests/${requestId}`;
    expect(events).toEqual(
      expect.arrayContaining([
        ["Request submitted", "Riley", requestPage],
        ["Mechanic approved", "Avery Admin", `/admin/mechanics/${applicant.id}`],
        ["Matching re-run", "Avery Admin", requestPage],
        ["Quote sent", "Marco R.", requestPage],
        ["Quote sent", "Ana P.", requestPage],
        ["Quote selected (reservation created)", "Riley", requestPage],
        ["Help request opened", "Riley", "/admin/support"],
        ["Help request resolved", "Avery Admin", "/admin/support"],
      ]),
    );
    for (const secret of PRIVATE_DETAILS) expect(JSON.stringify(log)).not.toContain(secret);

    const { history, stats } = await getMechanic(t.ctx, admin, marco.id);
    expect(history.map((event) => event.actionLabel)).toEqual(
      expect.arrayContaining(["Quote sent", "Quote selected (reservation created)"]),
    );
    expect(stats).toMatchObject({ jobsMatched: 1, jobsQuoted: 1, quotesSent: 1, activeQuotes: 0, bookings: 1, confirmedBookings: 0 });
  });
});

describe("an admin working a dispute on a demo booking", () => {
  it("sees the change orders, invoice and review as evidence, then disputes and releases the demo payout", async () => {
    const jordan = await createUser(t.ctx, { role: "customer", displayName: "Jordan" });
    const sam = await createMechanic(t.ctx, { displayName: "Sam T.", baseZip: "85004" });
    const fixture = await createDemoFixtureBooking(t.ctx, { customer: jordan, mechanic: sam, slotStart: addHours(t.ctx.now, 300) });
    // the post-booking steps, through the mechanic's and the customer's own commands
    await startJob(t.ctx, sam, fixture.id);
    const { changeOrderId } = await proposeChangeOrder(t.ctx, sam, {
      bookingId: fixture.id,
      description: "Replace the cracked serpentine belt",
      reason: "Found deep cracks while replacing the battery.",
      laborCents: 5_000,
      partsCents: 2_000,
      taxCents: 300,
    });
    await decideChangeOrder(t.ctx, jordan, { changeOrderId, decision: "approve", note: "Go ahead" });
    await completeJob(t.ctx, sam, fixture.id);
    const invoice = await issueInvoice(t.ctx, sam, { bookingId: fixture.id, notes: "Thanks for choosing us." });
    await submitReview(t.ctx, jordan, { bookingId: fixture.id, rating: 4, comment: "Quick and tidy." });

    const detail = await getRequest(t.ctx, admin, fixture.requestId);

    expect(detail.booking).toMatchObject({
      status: "completed",
      payoutStatus: "pending",
      isDemoFixture: true,
      interventions: { cancel: false, markDisputed: true, holdPayout: true, releasePayout: false },
      bookingConsent: { items: expect.arrayContaining([expect.objectContaining({ key: "payment_pending_ack" })]) },
      changeOrders: [
        {
          id: changeOrderId,
          status: "approved",
          amountCents: 7_300,
          paymentState: "demo_fixture_no_real_payment",
          proposedBy: { id: sam.id, displayName: "Sam T." },
          decidedBy: { id: jordan.id, displayName: "Jordan" },
          decisionNote: "Go ahead",
          isDemoFixture: true,
        },
      ],
      invoice: {
        id: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        totalCents: invoice.totalCents,
        approvedChangeOrderCount: 1,
        notes: "Thanks for choosing us.",
        issuedBy: { id: sam.id, displayName: "Sam T." },
        isDemoFixture: true,
      },
      review: { rating: 4, comment: "Quick and tidy.", isDemoFixture: true },
    });
    expect(detail.booking?.invoice?.lineItems.map((line) => [line.source, line.kind])).toEqual(
      expect.arrayContaining([
        ["quote", "labor"],
        ["change_order", "labor"],
        ["change_order", "part"],
      ]),
    );

    await markDemoBookingDisputed(t.ctx, admin, { bookingId: fixture.id, reason: "Customer says the belt squeals again" });
    expect((await getRequest(t.ctx, admin, fixture.requestId)).booking).toMatchObject({
      status: "disputed",
      payoutStatus: "held",
      interventions: { cancel: false, markDisputed: false, holdPayout: false, releasePayout: true },
    });
    await setDemoPayoutHold(t.ctx, admin, { bookingId: fixture.id, hold: false, reason: "The mechanic fixed it at no charge" });
    expect((await getRequest(t.ctx, admin, fixture.requestId)).booking).toMatchObject({ status: "disputed", payoutStatus: "pending" });

    // every step, whoever took it, is in the audit log and links to this request's page
    const requestPage = `/admin/requests/${fixture.requestId}`;
    const trail = (await listAuditEvents(t.ctx, admin)).items
      .filter((event) => event.entityHref === requestPage)
      .map((event) => [event.actionLabel, event.actor.displayName])
      .reverse();
    expect(trail).toEqual([
      ["Job started", "Sam T."],
      ["Change order proposed", "Sam T."],
      ["Change order approved", "Jordan"],
      ["Job completed", "Sam T."],
      ["Invoice issued", "Sam T."],
      ["Review left", "Jordan"],
      ["Booking marked disputed", "Avery Admin"],
      ["Payout released", "Avery Admin"],
    ]);
  });
});
