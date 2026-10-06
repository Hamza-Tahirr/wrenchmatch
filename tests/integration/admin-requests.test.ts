// Admin request views and matching tools: coarse request data without contact details,
// the audited contact reveal, matching-failure diagnostics, re-running matching, and
// statuses "as of now" that agree with expireStaleRecords.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setCategoryEnabled } from "@/server/admin/categories";
import { listQuotes } from "@/server/admin/marketplace";
import { listMatchingFailures, MATCHING_FAILURE_THRESHOLD, rerunMatching } from "@/server/admin/matching";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { setPilotZipEnabled } from "@/server/admin/pilot-zips";
import { getRequest, listRequests, revealRequestContact } from "@/server/admin/requests";
import { addDays, addHours } from "@/server/clock";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { newId } from "@/server/ids";
import { runMatching } from "@/server/matching/run";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  createZip,
  TEST_ZIPS,
  type TestRequest,
} from "../support/factories";

// ctx.now: Monday 5 Oct 2026, 10:00 in Phoenix (17:00 UTC). Requests default to ZIP 85004,
// diagnostic visit, 2016 Toyota Camry, preferred Wednesday 7 Oct, morning, mobile or garage.

let t: TestContext;
let admin: Viewer;
let customer: Viewer;

beforeEach(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin" });
  customer = await createUser(t.ctx, { role: "customer", displayName: "Dana" });
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

const initialMatching = (requestId: string) =>
  writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId, now: t.ctx.now, mode: "initial" }));

async function insertDraftRequest(owner: Viewer): Promise<string> {
  await createZip(t.ctx, { zip: "85004", ...TEST_ZIPS["85004"] });
  const id = newId();
  await t.ctx.db
    .insertInto("repair_requests")
    .values({
      id,
      customer_id: owner.id,
      status: "draft",
      zip: "85004",
      approx_lat: 33.451,
      approx_lng: -112.069,
      area_label: "Phoenix, AZ 85004",
      time_zone: "America/Phoenix",
      vehicle_year: 2015,
      vehicle_make: "Honda",
      vehicle_model: "Civic",
      mileage: 120_000,
      category_id: "oil_change",
      description: "A draft that was never submitted.",
      drivable: 1,
      preferred_date: "2026-10-09",
      preferred_window: "morning",
      service_mode: "either",
      created_at: t.ctx.now.toISOString(),
      updated_at: t.ctx.now.toISOString(),
    })
    .execute();
  return id;
}

async function insertMedia(request: TestRequest, kind: "photo" | "video"): Promise<string> {
  const fileId = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id: fileId,
      owner_user_id: request.customerId,
      purpose: kind === "photo" ? "request_photo" : "request_video",
      storage_key: `test/${fileId}`,
      mime_type: kind === "photo" ? "image/jpeg" : "video/mp4",
      size_bytes: kind === "photo" ? 150_000 : 3_000_000,
      width: kind === "photo" ? 1600 : null,
      height: kind === "photo" ? 1200 : null,
      sha256: "b".repeat(64),
      metadata_stripped: kind === "photo" ? 1 : 0,
      created_at: t.ctx.now.toISOString(),
    })
    .execute();
  await t.ctx.db
    .insertInto("request_media")
    .values({ file_id: fileId, request_id: request.id, kind, shareable_before_booking: kind === "photo" ? 1 : 0 })
    .execute();
  return fileId;
}

