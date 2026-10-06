// The mechanic job board and job detail (src/server/mechanic/jobs.ts, job-actions.ts):
// gating by account state, coarse job cards, privacy of the job detail, "No longer
// available" states, quote-form defaults, the Interested / Pass actions, and map points that
// are only ZIP centroids (the request's and the mechanic's own base).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { JobMatchStatus } from "@/lib/domain";
import type { Viewer } from "@/server/context";
import { cancelReservation } from "@/server/customer/reservations";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { runMatching } from "@/server/matching/run";
import { markInterested, passJob } from "@/server/mechanic/job-actions";
import { getJobDetail, listMyJobs, VIDEO_NOTICE } from "@/server/mechanic/jobs";
import { allowedQuoteModes } from "@/server/mechanic/service-modes";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  TEST_ZIPS,
  type TestMechanic,
  type TestRequest,
} from "../support/factories";

// ctx.now: Monday 5 Oct 2026, 10:00 in Phoenix. Requests default to ZIP 85004, a diagnostic
// visit on Wednesday 7 Oct (morning), mobile or garage; the customer's phone is
// 602-555-0199 and street "123 Test Street".

const CONTACT_PHONE = "602-555-0199";
const STREET = "123 Test Street";
const TEMPE_MILES = roundMiles(haversineMiles(TEST_ZIPS["85004"], TEST_ZIPS["85281"]));
const PHOENIX_POINT = { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng };
const TEMPE_POINT = { lat: TEST_ZIPS["85281"].lat, lng: TEST_ZIPS["85281"].lng };

let t: TestContext;
let customer: Viewer;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer", email: "dana.private@example.test" });
});

afterEach(async () => {
  await t.cleanup();
});

async function match(requestId: string, mechanic: { id: string }, status: JobMatchStatus = "notified", notifiedAt = t.ctx.now) {
  await t.ctx.db
    .insertInto("job_matches")
    .values({
      id: newId(),
      request_id: requestId,
      mechanic_id: mechanic.id,
      distance_miles: 1.5,
      rank: 1,
      status,
      notified_at: notifiedAt.toISOString(),
      updated_at: notifiedAt.toISOString(),
    })
    .execute();
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
      original_name: kind === "photo" ? "IMG_0001.jpg" : "noise.mp4",
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

function expectNoPrivateData(serialized: string, extra: readonly string[] = []) {
  for (const secret of [customer.email, CONTACT_PHONE, STREET, ...extra]) expect(serialized).not.toContain(secret);
}

describe("job board gating", () => {
  it("shows job cards only to approved, insured mechanics who accept jobs, and says why otherwise", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const mechanics: Record<string, TestMechanic> = {
      approved: await createMechanic(t.ctx),
      applied: await createMechanic(t.ctx, { status: "applied" }),
      underReview: await createMechanic(t.ctx, { status: "under_review" }),
      rejected: await createMechanic(t.ctx, { status: "rejected", statusReason: "Documents unreadable" }),
      suspended: await createMechanic(t.ctx, { status: "suspended", statusReason: "Complaints under review" }),
      expired: await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-04" }),
      paused: await createMechanic(t.ctx, { acceptingJobs: false }),
    };
    for (const mechanic of Object.values(mechanics)) await match(request.id, mechanic);

    const expected: Record<string, string | undefined> = {
      approved: undefined,
      applied: "pending_review",
      underReview: "pending_review",
      rejected: "rejected",
      suspended: "suspended",
      expired: "insurance_expired",
      paused: "not_accepting",
    };
    for (const [name, mechanic] of Object.entries(mechanics)) {
      const board = await listMyJobs(t.ctx, mechanic);
      expect(board.eligibility.reason, name).toBe(expected[name]);
      expect(board.eligibility.canReceiveJobs, name).toBe(name === "approved");
      expect(board.eligibility.message.length, name).toBeGreaterThan(20);
      expect(board.newMatches.length + board.interested.length, name).toBe(name === "approved" ? 1 : 0);
    }
    expect((await listMyJobs(t.ctx, mechanics.rejected)).eligibility.message).toContain("Documents unreadable");
    expect((await listMyJobs(t.ctx, mechanics.suspended)).eligibility.message).toContain("Complaints under review");
    expect((await listMyJobs(t.ctx, mechanics.expired)).eligibility.message).toContain("Oct 4, 2026");

    const noProfile = await createUser(t.ctx, { role: "mechanic" });
    expect(await listMyJobs(t.ctx, noProfile)).toEqual({
      eligibility: {
        canReceiveJobs: false,
        reason: "no_profile",
        message: "Complete your mechanic application to start receiving matched jobs.",
      },
      base: null,
      newMatches: [],
      interested: [],
      quotes: [],
      bookings: [],
    });
    await expectDomainError(listMyJobs(t.ctx, customer), "forbidden");
  });

  it("hides job details from matched mechanics who are not approved", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const suspended = await createMechanic(t.ctx, { status: "suspended", statusReason: "Complaints under review" });
    const applied = await createMechanic(t.ctx, { status: "applied" });
    await match(request.id, suspended);
    await match(request.id, applied);

    const error = await expectDomainError(getJobDetail(t.ctx, suspended, request.id), "mechanic_not_eligible");
    expect(error.userMessage).toContain("suspended");
    expect(error.details).toEqual({ reason: "suspended" });
    expect(JSON.stringify(error)).not.toContain("Grinding noise");
    expect((await expectDomainError(getJobDetail(t.ctx, applied, request.id), "mechanic_not_eligible")).details).toEqual({
      reason: "pending_review",
    });
    // Still their own records: quotes and bookings stay listed for a suspended mechanic.
    expect((await listMyJobs(t.ctx, suspended)).quotes).toEqual([]);
  });

  it("works with the matches runMatching creates", async () => {
    const tempe = await createMechanic(t.ctx, { baseZip: "85281" });
    const request = await createOpenRequest(t.ctx, customer);
    await writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId: request.id, now: t.ctx.now, mode: "initial" }));
    const board = await listMyJobs(t.ctx, tempe);
    expect(board.newMatches).toHaveLength(1);
    expect(board.newMatches[0]).toMatchObject({ requestId: request.id, matchStatus: "notified", distanceMiles: TEMPE_MILES });
  });
});

