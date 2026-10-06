// Customer repair requests: submission (validation, pilot area, uploads, matching,
// notifications, rate limit, storage cleanup), cancellation and the request read models.
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildConsentSnapshot, REQUEST_CONSENTS } from "@/lib/domain";
import type { RepairRequestInput } from "@/lib/validation/request";
import { checkAndConsume } from "@/server/auth/rate-limit";
import { addDays, addHours } from "@/server/clock";
import type { AppContext, Viewer } from "@/server/context";
import { fieldErrorsOf } from "@/server/customer/form-errors";
import { NO_MATCH_TITLE } from "@/server/customer/messages";
import { CHOOSE_FILES_AGAIN, initialRequestFormState, submitRepairRequestForm } from "@/server/customer/request-form";
import { getRequestFormDefaults } from "@/server/customer/request-form-defaults";
import type { RequestUpload } from "@/server/customer/request-uploads";
import { cancelRequest, getMyRequest, listMyRequests, submitRepairRequest } from "@/server/customer/requests";
import { DomainError } from "@/server/errors";
import { createLocalFileStorage } from "@/server/storage/local-storage";
import type { FileStorage } from "@/server/storage/types";
import { prepareUpload } from "@/server/storage/uploads";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  createZip,
  TEST_ZIPS,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let photo: RequestUpload;
let video: RequestUpload;
let jpegBytes: Buffer;

const REQUEST_KEYS = REQUEST_CONSENTS.map((consent) => consent.key);

beforeAll(async () => {
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#cc3333" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "PrivacyProbeCam" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 27/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "112/1 4/1 9/1" },
    })
    .toBuffer();
  jpegBytes = jpeg;
  photo = {
    prepared: await prepareUpload({ bytes: jpeg, name: "battery.jpg", size: jpeg.byteLength }, "request_photo"),
    originalName: "battery.jpg",
  };
  const mp4 = Buffer.alloc(128);
  mp4.writeUInt32BE(24, 0);
  mp4.write("ftypisom", 4, "latin1");
  mp4.write("isomavc1", 16, "latin1");
  video = {
    prepared: await prepareUpload({ bytes: mp4, name: "noise.mp4", size: mp4.byteLength }, "request_video"),
    originalName: "noise.mp4",
  };
});

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer", displayName: "Riley Customer" });
  await createZip(t.ctx, { zip: "85004", ...TEST_ZIPS["85004"], metroLabel: "Phoenix metro" });
});

afterEach(async () => {
  await t.cleanup();
});

/** A valid request for Wednesday 7 Oct 2026 (ctx.now is Monday 5 Oct, 10:00 in Phoenix). */
function requestInput(overrides: Partial<RepairRequestInput> = {}): RepairRequestInput {
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
    acceptedConsentKeys: [...REQUEST_KEYS],
    ...overrides,
  };
}

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

