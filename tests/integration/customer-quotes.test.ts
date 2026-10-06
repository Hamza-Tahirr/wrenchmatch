// Quote comparison for the request owner: itemized lines, server-verified totals, the
// provisional platform fee, selectability, and the mechanic's public profile only.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addDays, addHours } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { listQuotesForMyRequest } from "@/server/customer/quotes";
import { getMyRequest } from "@/server/customer/requests";
import { DomainError } from "@/server/errors";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { newId } from "@/server/ids";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  bookingRowFor,
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  TEST_ZIPS,
  type QuoteItemInput,
  type TestMechanic,
  type TestRequest,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let marco: TestMechanic; // Tempe, with private details that must never leak
let request: TestRequest;

/** $120 labor + 2 x $22.75 parts + $3.64 tax + $5 shop fee = $174.14 */
const ITEMIZED: readonly QuoteItemInput[] = [
  { kind: "labor", description: "Replace front brake pads", quantity: 1, unitPriceCents: 12_000 },
  { kind: "part", description: "Ceramic brake pads", quantity: 2, unitPriceCents: 2_275 },
  { kind: "tax", description: "Sales tax on parts", quantity: 1, unitPriceCents: 364 },
  { kind: "fee", description: "Shop supplies", quantity: 1, unitPriceCents: 500 },
];

const PRIVATE_VALUES = [
  "Marco Legal Rodriguez",
  "Rodriguez Auto LLC",
  "480-555-0177",
  "100 Test Garage Way",
  "TEST-POLICY-0001",
  "Test Mutual Insurance",
  "Test mechanic profile.",
];

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  marco = await createMechanic(t.ctx, {
    displayName: "Marco R.",
    legalName: "Marco Legal Rodriguez",
    businessName: "Rodriguez Auto LLC",
    phone: "480-555-0177",
    baseZip: "85281",
    yearsExperience: 12,
  });
  t.sqlite.prepare("UPDATE mechanic_profiles SET certifications = 'ASE A5 Brakes' WHERE user_id = ?").run(marco.id);
  request = await createOpenRequest(t.ctx, customer);
});

afterEach(async () => {
  await t.cleanup();
});

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