describe("job cards", () => {
  it("hold only coarse request data", async () => {
    const mechanic = await createMechanic(t.ctx, { baseZip: "85281" });
    const description = `${"The car cranks slowly every morning and the battery light flickers on the highway. ".repeat(3)}Started last week.`;
    const request = await createOpenRequest(t.ctx, customer, {
      categoryId: "battery_no_start",
      vehicleYear: 2016,
      vehicleMake: "Honda",
      vehicleModel: "Civic",
      mileage: 112_000,
      description,
      drivable: false,
      preferredWindow: "afternoon",
      serviceMode: "mobile",
    });
    const shareable = [await addMedia(request, "photo", true), await addMedia(request, "photo", true)];
    const hiddenPhoto = await addMedia(request, "photo", false);
    const video = await addMedia(request, "video", false);
    await match(request.id, mechanic);

    const board = await listMyJobs(t.ctx, mechanic);
    expect(board.newMatches).toHaveLength(1);
    const card = board.newMatches[0];
    expect(card).toEqual({
      requestId: request.id,
      matchStatus: "notified",
      matchedAt: t.ctx.now.toISOString(),
      categoryId: "battery_no_start",
      categoryName: "Battery / no-start diagnosis",
      safetySensitive: false,
      vehicle: { year: 2016, make: "Honda", model: "Civic", label: "2016 Honda Civic" },
      mileage: 112_000,
      descriptionExcerpt: expect.stringMatching(/^The car cranks slowly .*…$/),
      areaLabel: "Phoenix, AZ 85004",
      distanceMiles: TEMPE_MILES,
      approxPoint: PHOENIX_POINT,
      preferredDate: "2026-10-07",
      preferredWindow: "afternoon",
      preferredTimeLabel: "Wed, Oct 7, 2026 · Afternoon (12 PM–5 PM)",
      serviceMode: "mobile",
      serviceModeLabel: "Mobile - come to me",
      drivable: false,
      photoCount: 2,
      hasVideo: true,
      timeZone: "America/Phoenix",
      availability: "open",
      availabilityLabel: "Open",
      availabilityTone: "info",
      myQuote: null,
      isDemoFixture: false,
    });
    expect(card.descriptionExcerpt.length).toBeLessThanOrEqual(160);
    // The map's own base: the mechanic's base-ZIP centroid and travel radius, nothing private.
    expect(board.base).toEqual({
      zip: "85281",
      areaLabel: "Tempe, AZ 85281",
      point: TEMPE_POINT,
      travelRadiusMiles: 25,
      serviceMode: "both",
      serviceModeLabel: "Mobile and garage",
    });
    expectNoPrivateData(JSON.stringify(board), [video, hiddenPhoto, ...shareable]);
  });

  it("put only rounded ZIP centroids on the map", async () => {
    const mechanic = await createMechanic(t.ctx, { baseZip: "85281" });
    const request = await createOpenRequest(t.ctx, customer);
    // A full-precision centroid (as the Census gazetteer stores it) is rounded to about 100 m.
    t.sqlite.prepare("UPDATE repair_requests SET approx_lat = 33.451567, approx_lng = -112.069887 WHERE id = ?").run(request.id);
    await match(request.id, mechanic);

    const board = await listMyJobs(t.ctx, mechanic);
    expect(board.newMatches[0].approxPoint).toEqual({ lat: 33.452, lng: -112.07 });
    expect((await getJobDetail(t.ctx, mechanic, request.id)).approxPoint).toEqual({ lat: 33.452, lng: -112.07 });
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    expect((await listMyJobs(t.ctx, mechanic)).quotes[0].approxPoint).toEqual({ lat: 33.452, lng: -112.07 });
  });

  it("show the request status as the mechanic may see it, never naming anyone else", async () => {
    const mechanic = await createMechanic(t.ctx);
    const rival = await createMechanic(t.ctx, { displayName: "Rival Garage" });

    const quotedByMe = await createOpenRequest(t.ctx, customer, { vehicleModel: "Quoted" });
    await match(quotedByMe.id, mechanic, "quoted", new Date("2026-10-05T16:00:00.000Z"));
    const myQuote = await createSubmittedQuote(t.ctx, { requestId: quotedByMe.id, mechanicId: mechanic.id });

    const reservedByRival = await createOpenRequest(t.ctx, customer, { vehicleModel: "Reserved" });
    await match(reservedByRival.id, mechanic, "notified", new Date("2026-10-05T16:30:00.000Z"));
    await match(reservedByRival.id, rival);
    const rivalQuote = await createSubmittedQuote(t.ctx, {
      requestId: reservedByRival.id,
      mechanicId: rival.id,
      slotStart: new Date("2026-10-08T17:00:00.000Z"),
    });
    await createPendingBooking(t.ctx, { quote: rivalQuote, customer });

    const cancelled = await createOpenRequest(t.ctx, customer, { vehicleModel: "Cancelled" });
    await match(cancelled.id, mechanic, "interested");
    t.sqlite.prepare("UPDATE repair_requests SET status = 'cancelled' WHERE id = ?").run(cancelled.id);

    const selected = await createOpenRequest(t.ctx, customer, { vehicleModel: "Selected" });
    await match(selected.id, mechanic, "quoted");
    const selectedQuote = await createSubmittedQuote(t.ctx, {
      requestId: selected.id,
      mechanicId: mechanic.id,
      slotStart: new Date("2026-10-09T17:00:00.000Z"),
    });
    await createPendingBooking(t.ctx, { quote: selectedQuote, customer });

    const open = await createOpenRequest(t.ctx, customer, { vehicleModel: "Open" });
    await match(open.id, mechanic, "notified", new Date("2026-10-05T15:00:00.000Z"));

    const board = await listMyJobs(t.ctx, mechanic);
    const byModel = new Map([...board.newMatches, ...board.interested].map((card) => [card.vehicle.model, card]));
    expect(byModel.get("Quoted")).toMatchObject({
      availability: "quoted_by_you",
      availabilityLabel: "Quoted by you",
      myQuote: { id: myQuote.id, status: "submitted", totalCents: 16_550 },
    });
    expect(byModel.get("Reserved")).toMatchObject({ availability: "unavailable", availabilityLabel: "No longer available" });
    expect(byModel.get("Cancelled")).toMatchObject({ availability: "unavailable" });
    expect(byModel.get("Selected")).toMatchObject({ availability: "selected_pending_payment" });
    expect(byModel.get("Open")).toMatchObject({ availability: "open" });
    expect(board.newMatches.map((card) => card.vehicle.model)).toEqual(["Open", "Reserved"]);
    // Jobs the mechanic can still act on come first, then reserved ones, then closed ones.
    expect(board.interested.map((card) => card.vehicle.model)).toEqual(["Quoted", "Selected", "Cancelled"]);

    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain(rival.id);
    expect(serialized).not.toContain("Rival Garage");
    expect(serialized).not.toContain(rivalQuote.id);

    expect(board.quotes.map((quote) => [quote.id, quote.status, quote.bookingId !== null])).toEqual(
      expect.arrayContaining([
        [myQuote.id, "submitted", false],
        [selectedQuote.id, "selected", true],
      ]),
    );
    expect(board.bookings).toHaveLength(1);
    expect(board.bookings[0]).toMatchObject({ status: "pending_payment", requestId: selected.id });
  });

  it("label a quote whose reservation the customer cancelled", async () => {
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic, "quoted");
    const quote = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanic.id,
      slotStart: new Date("2026-10-08T17:00:00.000Z"),
    });
    const booking = await createPendingBooking(t.ctx, { quote, customer });
    await cancelReservation(t.ctx, customer, { bookingId: booking.id, reason: "Plans changed" });

    const board = await listMyJobs(t.ctx, mechanic);
    // The cancellation declines the quote too; the mechanic sees what happened, not "Not selected".
    expect(board.quotes[0]).toMatchObject({
      id: quote.id,
      status: "declined",
      statusLabel: "Reservation cancelled",
      bookingId: booking.id,
      canWithdraw: false,
    });
    expect(board.bookings[0]).toMatchObject({ id: booking.id, status: "cancelled" });
  });

  it("treat a request past its expiry as no longer available, and its quote as expired", async () => {
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic, "quoted");
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, expiresAt: new Date("2026-10-06T17:00:00.000Z") });

    const afterQuoteExpiry = await listMyJobs(withNow(t.ctx, "2026-10-06T18:00:00.000Z"), mechanic);
    // The quote lapsed but the request is still open: the job is quotable again.
    expect(afterQuoteExpiry.interested[0]).toMatchObject({ availability: "open", myQuote: { status: "expired" } });
    expect(afterQuoteExpiry.quotes[0]).toMatchObject({ status: "expired", statusLabel: "Expired", canWithdraw: false });

    const afterRequestExpiry = await listMyJobs(withNow(t.ctx, request.expiresAt), mechanic);
    expect(afterRequestExpiry.interested[0].availability).toBe("unavailable");
  });
});