function uploadedFiles(dir = path.join(t.dir, "uploads")): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe("submitRepairRequest", () => {
  it("stores the request, its private details and uploads, matches and reports the actual count", async () => {
    await createMechanic(t.ctx, { baseZip: "85004" });
    await createMechanic(t.ctx, { baseZip: "85281" });
    await createMechanic(t.ctx, { baseZip: "85201" });
    await createMechanic(t.ctx, { baseZip: "85251", status: "under_review" });
    await createUser(t.ctx, { role: "admin" });
    const nowIso = t.ctx.now.toISOString();

    const result = await submitRepairRequest(t.ctx, customer, requestInput(), { photos: [photo, photo], videos: [video] });

    expect(result.matchedCount).toBe(3);
    const [request] = rows<Record<string, unknown>>(
      "SELECT customer_id, status, zip, area_label, time_zone, approx_lat, approx_lng, matched_count, submitted_at, expires_at, category_id, drivable, mileage, is_demo_fixture FROM repair_requests WHERE id = ?",
      result.requestId,
    );
    expect(request).toEqual({
      customer_id: customer.id,
      status: "open",
      zip: "85004",
      area_label: "Phoenix, AZ 85004",
      time_zone: "America/Phoenix",
      approx_lat: TEST_ZIPS["85004"].lat,
      approx_lng: TEST_ZIPS["85004"].lng,
      matched_count: 3,
      submitted_at: nowIso,
      expires_at: addDays(t.ctx.now, 7).toISOString(),
      category_id: "battery_replacement",
      drivable: 0,
      mileage: 98_000,
      is_demo_fixture: 0,
    });
    expect(count("SELECT count(*) AS n FROM job_matches WHERE request_id = ?", result.requestId)).toBe(3);

    const [privateRow] = rows<{ contact_email: string; contact_phone: string; street_address: string; location_notes: string; consent_snapshot_json: string }>(
      "SELECT contact_email, contact_phone, street_address, location_notes, consent_snapshot_json FROM request_private WHERE request_id = ?",
      result.requestId,
    );
    expect(privateRow).toMatchObject({
      contact_email: "riley@example.test",
      contact_phone: "602-555-0199",
      street_address: "742 Private Lane",
      location_notes: "Gate code 4242",
    });
    expect(JSON.parse(privateRow.consent_snapshot_json)).toEqual(buildConsentSnapshot(REQUEST_CONSENTS, nowIso));

    const media = rows<{ kind: string; shareable_before_booking: number; purpose: string; storage_key: string; metadata_stripped: number; owner_user_id: string }>(
      `SELECT m.kind, m.shareable_before_booking, f.purpose, f.storage_key, f.metadata_stripped, f.owner_user_id
         FROM request_media m JOIN files f ON f.id = m.file_id WHERE m.request_id = ? ORDER BY m.kind`,
      result.requestId,
    );
    expect(media.map(({ kind, shareable_before_booking, purpose, metadata_stripped, owner_user_id }) => ({
      kind,
      shareable_before_booking,
      purpose,
      metadata_stripped,
      owner_user_id,
    }))).toEqual([
      { kind: "photo", shareable_before_booking: 1, purpose: "request_photo", metadata_stripped: 1, owner_user_id: customer.id },
      { kind: "photo", shareable_before_booking: 1, purpose: "request_photo", metadata_stripped: 1, owner_user_id: customer.id },
      // a video can carry location data that cannot be stripped: never shared before booking
      { kind: "video", shareable_before_booking: 0, purpose: "request_video", metadata_stripped: 0, owner_user_id: customer.id },
    ]);
    for (const file of media) expect(fs.existsSync(path.join(t.dir, "uploads", file.storage_key))).toBe(true);

    const notices = rows<{ user_id: string; type: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, type, title, body, link_path FROM notifications WHERE user_id = ?",
      customer.id,
    );
    expect(notices).toEqual([
      {
        user_id: customer.id,
        type: "request.submitted",
        title: "Sent to 3 nearby mechanics",
        body: expect.stringContaining("went to 3 approved mechanics near Phoenix, AZ"),
        link_path: `/requests/${result.requestId}`,
      },
    ]);
    expect(count("SELECT count(*) AS n FROM email_outbox WHERE to_user_id = ?", customer.id)).toBe(1);
    expect(count("SELECT count(*) AS n FROM notifications WHERE type = 'admin.request_no_match'")).toBe(0);
    expect(rows("SELECT action, entity_id, actor_user_id FROM audit_events WHERE action = 'request.submit'")).toEqual([
      { action: "request.submit", entity_id: result.requestId, actor_user_id: customer.id },
    ]);
  });

  it("is honest about zero matches and alerts every active admin without personal data", async () => {
    const admin = await createUser(t.ctx, { role: "admin" });
    const secondAdmin = await createUser(t.ctx, { role: "admin" });
    const disabledAdmin = await createUser(t.ctx, { role: "admin" });
    t.sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), disabledAdmin.id);
    await createMechanic(t.ctx, { baseZip: "86001" }); // Flagstaff: out of range

    const result = await submitRepairRequest(t.ctx, customer, requestInput());

    expect(result.matchedCount).toBe(0);
    expect(rows("SELECT status, matched_count FROM repair_requests WHERE id = ?", result.requestId)).toEqual([
      { status: "open", matched_count: 0 },
    ]);
    // Nobody was notified, so the request isn't shown as "waiting for quotes".
    await expect(getMyRequest(t.ctx, customer, result.requestId)).resolves.toMatchObject({
      status: "open",
      statusLabel: "No mechanics available yet",
      statusTone: "warning",
      matchedCount: 0,
      awaitingAdminFollowUp: true,
    });
    expect(rows("SELECT type, title FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      { type: "request.no_match", title: NO_MATCH_TITLE },
    ]);
    const alerts = rows<{ user_id: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, title, body, link_path FROM notifications WHERE type = 'admin.request_no_match' ORDER BY user_id",
    );
    expect(alerts.map((alert) => alert.user_id).sort()).toEqual([admin.id, secondAdmin.id].sort());
    for (const alert of alerts) {
      expect(alert.link_path).toBe(`/admin/requests/${result.requestId}`);
      expect(alert.body).toContain("Battery replacement request near Phoenix, AZ");
      for (const secret of ["602-555-0199", "riley@example.test", "742 Private Lane", "Gate code"]) {
        expect(alert.body).not.toContain(secret);
      }
    }
  });

  it("rejects a disabled category, unknown, non-pilot and disabled pilot ZIPs, and stores nothing", async () => {
    await createZip(t.ctx, { zip: "10001", ...TEST_ZIPS["10001"] });
    await createZip(t.ctx, { zip: "85281", ...TEST_ZIPS["85281"], metroLabel: "Phoenix metro" });
    t.sqlite.prepare("UPDATE pilot_zips SET enabled = 0 WHERE zip = '85281'").run();
    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'oil_change'").run();

    const disabledCategory = await rejection(
      submitRepairRequest(t.ctx, customer, requestInput({ categoryId: "oil_change" }), { photos: [photo], videos: [] }),
    );
    expect(disabledCategory.code).toBe("invalid_input");
    expect(fieldErrorsOf(disabledCategory)).toEqual({
      categoryId: ["That kind of repair isn't available right now. Choose another one."],
    });

    const unknownZip = await rejection(submitRepairRequest(t.ctx, customer, requestInput({ zip: "99999" })));
    expect(fieldErrorsOf(unknownZip)).toEqual({
      zip: ["We don't recognize the ZIP code 99999. Check it and try again."],
    });

    const outside = await rejection(submitRepairRequest(t.ctx, customer, requestInput({ zip: "10001" })));
    expect(fieldErrorsOf(outside)).toEqual({
      zip: ["WrenchMatch isn't available in 10001 yet. The pilot currently serves: Phoenix metro."],
    });

    const disabledPilot = await rejection(submitRepairRequest(t.ctx, customer, requestInput({ zip: "85281" })));
    expect(fieldErrorsOf(disabledPilot)?.zip?.[0]).toMatch(/isn't available in 85281 yet/);

    expect(count("SELECT count(*) AS n FROM repair_requests")).toBe(0);
    expect(count("SELECT count(*) AS n FROM files")).toBe(0);
    expect(uploadedFiles()).toEqual([]);
  });

  it("re-validates the typed input and the date window in the ZIP's time zone", async () => {
    const invalid = await rejection(
      submitRepairRequest(t.ctx, customer, requestInput({ vehicleYear: 1950, contactPhone: "555-0100" })),
    );
    expect(invalid.code).toBe("invalid_input");
    expect(Object.keys(fieldErrorsOf(invalid) ?? {}).sort()).toEqual(["contactPhone", "vehicleYear"]);

    const tooLate = await rejection(submitRepairRequest(t.ctx, customer, requestInput({ preferredDate: "2026-12-05" })));
    expect(fieldErrorsOf(tooLate)).toEqual({ preferredDate: ["Choose a date within the next 60 days."] });
    const past = await rejection(submitRepairRequest(t.ctx, customer, requestInput({ preferredDate: "2026-10-04" })));
    expect(fieldErrorsOf(past)).toEqual({ preferredDate: ["Choose today or a later date."] });

    // 11 PM in Phoenix on 5 Oct is already 6 Oct in UTC; "today" is still the 5th locally.
    const lateEvening = withNow(t.ctx, "2026-10-06T06:00:00.000Z");
    const result = await submitRepairRequest(lateEvening, customer, requestInput({ preferredDate: "2026-10-05" }));
    expect(result.requestId).toBeTruthy();
  });

  it("refuses too many photos or videos before writing anything", async () => {
    const photos = await rejection(
      submitRepairRequest(t.ctx, customer, requestInput(), { photos: Array(6).fill(photo), videos: [] }),
    );
    expect(photos.code).toBe("invalid_input");
    expect(fieldErrorsOf(photos)).toEqual({ photos: ["Add up to 5 photos (you chose 6)."] });

    const videos = await rejection(submitRepairRequest(t.ctx, customer, requestInput(), { photos: [], videos: [video, video] }));
    expect(fieldErrorsOf(videos)).toEqual({ video: ["Add one short video at most (you chose 2)."] });

    const videoAsPhoto = await rejection(submitRepairRequest(t.ctx, customer, requestInput(), { photos: [video], videos: [] }));
    expect(fieldErrorsOf(videoAsPhoto)).toEqual({ photos: ["Photos must be JPEG, PNG or WebP images."] });
    expect(count("SELECT count(*) AS n FROM repair_requests")).toBe(0);
  });

  it("limits each customer to 10 submissions an hour, counting only committed ones", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    for (let attempt = 0; attempt < 10; attempt += 1) await checkAndConsume(t.ctx, "request_submit", customer.id);

    const limited = await rejection(submitRepairRequest(t.ctx, customer, requestInput()));
    expect(limited.code).toBe("rate_limited");
    expect(limited.userMessage).toMatch(/up to 10 repair requests an hour/);
    expect(count("SELECT count(*) AS n FROM repair_requests")).toBe(0);

    // Another customer is unaffected, and the window resets after an hour.
    await expect(submitRepairRequest(t.ctx, other, requestInput())).resolves.toMatchObject({ matchedCount: 0 });
    await expect(submitRepairRequest(withNow(t.ctx, addHours(t.ctx.now, 1)), customer, requestInput())).resolves.toBeTruthy();
  });

  it("does not count a rejected submission toward the limit", async () => {
    for (let attempt = 0; attempt < 9; attempt += 1) await checkAndConsume(t.ctx, "request_submit", customer.id);
    await rejection(submitRepairRequest(t.ctx, customer, requestInput({ zip: "99999" })));
    await expect(submitRepairRequest(t.ctx, customer, requestInput())).resolves.toBeTruthy();
  });

  it("removes files already written when a later step fails", async () => {
    const local = createLocalFileStorage(path.join(t.dir, "uploads"));
    let puts = 0;
    const flaky: FileStorage = {
      put: async (key, data) => {
        puts += 1;
        if (puts === 2) throw new Error("disk full");
        await local.put(key, data);
      },
      read: (key) => local.read(key),
      remove: (key) => local.remove(key),
    };
    const ctx: AppContext = { ...t.ctx, storage: flaky };

    await expect(submitRepairRequest(ctx, customer, requestInput(), { photos: [photo, photo], videos: [] })).rejects.toThrow(
      "disk full",
    );
    expect(puts).toBe(2);
    expect(uploadedFiles()).toEqual([]);
    expect(count("SELECT count(*) AS n FROM files")).toBe(0);
    expect(count("SELECT count(*) AS n FROM repair_requests")).toBe(0);
  });

  it("is for customers only", async () => {
    const mechanic = await createMechanic(t.ctx);
    const admin = await createUser(t.ctx, { role: "admin" });
    expect((await rejection(submitRepairRequest(t.ctx, mechanic, requestInput()))).code).toBe("forbidden");
    expect((await rejection(submitRepairRequest(t.ctx, admin, requestInput()))).code).toBe("forbidden");
  });
});