describe("listRequests", () => {
  it("lists submitted requests newest first with coarse fields and counts", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
    const older = await createOpenRequest(withNow(t.ctx, "2026-10-04T15:00:00.000Z"), customer, { categoryId: "oil_change" });
    const newer = await createOpenRequest(t.ctx, customer, { vehicleMake: "Honda", vehicleModel: "Civic", vehicleYear: 2014 });
    await initialMatching(newer.id);
    await createSubmittedQuote(t.ctx, { requestId: newer.id, mechanicId: mechanic.id });
    await insertDraftRequest(customer);

    const page = await listRequests(t.ctx, admin);

    expect(page).toMatchObject({ page: 1, pageSize: 25, totalCount: 2, totalPages: 1 });
    expect(page.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(page.items[0]).toEqual({
      id: newer.id,
      status: "quoted",
      categoryId: "diagnostic_visit",
      categoryName: "Diagnostic visit",
      vehicle: "2014 Honda Civic",
      areaLabel: "Phoenix, AZ 85004",
      zip: "85004",
      timeZone: "America/Phoenix",
      serviceMode: "either",
      preferredDate: "2026-10-07",
      preferredWindow: "morning",
      customer: { id: customer.id, displayName: "Dana" },
      matchedCount: 1,
      quotesCount: 1,
      activeQuotesCount: 1,
      bookingStatus: null,
      isDemoFixture: false,
      createdAt: t.ctx.now.toISOString(),
      submittedAt: newer.submittedAt,
      expiresAt: newer.expiresAt,
    });

    const drafts = await listRequests(t.ctx, admin, { status: "draft" });
    expect(drafts.items.map((item) => item.status)).toEqual(["draft"]);
  });

  it("filters by status as of now and by requests nobody was notified about", async () => {
    const mechanic = await createMechanic(t.ctx, {});
    const matched = await createOpenRequest(t.ctx, customer);
    await initialMatching(matched.id);
    const unmatched = await createOpenRequest(t.ctx, customer, { zip: "86001" });
    await initialMatching(unmatched.id);
    // submitted 8 days ago: past its 7-day expiry, still "open" in the database
    const stale = await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -8) });
    // its only quote expired an hour ago, so it is effectively open again
    const lapsedQuote = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, {
      requestId: lapsedQuote.id,
      mechanicId: mechanic.id,
      expiresAt: addHours(t.ctx.now, -1),
    });

    const ids = async (filters: Parameters<typeof listRequests>[2]) =>
      (await listRequests(t.ctx, admin, filters)).items.map((item) => item.id).sort();

    expect(await ids({ status: "expired" })).toEqual([stale.id]);
    expect(await ids({ status: "active" })).toEqual([matched.id, unmatched.id, lapsedQuote.id].sort());
    expect(await ids({ status: "open" })).toEqual([matched.id, unmatched.id, lapsedQuote.id].sort());
    expect(await ids({ status: "quoted" })).toEqual([]);
    expect(await ids({ status: "active", zeroMatchesOnly: true })).toEqual([unmatched.id, lapsedQuote.id].sort());
    const lapsed = (await listRequests(t.ctx, admin, {})).items.find((item) => item.id === lapsedQuote.id);
    expect(lapsed).toMatchObject({ status: "open", quotesCount: 1, activeQuotesCount: 0 });
  });

  it("pages through long lists", async () => {
    for (let index = 0; index < 27; index += 1) {
      await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -index)), customer);
    }
    const first = await listRequests(t.ctx, admin, { page: 1 });
    const second = await listRequests(t.ctx, admin, { page: 2 });
    const beyond = await listRequests(t.ctx, admin, { page: 99 });
    expect([first.items.length, second.items.length]).toEqual([25, 2]);
    expect(first).toMatchObject({ totalCount: 27, totalPages: 2 });
    expect(beyond).toMatchObject({ page: 2, items: second.items });
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(27);
  });
});