describe("getJobDetail", () => {
  it("returns coarse details and shareable photos, never contact details, the address or the video", async () => {
    const mechanic = await createMechanic(t.ctx, { baseZip: "85281" });
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "cel_code_read", maxGarageDistanceMiles: 15 });
    const photo = await addMedia(request, "photo", true);
    const hiddenPhoto = await addMedia(request, "photo", false);
    const video = await addMedia(request, "video", false);
    await match(request.id, mechanic);

    const detail = await getJobDetail(t.ctx, mechanic, request.id);
    expect(detail).toMatchObject({
      requestId: request.id,
      matchStatus: "notified",
      category: { id: "cel_code_read", customerNotice: expect.stringMatching(/not a full diagnosis/), safetySensitive: false },
      vehicle: { label: "2016 Toyota Camry" },
      description: "Grinding noise from the front left wheel when braking at low speed.",
      areaLabel: "Phoenix, AZ 85004",
      distanceMiles: TEMPE_MILES,
      approxPoint: PHOENIX_POINT,
      base: { zip: "85281", point: TEMPE_POINT, travelRadiusMiles: 25, serviceMode: "both" },
      maxGarageDistanceMiles: 15,
      photos: [{ fileId: photo }],
      hasVideo: true,
      videoNotice: VIDEO_NOTICE,
      availability: "open",
      myQuote: null,
      quoteHistory: [],
      myBookingId: null,
      actions: { canMarkInterested: true, canPass: true, canQuote: true, quoteBlockedReason: null, withdrawableQuoteId: null },
    });
    expectNoPrivateData(JSON.stringify(detail), [video, hiddenPhoto, "IMG_0001.jpg", "noise.mp4"]);
  });

  it("is not_found for unmatched mechanics and unknown ids, forbidden for other roles", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const matched = await createMechanic(t.ctx);
    const unmatched = await createMechanic(t.ctx);
    await match(request.id, matched);
    await expectDomainError(getJobDetail(t.ctx, unmatched, request.id), "not_found");
    await expectDomainError(getJobDetail(t.ctx, matched, newId()), "not_found");
    await expectDomainError(getJobDetail(t.ctx, customer, request.id), "forbidden");
    const admin = await createUser(t.ctx, { role: "admin" });
    await expectDomainError(getJobDetail(t.ctx, admin, request.id), "forbidden");
  });

  it("gives quote-form defaults in the request's time zone", async () => {
    const both = await createMechanic(t.ctx, { baseZip: "85281" });
    const mobileOnly = await createMechanic(t.ctx, { baseZip: "85281", serviceMode: "mobile" });
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, both);
    await match(request.id, mobileOnly);

    const form = (await getJobDetail(t.ctx, both, request.id)).quoteForm;
    expect(form).toMatchObject({
      timeZone: "America/Phoenix",
      timeZoneLabel: "MST",
      earliestStartLocal: "2026-10-05T11:00",
      latestStartLocal: "2026-11-04T10:00",
      requestExpiresAt: request.expiresAt,
      allowedServiceModes: [
        { value: "mobile", label: "Mobile" },
        { value: "garage", label: "At the garage" },
      ],
      values: {
        earliestStart: "2026-10-07T08:00",
        durationMinutes: "60",
        validityHours: "48",
        serviceMode: "",
        parts: [{ description: "", quantity: "1", unitPrice: "" }],
      },
    });
    expect(form?.validityOptions.map((option) => option.hours)).toEqual([24, 48, 72, 168]);
    const mobileForm = (await getJobDetail(t.ctx, mobileOnly, request.id)).quoteForm;
    expect(mobileForm?.allowedServiceModes.map((mode) => mode.value)).toEqual(["mobile"]);
    expect(mobileForm?.values.serviceMode).toBe("mobile");

    // After 8:00 on the preferred day has passed, the earliest allowed time is suggested.
    const lateForm = (await getJobDetail(withNow(t.ctx, "2026-10-07T15:20:00.000Z"), both, request.id)).quoteForm;
    expect(lateForm?.values.earliestStart).toBe("2026-10-07T09:30");
  });

  it("explains why a quote can't be sent", async () => {
    const paused = await createMechanic(t.ctx, { acceptingJobs: false });
    const lapsing = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-06" });
    const brakesUnapproved = await createMechanic(t.ctx, { categories: ["brake_work"] });
    const farAway = await createMechanic(t.ctx, { baseZip: "85281", serviceMode: "garage" });
    const passed = await createMechanic(t.ctx);

    const request = await createOpenRequest(t.ctx, customer);
    const brakes = await createOpenRequest(t.ctx, customer, { categoryId: "brake_work" });
    const garageNearby = await createOpenRequest(t.ctx, customer, { serviceMode: "garage", maxGarageDistanceMiles: 5 });
    await match(request.id, paused);
    await match(request.id, lapsing);
    await match(brakes.id, brakesUnapproved);
    await match(garageNearby.id, farAway);
    await match(request.id, passed, "passed");

    const reasons = [
      [paused, request.id, /paused new jobs/],
      [lapsing, request.id, /insurance doesn't cover/],
      [brakesUnapproved, brakes.id, /Brake work is safety-critical/],
      [farAway, garageNearby.id, /don't cover this job \(about 8 mi away\)/],
      [passed, request.id, /You passed on this job/],
    ] as const;
    for (const [mechanic, requestId, reason] of reasons) {
      const detail = await getJobDetail(t.ctx, mechanic, requestId);
      expect(detail.actions.canQuote).toBe(false);
      expect(detail.actions.quoteBlockedReason).toMatch(reason);
      expect(detail.quoteForm).toBeNull();
    }
    expect((await getJobDetail(t.ctx, passed, request.id)).actions).toMatchObject({ canMarkInterested: true, canPass: false });
  });
});