describe("cancelRequest", () => {
  it("cancels an open request, declines submitted quotes and notifies every notified mechanic", async () => {
    const quoting = await createMechanic(t.ctx, { baseZip: "85004" });
    const silent = await createMechanic(t.ctx, { baseZip: "85281" });
    const { requestId } = await submitRepairRequest(t.ctx, customer, requestInput());
    const quote = await createSubmittedQuote(t.ctx, { requestId, mechanicId: quoting.id });
    t.sqlite.prepare("DELETE FROM notifications").run();

    const result = await cancelRequest(t.ctx, customer, { requestId, reason: "Fixed it myself" });

    expect(result).toEqual({ requestId, declinedQuoteCount: 1, notifiedMechanicCount: 2 });
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", requestId)).toEqual([{ status: "cancelled" }]);
    expect(rows("SELECT status FROM quotes WHERE id = ?", quote.id)).toEqual([{ status: "declined" }]);
    const notices = rows<{ user_id: string; type: string; body: string; link_path: string }>(
      "SELECT user_id, type, body, link_path FROM notifications ORDER BY user_id",
    );
    expect(notices.map((notice) => notice.user_id).sort()).toEqual([quoting.id, silent.id].sort());
    for (const notice of notices) {
      expect(notice.type).toBe("request.cancelled");
      expect(notice.link_path).toBe(`/mechanic/jobs/${requestId}`);
      expect(notice.body).not.toContain("Fixed it myself");
    }
    expect(notices.find((notice) => notice.user_id === quoting.id)?.body).toContain("Your quote was declined");
    expect(notices.find((notice) => notice.user_id === silent.id)?.body).not.toContain("Your quote");
    expect(count("SELECT count(*) AS n FROM email_outbox WHERE template = 'request_cancelled'")).toBe(2);
    expect(rows("SELECT action, reason FROM audit_events WHERE action = 'request.cancel'")).toEqual([
      { action: "request.cancel", reason: "Fixed it myself" },
    ]);

    expect((await rejection(cancelRequest(t.ctx, customer, { requestId }))).code).toBe("conflict");
  });

  it("refuses other customers' requests (not found), reservations and expired requests", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    expect((await rejection(cancelRequest(t.ctx, other, { requestId: request.id }))).code).toBe("not_found");
    expect((await rejection(cancelRequest(t.ctx, mechanic, { requestId: request.id }))).code).toBe("forbidden");
    expect((await rejection(cancelRequest(t.ctx, customer, { requestId: "missing-request" }))).code).toBe("not_found");

    const reserved = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: reserved.id, mechanicId: mechanic.id });
    await createPendingBooking(t.ctx, { quote, customer });
    const conflict = await rejection(cancelRequest(t.ctx, customer, { requestId: reserved.id }));
    expect(conflict.code).toBe("conflict");
    expect(conflict.userMessage).toMatch(/pending reservation/);

    const later = withNow(t.ctx, addDays(t.ctx.now, 8));
    expect((await rejection(cancelRequest(later, customer, { requestId: request.id }))).userMessage).toMatch(/expired/);
  });
});