function insertReview(
  bookingId: string,
  mechanicId: string,
  rating: number,
  fixture: boolean,
  at: Date,
  author: Viewer = customer,
) {
  t.sqlite
    .prepare(
      "INSERT INTO reviews (id, booking_id, customer_id, mechanic_id, rating, comment, is_demo_fixture, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(newId(), bookingId, author.id, mechanicId, rating, `Rated ${rating}`, fixture ? 1 : 0, at.toISOString());
}

describe("quote comparison", () => {
  it("itemizes lines, verifies totals and shows the provisional platform fee", async () => {
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id, items: ITEMIZED });

    const result = await listQuotesForMyRequest(t.ctx, customer, request.id);

    expect(result.requestStatus).toBe("quoted");
    expect(result.quotes).toHaveLength(1);
    const [item] = result.quotes;
    expect(item).toMatchObject({
      id: quote.id,
      status: "submitted",
      statusLabel: "Submitted",
      serviceMode: "mobile",
      serviceModeLabel: "Mobile",
      partsIncluded: true,
      currency: "USD",
      totals: { laborCents: 12_000, partsCents: 4_550, taxCents: 364, feeCents: 500, totalCents: 17_414 },
      totalsVerified: true,
      platformFee: { bps: 1000, cents: 1_200, includedInTotal: true },
      slotStartAt: quote.slotStartAt,
      slotEndAt: quote.slotEndAt,
      timeZone: "America/Phoenix",
      estimatedDurationMinutes: 90,
      expiresAt: quote.expiresAt,
      isSelectable: true,
      unavailableReason: null,
      isDemoFixture: false,
    });
    expect(item.lineItems.labor.map((line) => [line.description, line.quantity, line.unitPriceCents, line.amountCents])).toEqual([
      ["Replace front brake pads", 1, 12_000, 12_000],
    ]);
    expect(item.lineItems.parts.map((line) => [line.description, line.quantity, line.amountCents])).toEqual([
      ["Ceramic brake pads", 2, 4_550],
    ]);
    expect(item.lineItems.taxes.map((line) => line.amountCents)).toEqual([364]);
    expect(item.lineItems.fees.map((line) => line.description)).toEqual(["Shop supplies"]);
    expect(result.summary).toEqual({ selectableCount: 1, lowestTotalCents: 17_414, earliestSlotStartAt: quote.slotStartAt });
  });

  it("shows only the mechanic's public profile, never private details", async () => {
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });

    const detail = await getMyRequest(t.ctx, customer, request.id);
    const [{ mechanic }] = detail.quotes;
    expect(mechanic).toEqual({
      id: marco.id,
      displayName: "Marco R.",
      yearsExperience: 12,
      certifications: "ASE A5 Brakes",
      services: [
        "Diagnostic visit",
        "Basic check-engine-light code read",
        "Battery replacement",
        "Battery / no-start diagnosis",
        "Oil change",
        "Filters",
        "Bulbs",
        "Wipers",
        "Basic maintenance",
        "Minor engine / sensor work",
      ],
      areaLabel: "Based near Tempe, AZ",
      // The base ZIP's centroid, never an address.
      approxLocation: { lat: TEST_ZIPS["85281"].lat, lng: TEST_ZIPS["85281"].lng },
      distanceMiles: roundMiles(haversineMiles(TEST_ZIPS["85004"], TEST_ZIPS["85281"])),
      distanceLabel: "about 8 mi",
      rating: { count: 0, average: null, label: "New" },
      recentReviews: [],
      profilePhotoFileId: null,
    });

    const serialized = JSON.stringify(detail);
    for (const value of [...PRIVATE_VALUES, marco.email]) expect(serialized).not.toContain(value);
  });

  it("lists safety-sensitive services only once safety-approved, and hides disabled categories", async () => {
    const brakes = await createMechanic(t.ctx, {
      categories: ["oil_change", { id: "brake_work", safetyApproved: true }, "suspension_work"],
    });
    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'oil_change'").run();
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: brakes.id });

    const [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.services).toEqual(["Brake work"]);
  });

  it("includes the profile photo only when the file policy allows it", async () => {
    const fileId = newId();
    t.sqlite
      .prepare(
        "INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256, metadata_stripped) VALUES (?, ?, 'mechanic_profile_photo', ?, 'image/jpeg', 100, ?, 1)",
      )
      .run(fileId, marco.id, `profile-photos/2026/${fileId}.jpg`, "0".repeat(64));
    t.sqlite.prepare("UPDATE mechanic_profiles SET profile_photo_file_id = ? WHERE user_id = ?").run(fileId, marco.id);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });

    const [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.profilePhotoFileId).toBe(fileId);
  });

  it("rates from genuine reviews only; the author still sees their own seeded review, marked as not counted", async () => {
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });
    const fixture = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic: marco,
      status: "completed",
      slotStart: addDays(t.ctx.now, -3),
    });
    insertReview(fixture.id, marco.id, 1, true, addDays(t.ctx.now, -2));

    let [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.rating).toEqual({ count: 0, average: null, label: "New" });
    expect(
      quote.mechanic.recentReviews.map((review) => [review.rating, review.byViewer, review.countsTowardRating]),
    ).toEqual([[1, true, false]]);

    // A genuine completed booking cannot exist until payments are connected; simulate one.
    t.sqlite.exec("DROP TRIGGER bookings_insert_requires_pending_payment");
    const pastRequest = await createOpenRequest(t.ctx, customer);
    const pastQuote = await createSubmittedQuote(t.ctx, {
      requestId: pastRequest.id,
      mechanicId: marco.id,
      slotStart: addDays(t.ctx.now, 5),
      expiresAt: addHours(t.ctx.now, 1),
    });
    const genuine = bookingRowFor(t.ctx, pastQuote, customer.id, { status: "completed" });
    await t.ctx.db.insertInto("bookings").values(genuine).execute();
    insertReview(genuine.id, marco.id, 4, false, addDays(t.ctx.now, -1));

    [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.rating).toEqual({ count: 1, average: 4, label: "4.0 (1 review)" });
    expect(
      quote.mechanic.recentReviews.map((review) => [review.rating, review.byViewer, review.countsTowardRating]),
    ).toEqual([
      [4, true, true],
      [1, true, false],
    ]);
    expect(JSON.stringify(quote.mechanic.recentReviews)).not.toContain(customer.id);
  });

  it("never shows another customer's seeded review, while their genuine reviews count and show", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });
    const seeded = await createDemoFixtureBooking(t.ctx, {
      customer: other,
      mechanic: marco,
      status: "completed",
      slotStart: addDays(t.ctx.now, -3),
    });
    insertReview(seeded.id, marco.id, 5, true, addDays(t.ctx.now, -2), other);

    let [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.rating).toEqual({ count: 0, average: null, label: "New" });
    expect(quote.mechanic.recentReviews).toEqual([]);
    expect(JSON.stringify(quote.mechanic)).not.toContain("Rated 5");

    // A genuine completed booking cannot exist until payments are connected; simulate one.
    t.sqlite.exec("DROP TRIGGER bookings_insert_requires_pending_payment");
    const pastRequest = await createOpenRequest(t.ctx, other);
    const pastQuote = await createSubmittedQuote(t.ctx, {
      requestId: pastRequest.id,
      mechanicId: marco.id,
      slotStart: addDays(t.ctx.now, 5),
      expiresAt: addHours(t.ctx.now, 1),
    });
    const genuine = bookingRowFor(t.ctx, pastQuote, other.id, { status: "completed" });
    await t.ctx.db.insertInto("bookings").values(genuine).execute();
    insertReview(genuine.id, marco.id, 3, false, addDays(t.ctx.now, -1), other);

    [quote] = (await listQuotesForMyRequest(t.ctx, customer, request.id)).quotes;
    expect(quote.mechanic.rating).toEqual({ count: 1, average: 3, label: "3.0 (1 review)" });
    expect(
      quote.mechanic.recentReviews.map((review) => [review.rating, review.byViewer, review.countsTowardRating]),
    ).toEqual([[3, false, true]]);
    expect(JSON.stringify(quote.mechanic.recentReviews)).not.toContain(other.id);
  });

  it("explains why a quote can't be selected", async () => {
    const expiring = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: marco.id,
      expiresAt: addHours(t.ctx.now, 1),
    });
    const withdrawnBy = await createMechanic(t.ctx);
    const withdrawn = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: withdrawnBy.id });
    t.sqlite
      .prepare("UPDATE quotes SET status = 'withdrawn', withdrawn_at = ? WHERE id = ?")
      .run(t.ctx.now.toISOString(), withdrawn.id);
    const suspendedMechanic = await createMechanic(t.ctx);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: suspendedMechanic.id });
    t.sqlite
      .prepare("UPDATE mechanic_profiles SET status = 'suspended', status_reason = 'Complaint review' WHERE user_id = ?")
      .run(suspendedMechanic.id);
    // Insured through tomorrow, but the quoted slot is the day after.
    const lapsing = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-06" });
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: lapsing.id });
    const inconsistentBy = await createMechanic(t.ctx);
    const inconsistent = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: inconsistentBy.id });
    t.sqlite
      .prepare(
        "INSERT INTO quote_items (id, quote_id, kind, description, quantity, unit_price_cents, amount_cents, sort_order) VALUES (?, ?, 'part', 'Extra', 1, 1000, 1000, 9)",
      )
      .run(newId(), inconsistent.id);
    const goodBy = await createMechanic(t.ctx);
    const good = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: goodBy.id });

    const later = withNow(t.ctx, addHours(t.ctx.now, 2));
    const { quotes, summary } = await listQuotesForMyRequest(later, customer, request.id);
    const reasonOf = (mechanicId: string) => quotes.find((quote) => quote.mechanic.id === mechanicId);

    expect(quotes[0].id).toBe(good.id);
    expect(reasonOf(goodBy.id)).toMatchObject({ isSelectable: true, unavailableReason: null });
    expect(reasonOf(marco.id)).toMatchObject({ id: expiring.id, status: "expired", unavailableReason: "This quote has expired." });
    expect(reasonOf(withdrawnBy.id)).toMatchObject({ status: "withdrawn", unavailableReason: "The mechanic withdrew this quote." });
    expect(reasonOf(suspendedMechanic.id)).toMatchObject({
      status: "submitted",
      isSelectable: false,
      unavailableReason: "This mechanic can't take new bookings right now.",
    });
    expect(reasonOf(lapsing.id)?.unavailableReason).toBe("This mechanic can't take new bookings right now.");
    expect(reasonOf(inconsistentBy.id)).toMatchObject({ totalsVerified: false, isSelectable: false });
    expect(reasonOf(inconsistentBy.id)?.unavailableReason).toMatch(/prices don't add up/);
    expect(summary.selectableCount).toBe(1);
  });

  it("marks the reserved quote and the others once a quote is reserved", async () => {
    const chosen = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });
    const otherMechanic = await createMechanic(t.ctx);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: otherMechanic.id });
    await createPendingBooking(t.ctx, { quote: chosen, customer });

    const result = await listQuotesForMyRequest(t.ctx, customer, request.id);
    expect(result.requestStatus).toBe("reserved");
    expect(result.quotes.map((quote) => [quote.status, quote.isSelectable, quote.unavailableReason])).toEqual([
      ["selected", false, "You reserved this quote."],
      ["declined", false, "You reserved another quote for this request."],
    ]);
  });

  it("is only available to the request's owner", async () => {
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: marco.id });
    const other = await createUser(t.ctx, { role: "customer" });
    expect((await rejection(listQuotesForMyRequest(t.ctx, other, request.id))).code).toBe("not_found");
    expect((await rejection(listQuotesForMyRequest(t.ctx, marco, request.id))).code).toBe("forbidden");
    expect((await rejection(listQuotesForMyRequest(t.ctx, customer, "no-such-request"))).code).toBe("not_found");
  });
});