describe("Interested and Pass", () => {
  it("move a job between the board's lists", async () => {
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic);

    expect(await markInterested(t.ctx, mechanic, request.id)).toEqual({ requestId: request.id, matchStatus: "interested" });
    expect(await markInterested(t.ctx, mechanic, request.id)).toEqual({ requestId: request.id, matchStatus: "interested" });
    let board = await listMyJobs(t.ctx, mechanic);
    expect([board.newMatches.length, board.interested.length]).toEqual([0, 1]);

    expect(await passJob(t.ctx, mechanic, request.id)).toEqual({ requestId: request.id, matchStatus: "passed" });
    board = await listMyJobs(t.ctx, mechanic);
    expect([board.newMatches.length, board.interested.length]).toEqual([0, 0]);

    // A misclick can be undone.
    await markInterested(t.ctx, mechanic, request.id);
    expect(t.sqlite.prepare("SELECT status FROM job_matches WHERE mechanic_id = ?").get(mechanic.id)).toEqual({
      status: "interested",
    });
  });

  it("refuse unmatched jobs, closed requests and passing with an active quote", async () => {
    const mechanic = await createMechanic(t.ctx);
    const other = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic, "quoted");
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });

    await expectDomainError(markInterested(t.ctx, other, request.id), "not_found");
    await expectDomainError(passJob(t.ctx, other, request.id), "not_found");
    expect((await expectDomainError(passJob(t.ctx, mechanic, request.id), "conflict")).userMessage).toMatch(/Withdraw it first/);

    const cancelled = await createOpenRequest(t.ctx, customer);
    await match(cancelled.id, mechanic);
    t.sqlite.prepare("UPDATE repair_requests SET status = 'cancelled' WHERE id = ?").run(cancelled.id);
    expect((await expectDomainError(markInterested(t.ctx, mechanic, cancelled.id), "conflict")).userMessage).toBe(
      "This job is no longer available.",
    );

    const suspended = await createMechanic(t.ctx, { status: "suspended" });
    await match(cancelled.id, suspended);
    await expectDomainError(markInterested(t.ctx, suspended, cancelled.id), "mechanic_not_eligible");
    expect((await passJob(t.ctx, suspended, cancelled.id)).matchStatus).toBe("passed");
  });
});

describe("allowedQuoteModes", () => {
  it.each([
    ["either", "both", 8, 25, 15, ["mobile", "garage"]],
    ["either", "both", 20, 25, 15, ["mobile"]],
    ["either", "both", 30, 25, 40, ["garage"]],
    ["either", "both", 50, 25, 15, []],
    ["mobile", "both", 8, 25, 15, ["mobile"]],
    ["mobile", "garage", 8, 25, 15, []],
    ["garage", "both", 8, 25, 15, ["garage"]],
    ["garage", "mobile", 8, 25, 15, []],
    ["garage", "garage", 15, 1, 15, ["garage"]],
  ] as const)("request %s, mechanic %s, %d mi, radius %d, garage max %d", (requestMode, mechanicMode, distance, radius, garageMax, expected) => {
    expect(
      allowedQuoteModes({
        requestMode,
        mechanicMode,
        distanceMiles: distance,
        travelRadiusMiles: radius,
        maxGarageDistanceMiles: garageMax,
      }),
    ).toEqual(expected);
  });
});