describe("listMyRequests and getMyRequest", () => {
  it("show the customer's own request with media, private details, consent and timeline", async () => {
    await createMechanic(t.ctx, { baseZip: "85004" });
    await createMechanic(t.ctx, { baseZip: "85281" });
    const { requestId } = await submitRepairRequest(t.ctx, customer, requestInput(), { photos: [photo], videos: [video] });

    const detail = await getMyRequest(t.ctx, customer, requestId);
    expect(detail).toMatchObject({
      id: requestId,
      title: "Battery replacement · 2016 Toyota Camry",
      status: "open",
      statusLabel: "Waiting for quotes",
      matchedCount: 2,
      liveQuoteCount: 0,
      areaLabel: "Phoenix, AZ 85004",
      // The ZIP centroid only: maps never get the private street address.
      approxLocation: { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng },
      timeZone: "America/Phoenix",
      preferredWindowLabel: "Morning (8 AM–12 PM)",
      serviceMode: "mobile",
      drivable: false,
      canCancel: true,
      awaitingAdminFollowUp: false,
      contact: {
        email: "riley@example.test",
        phone: "602-555-0199",
        streetAddress: "742 Private Lane",
        city: "Phoenix",
        state: "AZ",
        locationNotes: "Gate code 4242",
      },
      quotes: [],
      quoteSummary: { selectableCount: 0, lowestTotalCents: null, earliestSlotStartAt: null },
      booking: null,
    });
    expect(detail.consent?.items.map((item) => item.key)).toEqual(REQUEST_KEYS);
    expect(detail.media.map((item) => [item.kind, item.sharedBeforeBooking, item.url.startsWith("/api/files/")])).toEqual([
      ["photo", true, true],
      ["video", false, true],
    ]);
    expect(detail.timeline.map((event) => [event.kind, event.title])).toEqual([
      ["submitted", "Request sent"],
      ["matched", "Sent to 2 nearby mechanics"],
    ]);

    const list = await listMyRequests(t.ctx, customer);
    expect(list.map((item) => [item.id, item.status, item.matchedCount])).toEqual([[requestId, "open", 2]]);
  });

  it("apply expiry for display without writing it", async () => {
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, expiresAt: addHours(t.ctx.now, 2) });

    const before = await getMyRequest(t.ctx, customer, request.id);
    expect([before.status, before.liveQuoteCount, before.quotes[0].status]).toEqual(["quoted", 1, "submitted"]);

    const afterQuoteExpiry = await getMyRequest(withNow(t.ctx, addHours(t.ctx.now, 3)), customer, request.id);
    expect([afterQuoteExpiry.status, afterQuoteExpiry.liveQuoteCount, afterQuoteExpiry.quotes[0].status]).toEqual([
      "open",
      0,
      "expired",
    ]);
    expect(afterQuoteExpiry.timeline.map((event) => event.kind)).toContain("quote_expired");

    const afterRequestExpiry = await getMyRequest(withNow(t.ctx, addDays(t.ctx.now, 8)), customer, request.id);
    expect([afterRequestExpiry.status, afterRequestExpiry.canCancel]).toEqual(["expired", false]);
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "quoted" }]);
  });

  it("flag a request nobody matched for the honest empty state", async () => {
    const { requestId } = await submitRepairRequest(t.ctx, customer, requestInput());
    const detail = await getMyRequest(t.ctx, customer, requestId);
    expect(detail.awaitingAdminFollowUp).toBe(true);
    expect(detail.timeline.map((event) => event.kind)).toEqual(["submitted", "no_match"]);
  });

  it("count mechanics who are interested without a live quote, never naming them", async () => {
    const interested = await createMechanic(t.ctx, { baseZip: "85004" });
    await createMechanic(t.ctx, { baseZip: "85281" });
    const { requestId } = await submitRepairRequest(t.ctx, customer, requestInput());
    expect((await getMyRequest(t.ctx, customer, requestId)).interestedCount).toBe(0);

    t.sqlite
      .prepare("UPDATE job_matches SET status = 'interested' WHERE request_id = ? AND mechanic_id = ?")
      .run(requestId, interested.id);
    const detail = await getMyRequest(t.ctx, customer, requestId);
    expect(detail.interestedCount).toBe(1);
    expect(JSON.stringify(detail)).not.toContain(interested.id);

    await cancelRequest(t.ctx, customer, { requestId });
    expect((await getMyRequest(t.ctx, customer, requestId)).interestedCount).toBe(0);
  });

  it("hide other customers' requests: not found, and nothing listed", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    const request = await createOpenRequest(t.ctx, customer);
    expect((await rejection(getMyRequest(t.ctx, other, request.id))).code).toBe("not_found");
    expect(await listMyRequests(t.ctx, other)).toEqual([]);
    const mechanic = await createMechanic(t.ctx);
    expect((await rejection(getMyRequest(t.ctx, mechanic, request.id))).code).toBe("forbidden");
    expect((await rejection(listMyRequests(t.ctx, mechanic))).code).toBe("forbidden");
  });
});