describe("getRequest", () => {
  it("shows the request, media, quotes, booking and matching results without contact details", async () => {
    const near = await createMechanic(t.ctx, { displayName: "Near Mechanic", baseZip: "85004" });
    const far = await createMechanic(t.ctx, { displayName: "Far Mechanic", baseZip: "86001" });
    const request = await createOpenRequest(t.ctx, customer, {
      contactPhone: "602-555-0199",
      streetAddress: "123 Hidden Street",
      description: "Clicking noise when starting the engine on cold mornings.",
    });
    const photoId = await insertMedia(request, "photo");
    const videoId = await insertMedia(request, "video");
    await initialMatching(request.id);
    const quote = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: near.id,
      items: [
        { kind: "labor", description: "Diagnosis", quantity: 1, unitPriceCents: 9_500 },
        { kind: "part", description: "Starter relay", quantity: 2, unitPriceCents: 1_250 },
        { kind: "tax", description: "Sales tax on parts", quantity: 1, unitPriceCents: 210 },
      ],
    });
    const booking = await createPendingBooking(t.ctx, { quote, customer });

    const detail = await getRequest(t.ctx, admin, request.id);

    expect(detail).toMatchObject({
      id: request.id,
      status: "reserved",
      storedStatus: "reserved",
      description: "Clicking noise when starting the engine on cold mornings.",
      mileage: 98_000,
      drivable: true,
      maxGarageDistanceMiles: 15,
      categorySafetySensitive: false,
      categoryEnabled: true,
      zipPilotEnabled: true,
      matchedCount: 1,
      bookingStatus: "pending_payment",
      rerunBlockedReason: expect.stringContaining("This one is reserved (payment pending)."),
      consent: { version: "2026-10-05", acceptedAt: t.ctx.now.toISOString(), items: expect.arrayContaining([expect.objectContaining({ key: "terms_privacy" })]) },
      supportRequests: [],
    });
    expect(detail.media).toEqual([
      expect.objectContaining({ fileId: photoId, kind: "photo", shareableBeforeBooking: true, mimeType: "image/jpeg", width: 1600 }),
      expect.objectContaining({ fileId: videoId, kind: "video", shareableBeforeBooking: false, mimeType: "video/mp4" }),
    ]);
    expect(detail.quotes).toHaveLength(1);
    expect(detail.quotes[0]).toMatchObject({
      id: quote.id,
      status: "selected",
      mechanic: { id: near.id, displayName: "Near Mechanic" },
      laborCents: 9_500,
      partsCents: 2_500,
      taxCents: 210,
      totalCents: 12_210,
      items: [
        { kind: "labor", description: "Diagnosis", quantity: 1, unitPriceCents: 9_500, amountCents: 9_500 },
        { kind: "part", description: "Starter relay", quantity: 2, unitPriceCents: 1_250, amountCents: 2_500 },
        { kind: "tax", description: "Sales tax on parts", quantity: 1, unitPriceCents: 210, amountCents: 210 },
      ],
    });
    expect(detail.booking).toMatchObject({
      id: booking.id,
      status: "pending_payment",
      paymentState: "stripe_not_connected",
      payoutStatus: "not_eligible",
      totalCents: 12_210,
      platformFeeCents: 950,
      mechanicPayoutCents: 11_260,
      isDemoFixture: false,
      interventions: { cancel: false, markDisputed: false, holdPayout: false, releasePayout: false },
    });
    expect(detail.evaluations.map((evaluation) => [evaluation.mechanic.displayName, evaluation.eligible, evaluation.notified])).toEqual([
      ["Near Mechanic", true, true],
      ["Far Mechanic", false, false],
    ]);
    expect(detail.evaluations[1].reasons).toEqual([
      { code: "out_of_range", label: "Out of range", explanation: expect.stringContaining("ZIP centroids") },
    ]);
    expect(detail.jobMatches).toEqual([
      expect.objectContaining({ mechanic: { id: near.id, displayName: "Near Mechanic" }, rank: 1, status: "notified", distanceMiles: 0 }),
    ]);
    expect(far.id).not.toBe(near.id);

    const serialized = JSON.stringify(detail);
    for (const secret of ["602-555-0199", "123 Hidden Street", customer.email]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("explains why matching can't be re-run and 404s unknown requests", async () => {
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "wipers" });
    expect((await getRequest(t.ctx, admin, request.id)).rerunBlockedReason).toBeNull();
    await setCategoryEnabled(t.ctx, admin, { categoryId: "wipers", enabled: false });
    expect((await getRequest(t.ctx, admin, request.id)).rerunBlockedReason).toBe(
      "Wipers is disabled in Settings, so no more mechanics are notified for it. Enable the category to re-run matching.",
    );
    await expectDomainError(getRequest(t.ctx, admin, newId()), "not_found");
    await expectDomainError(getRequest(t.ctx, admin, "not a/valid id"), "not_found");
  });
});