describe("getRequestFormDefaults", () => {
  it("starts a first request with the account email only", async () => {
    expect(await getRequestFormDefaults(t.ctx, customer)).toEqual({
      values: { contactEmail: customer.email },
      source: "account",
      copiedFromRequestId: null,
      notCopied: [],
    });
  });

  it("reuses the latest request's contact and location, but never its consents", async () => {
    await submitRepairRequest(t.ctx, customer, requestInput({ contactPhone: "480-555-0100", streetAddress: null }));
    await submitRepairRequest(t.ctx, customer, requestInput());

    const defaults = await getRequestFormDefaults(t.ctx, customer);
    expect(defaults).toEqual({
      values: {
        zip: "85004",
        streetAddress: "742 Private Lane",
        city: "Phoenix",
        state: "AZ",
        locationNotes: "Gate code 4242",
        contactPhone: "602-555-0199",
        contactEmail: "riley@example.test",
      },
      source: "last_request",
      copiedFromRequestId: null,
      notCopied: [],
    });
    expect(defaults.values.acceptedConsentKeys).toBeUndefined();
  });

  it("copies a previous request to send it again, leaving out what no longer applies", async () => {
    const { requestId } = await submitRepairRequest(
      t.ctx,
      customer,
      requestInput({ serviceMode: "garage", maxGarageDistanceMiles: 25, drivable: true }),
    );
    const copy = await getRequestFormDefaults(t.ctx, customer, { fromRequestId: requestId });
    expect(copy).toMatchObject({
      source: "copied_request",
      copiedFromRequestId: requestId,
      notCopied: [],
      values: {
        vehicleYear: "2016",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        mileage: "98000",
        categoryId: "battery_replacement",
        drivable: "yes",
        preferredDate: "2026-10-07",
        preferredWindow: "morning",
        serviceMode: "garage",
        maxGarageDistanceMiles: "25",
        contactPhone: "602-555-0199",
      },
    });

    // A week later the date has passed, and an admin disabled the category meanwhile.
    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'battery_replacement'").run();
    const later = await getRequestFormDefaults(withNow(t.ctx, addDays(t.ctx.now, 7)), customer, { fromRequestId: requestId });
    expect(later.notCopied).toEqual(["categoryId", "preferredDate"]);
    expect([later.values.categoryId, later.values.preferredDate, later.values.vehicleModel]).toEqual([
      undefined,
      undefined,
      "Camry",
    ]);
  });

  it("copies only the customer's own requests", async () => {
    const other = await createUser(t.ctx, { role: "customer" });
    const request = await createOpenRequest(t.ctx, customer);
    expect((await rejection(getRequestFormDefaults(t.ctx, other, { fromRequestId: request.id }))).code).toBe("not_found");
    const mechanic = await createMechanic(t.ctx);
    expect((await rejection(getRequestFormDefaults(t.ctx, mechanic))).code).toBe("forbidden");
  });
});