describe("revealRequestContact", () => {
  it("returns the contact details and exact address and audits the reveal", async () => {
    const request = await createOpenRequest(t.ctx, customer, { contactPhone: "602-555-0199", streetAddress: "123 Hidden Street" });

    const contact = await revealRequestContact(t.ctx, admin, { requestId: request.id, reason: "Customer asked us to call" });

    expect(contact).toEqual({
      requestId: request.id,
      contactEmail: customer.email,
      contactPhone: "602-555-0199",
      streetAddress: "123 Hidden Street",
      city: "Phoenix",
      state: "AZ",
      zip: "85004",
      locationNotes: null,
      revealedAt: t.ctx.now.toISOString(),
    });
    const audits = rows<{ action: string; actor_user_id: string; reason: string; metadata_json: string }>(
      "SELECT action, actor_user_id, reason, metadata_json FROM audit_events WHERE entity_id = ?",
      request.id,
    );
    expect(audits).toEqual([
      expect.objectContaining({ action: "request.contact_revealed", actor_user_id: admin.id, reason: "Customer asked us to call" }),
    ]);
    expect(audits[0].metadata_json).not.toContain("602-555-0199");
  });

  it("requires a reason and an existing request", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const error = await expectDomainError(revealRequestContact(t.ctx, admin, { requestId: request.id, reason: " " }), "invalid_input");
    expect(error.details?.fieldErrors).toEqual({ reason: [expect.stringContaining("Say why you need")] });
    await expectDomainError(revealRequestContact(t.ctx, admin, { requestId: newId(), reason: "Checking" }), "not_found");
    expect(rows("SELECT id FROM audit_events")).toEqual([]);
  });
});

describe("listMatchingFailures", () => {
  it("lists waiting requests that reached fewer than two mechanics, with reasons and a re-run preview", async () => {
    const reachable = await createMechanic(t.ctx, { displayName: "Reachable", baseZip: "85004" });
    await createMechanic(t.ctx, { status: "suspended", baseZip: "85281" });
    await createMechanic(t.ctx, { baseZip: "86001" });
    await createMechanic(t.ctx, { baseZip: "85201", categories: ["oil_change"] });
    const applicant = await createMechanic(t.ctx, { status: "applied", baseZip: "85251" });

    const oneMatch = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -2)), customer);
    await initialMatching(oneMatch.id);
    const brakes = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -1)), customer, { categoryId: "brake_work" });
    await initialMatching(brakes.id);
    // reached two mechanics: not a failure
    await createMechanic(t.ctx, { displayName: "Second", baseZip: "85004", categories: ["filters"] });
    const twoMatches = await createOpenRequest(t.ctx, customer, { categoryId: "filters" });
    await t.ctx.db.updateTable("repair_requests").set({ matched_count: 2 }).where("id", "=", twoMatches.id).execute();
    // expired by time: no longer waiting for quotes
    await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -8) });

    await setMechanicStatus(t.ctx, admin, { mechanicId: applicant.id, status: "approved" });
    const report = await listMatchingFailures(t.ctx, admin);

    expect(report.threshold).toBe(MATCHING_FAILURE_THRESHOLD);
    expect(report.maxMechanicsNotified).toBe(MAX_MECHANICS_NOTIFIED);
    expect(report.requests.map((failure) => failure.request.id)).toEqual([oneMatch.id, brakes.id]);

    const [first, second] = report.requests;
    expect(first).toMatchObject({ evaluatedCount: 5, eligibleCount: 1, lastEvaluatedAt: t.ctx.now.toISOString() });
    expect(first.request.matchedCount).toBe(1);
    expect(first.reasons.map((reason) => [reason.code, reason.count])).toEqual([
      ["status_not_approved", 1],
      ["suspended", 1],
      ["category_not_offered", 1],
      ["out_of_range", 1],
    ]);
    // the applicant approved since then is eligible now, and would be notified
    expect(first.rerun).toEqual({ allowed: true, eligibleNow: 2, wouldNotify: 1 });

    expect(second.request.matchedCount).toBe(0);
    expect(second.reasons.find((reason) => reason.code === "category_not_offered")?.count).toBe(5);
    expect(second.rerun).toEqual({ allowed: true, eligibleNow: 0, wouldNotify: 0 });

    const overall = Object.fromEntries(report.reasons.map((reason) => [reason.code, reason.count]));
    expect(overall).toEqual({ category_not_offered: 6, status_not_approved: 2, suspended: 2, out_of_range: 2 });
    expect(report.reasons[0]).toMatchObject({ code: "category_not_offered", label: "Service not offered" });
    expect(reachable.id).toBeDefined();
  });

  it("shows why re-running is blocked for a disabled category or ZIP", async () => {
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "bulbs", zip: "85281" });
    await setCategoryEnabled(t.ctx, admin, { categoryId: "bulbs", enabled: false });
    let [failure] = (await listMatchingFailures(t.ctx, admin)).requests;
    expect(failure.request.id).toBe(request.id);
    expect(failure.rerun).toEqual({ allowed: false, blockedReason: expect.stringContaining("Bulbs is disabled") });

    await setCategoryEnabled(t.ctx, admin, { categoryId: "bulbs", enabled: true });
    await setPilotZipEnabled(t.ctx, admin, { zip: "85281", enabled: false });
    [failure] = (await listMatchingFailures(t.ctx, admin)).requests;
    expect(failure.rerun).toEqual({ allowed: false, blockedReason: expect.stringContaining("ZIP 85281 is not an enabled pilot ZIP") });
  });
});