describe("submitRepairRequestForm", () => {
  function requestForm(overrides: Record<string, string> = {}, files: readonly File[] = []): FormData {
    const fields: Record<string, string> = {
      zip: "85004",
      streetAddress: "742 Private Lane",
      city: "Phoenix",
      state: "AZ",
      locationNotes: "",
      vehicleYear: "2016",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      mileage: "98,000",
      categoryId: "battery_replacement",
      description: "The car won't start in the morning.",
      drivable: "no",
      preferredDate: "2026-10-07",
      preferredWindow: "morning",
      serviceMode: "mobile",
      contactPhone: "(602) 555-0199",
      contactEmail: "riley@example.test",
      ...overrides,
    };
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    for (const key of REQUEST_KEYS) form.append("acceptedConsentKeys", key);
    for (const file of files) form.append(file.type.startsWith("video/") ? "video" : "photos", file);
    return form;
  }

  function heicFile(): File {
    const heic = Buffer.alloc(64);
    heic.writeUInt32BE(24, 0);
    heic.write("ftypheic", 4, "latin1");
    heic.write("mif1heic", 16, "latin1");
    return new File([new Uint8Array(heic)], "IMG_0001.HEIC", { type: "image/heic" });
  }

  it("submits a valid form with its photos", async () => {
    await createMechanic(t.ctx, { baseZip: "85004" });
    const jpeg = new File([new Uint8Array(jpegBytes)], "battery.jpg", { type: "image/jpeg" });

    const state = await submitRepairRequestForm(t.ctx, customer, requestForm({}, [jpeg]));

    expect(state).toEqual({ ok: true, requestId: expect.any(String), matchedCount: 1 });
    expect(rows("SELECT kind, shareable_before_booking FROM request_media")).toEqual([{ kind: "photo", shareable_before_booking: 1 }]);
    expect(rows("SELECT contact_phone FROM request_private")).toEqual([{ contact_phone: "602-555-0199" }]);
  });

  it("returns field and file problems together, echoes the values and asks for the files again", async () => {
    const state = await submitRepairRequestForm(t.ctx, customer, requestForm({ zip: "123", vehicleModel: " " }, [heicFile()]));

    expect(state.ok).toBe(false);
    if (state.ok) return;
    expect(Object.keys(state.fieldErrors).sort()).toEqual(["photos", "vehicleModel", "zip"]);
    expect(state.fieldErrors.photos?.[0]).toMatch(/HEIC/);
    expect(state.formError).toBe(CHOOSE_FILES_AGAIN);
    expect([state.values.zip, state.values.vehicleMake, state.values.acceptedConsentKeys]).toEqual(["123", "Toyota", REQUEST_KEYS]);
    expect(count("SELECT count(*) AS n FROM repair_requests")).toBe(0);
  });

  it("shows domain refusals as field errors, or as a form error when they concern the whole form", async () => {
    const outside = await submitRepairRequestForm(t.ctx, customer, requestForm({ zip: "99999" }));
    expect(outside).toEqual({
      ok: false,
      formError: null,
      fieldErrors: { zip: ["We don't recognize the ZIP code 99999. Check it and try again."] },
      values: expect.objectContaining({ zip: "99999" }),
    });

    for (let attempt = 0; attempt < 10; attempt += 1) await checkAndConsume(t.ctx, "request_submit", customer.id);
    const limited = await submitRepairRequestForm(t.ctx, customer, requestForm());
    expect(limited).toMatchObject({ ok: false, fieldErrors: {}, formError: expect.stringMatching(/up to 10 repair requests an hour/) });

    expect(initialRequestFormState({ zip: "85004" })).toEqual({ ok: false, formError: null, fieldErrors: {}, values: { zip: "85004" } });
    const mechanic = await createMechanic(t.ctx);
    expect((await rejection(submitRepairRequestForm(t.ctx, mechanic, requestForm()))).code).toBe("forbidden");
  });
});