describe("rerunMatching", () => {
  it("notifies only newly eligible mechanics and tells the customer the new total", async () => {
    const first = await createMechanic(t.ctx, { displayName: "First", baseZip: "85004" });
    const applicant = await createMechanic(t.ctx, { displayName: "Newly Approved", baseZip: "85281", status: "under_review" });
    const request = await createOpenRequest(t.ctx, customer);
    await initialMatching(request.id);
    expect(rows("SELECT mechanic_id FROM job_matches WHERE request_id = ?", request.id)).toEqual([{ mechanic_id: first.id }]);

    await setMechanicStatus(t.ctx, admin, { mechanicId: applicant.id, status: "approved" });
    const later = withNow(t.ctx, addHours(t.ctx.now, 1));
    const result = await rerunMatching(later, admin, request.id);

    expect(result).toEqual({
      requestId: request.id,
      notifiedCount: 2,
      newlyNotifiedCount: 1,
      newlyNotified: [{ id: applicant.id, displayName: "Newly Approved" }],
      evaluatedCount: 2,
      eligibleCount: 2,
    });
    expect(rows("SELECT mechanic_id, rank FROM job_matches WHERE request_id = ? ORDER BY rank", request.id)).toEqual([
      { mechanic_id: first.id, rank: 1 },
      { mechanic_id: applicant.id, rank: 2 },
    ]);
    expect(one<{ matched_count: number }>("SELECT matched_count FROM repair_requests WHERE id = ?", request.id).matched_count).toBe(2);
    // the first mechanic is not notified twice
    expect(rows("SELECT user_id FROM notifications WHERE type = 'job_matched' ORDER BY rowid")).toEqual([
      { user_id: first.id },
      { user_id: applicant.id },
    ]);
    expect(rows("SELECT title, body, link_path FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      {
        title: "1 more mechanic notified",
        body: expect.stringContaining("2 mechanics have been notified in total"),
        link_path: `/requests/${request.id}`,
      },
    ]);
    const audit = one<{ action: string; actor_user_id: string; metadata_json: string; created_at: string }>(
      "SELECT action, actor_user_id, metadata_json, created_at FROM audit_events WHERE action = 'request.matching_rerun'",
    );
    expect(audit).toMatchObject({ actor_user_id: admin.id, created_at: later.now.toISOString() });
    expect(JSON.parse(audit.metadata_json)).toEqual({
      newlyNotifiedMechanicIds: [applicant.id],
      notifiedCount: 2,
      eligibleCount: 2,
      evaluatedCount: 2,
    });

    // nothing new: no notifications, but the evaluations are refreshed
    const again = withNow(t.ctx, addHours(t.ctx.now, 2));
    await expect(rerunMatching(again, admin, request.id)).resolves.toMatchObject({ notifiedCount: 2, newlyNotifiedCount: 0, newlyNotified: [] });
    expect(rows("SELECT id FROM notifications WHERE user_id = ?", customer.id)).toHaveLength(1);
    expect(rows("SELECT DISTINCT evaluated_at FROM match_evaluations WHERE request_id = ?", request.id)).toEqual([
      { evaluated_at: again.now.toISOString() },
    ]);
  });

  it(`never notifies more than ${MAX_MECHANICS_NOTIFIED} mechanics in total`, async () => {
    for (let index = 0; index < 4; index += 1) await createMechanic(t.ctx, { baseZip: "85004" });
    const waiting = [];
    for (let index = 0; index < 3; index += 1) waiting.push(await createMechanic(t.ctx, { baseZip: "85281", status: "applied" }));
    const request = await createOpenRequest(t.ctx, customer);
    await initialMatching(request.id);

    for (const mechanic of waiting) await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: "approved" });
    const result = await rerunMatching(t.ctx, admin, request.id);

    expect(result).toMatchObject({ notifiedCount: MAX_MECHANICS_NOTIFIED, newlyNotifiedCount: 1, eligibleCount: 7 });
  });

  it("refuses requests that are not waiting for quotes, or whose category or ZIP is disabled", async () => {
    const cancelled = await createOpenRequest(t.ctx, customer);
    await t.ctx.db.updateTable("repair_requests").set({ status: "cancelled" }).where("id", "=", cancelled.id).execute();
    const stale = await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -8) });
    const wipers = await createOpenRequest(t.ctx, customer, { categoryId: "wipers" });
    const tempe = await createOpenRequest(t.ctx, customer, { zip: "85281" });
    await setCategoryEnabled(t.ctx, admin, { categoryId: "wipers", enabled: false });
    await setPilotZipEnabled(t.ctx, admin, { zip: "85281", enabled: false });

    expect((await expectDomainError(rerunMatching(t.ctx, admin, cancelled.id), "conflict")).userMessage).toContain("This one is cancelled.");
    // expiry is applied first, so the stale request is reported as expired (and the refused
    // transaction leaves the database as it was)
    expect((await expectDomainError(rerunMatching(t.ctx, admin, stale.id), "conflict")).userMessage).toContain("This one is expired.");
    expect(one<{ status: string }>("SELECT status FROM repair_requests WHERE id = ?", stale.id).status).toBe("open");
    expect((await expectDomainError(rerunMatching(t.ctx, admin, wipers.id), "conflict")).userMessage).toContain("Wipers is disabled");
    expect((await expectDomainError(rerunMatching(t.ctx, admin, tempe.id), "conflict")).userMessage).toContain("ZIP 85281");
    await expectDomainError(rerunMatching(t.ctx, admin, newId()), "not_found");
    expect(rows("SELECT id FROM audit_events WHERE action = 'request.matching_rerun'")).toEqual([]);
  });
});

describe("statuses as of now", () => {
  it("match what expireStaleRecords stores", async () => {
    const mechanics = [];
    for (let index = 0; index < 4; index += 1) mechanics.push(await createMechanic(t.ctx, {}));
    const hourAgo = addHours(t.ctx.now, -1);
    const slot = (hours: number) => addHours(t.ctx.now, hours);

    const staleOpen = await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -8) });
    const staleQuoted = await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -8) });
    await createSubmittedQuote(t.ctx, { requestId: staleQuoted.id, mechanicId: mechanics[0].id, slotStart: slot(30) });
    const lapsed = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: lapsed.id, mechanicId: mechanics[1].id, expiresAt: hourAgo, slotStart: slot(40) });
    const mixed = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: mixed.id, mechanicId: mechanics[2].id, expiresAt: hourAgo, slotStart: slot(50) });
    await createSubmittedQuote(t.ctx, { requestId: mixed.id, mechanicId: mechanics[3].id, slotStart: slot(60) });
    const fresh = await createOpenRequest(t.ctx, customer);
    const requestIds = [staleOpen.id, staleQuoted.id, lapsed.id, mixed.id, fresh.id];

    const effectiveRequests = new Map(
      (await listRequests(t.ctx, admin, {})).items.map((item) => [item.id, item.status] as const),
    );
    const effectiveQuotes = new Map((await listQuotes(t.ctx, admin, {})).items.map((item) => [item.id, item.status] as const));
    expect(requestIds.map((id) => effectiveRequests.get(id))).toEqual(["expired", "expired", "open", "quoted", "open"]);

    await writeTx(t.ctx.db, (trx) => expireStaleRecords(trx, t.ctx.now));

    const storedRequests = new Map(
      rows<{ id: string; status: string }>("SELECT id, status FROM repair_requests").map((row) => [row.id, row.status] as const),
    );
    const storedQuotes = new Map(
      rows<{ id: string; status: string }>("SELECT id, status FROM quotes").map((row) => [row.id, row.status] as const),
    );
    expect(storedRequests).toEqual(effectiveRequests);
    expect(storedQuotes).toEqual(effectiveQuotes);
    // and once stored, the effective view does not change
    expect(new Map((await listQuotes(t.ctx, admin, {})).items.map((item) => [item.id, item.status] as const))).toEqual(storedQuotes);
  });
});
