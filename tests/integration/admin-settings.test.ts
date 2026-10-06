// Settings: service categories (enable/disable, reflected everywhere) and the configurable
// pilot area (ZIPs with admin-entered approximate centroids and IANA time zones).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listCategories, setCategoryEnabled } from "@/server/admin/categories";
import { rerunMatching } from "@/server/admin/matching";
import {
  ADMIN_CENTROID_SOURCE,
  getZipCentroid,
  listPilotZips,
  setPilotZipEnabled,
  upsertPilotZip,
} from "@/server/admin/pilot-zips";
import { addDays } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { createTestContext, type TestContext } from "../support/db";
import { createMechanic, createOpenRequest, createUser, createZip, TEST_ZIPS } from "../support/factories";

let t: TestContext;
let admin: Viewer;
let customer: Viewer;

beforeEach(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin" });
  customer = await createUser(t.ctx, { role: "customer" });
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

const audits = () =>
  rows<{ action: string; entity_type: string; entity_id: string; reason: string | null; metadata_json: string }>(
    "SELECT action, entity_type, entity_id, reason, metadata_json FROM audit_events ORDER BY rowid",
  );

const DENVER = { city: "Denver", state: "CO", lat: 39.74, lng: -104.99, timeZone: "America/Denver" };

describe("service categories", () => {
  it("lists all twelve categories with supply and demand counts", async () => {
    await createMechanic(t.ctx, { categories: [{ id: "brake_work", safetyApproved: true }, "oil_change"] });
    await createMechanic(t.ctx, { categories: [{ id: "brake_work", safetyApproved: false }] });
    await createMechanic(t.ctx, { status: "suspended", categories: [{ id: "brake_work", safetyApproved: true }] });
    await createOpenRequest(t.ctx, customer, { categoryId: "brake_work" });
    await createOpenRequest(t.ctx, customer, { categoryId: "brake_work", submittedAt: addDays(t.ctx.now, -8) });

    const categories = await listCategories(t.ctx, admin);

    expect(categories).toHaveLength(12);
    expect(categories.map((category) => category.id).slice(0, 2)).toEqual(["diagnostic_visit", "cel_code_read"]);
    expect(categories.find((category) => category.id === "brake_work")).toMatchObject({
      name: "Brake work",
      safetySensitive: true,
      enabled: true,
      customerNotice: expect.stringContaining("safety-critical"),
      approvedMechanicsOffering: 2,
      safetyApprovedMechanics: 1,
      activeRequests: 1,
    });
    expect(categories.find((category) => category.id === "oil_change")).toMatchObject({
      safetySensitive: false,
      approvedMechanicsOffering: 1,
      safetyApprovedMechanics: null,
      activeRequests: 0,
    });
    expect(categories.find((category) => category.id === "cel_code_read")?.customerNotice).toContain("not a full diagnosis");
  });

  it("disables a category everywhere it matters and re-enables it", async () => {
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "battery_replacement" });

    await expect(
      setCategoryEnabled(t.ctx, admin, { categoryId: "battery_replacement", enabled: false, reason: "No battery supplier yet" }),
    ).resolves.toEqual({ categoryId: "battery_replacement", enabled: false, changed: true });

    expect(one("SELECT enabled, updated_at FROM service_categories WHERE id = 'battery_replacement'")).toEqual({
      enabled: 0,
      updated_at: t.ctx.now.toISOString(),
    });
    const listed = (await listCategories(t.ctx, admin)).find((category) => category.id === "battery_replacement");
    expect(listed).toMatchObject({ enabled: false, activeRequests: 1 });
    expect((await listCategories(t.ctx, admin)).filter((category) => !category.enabled)).toHaveLength(1);
    await expectDomainError(rerunMatching(t.ctx, admin, request.id), "conflict");
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "category.disabled",
        entity_type: "category",
        entity_id: "battery_replacement",
        reason: "No battery supplier yet",
      }),
    ]);

    // repeating it changes nothing
    await expect(setCategoryEnabled(t.ctx, admin, { categoryId: "battery_replacement", enabled: false })).resolves.toMatchObject({ changed: false });
    expect(audits()).toHaveLength(1);

    await setCategoryEnabled(t.ctx, admin, { categoryId: "battery_replacement", enabled: true });
    expect(one<{ enabled: number }>("SELECT enabled FROM service_categories WHERE id = 'battery_replacement'").enabled).toBe(1);
    await expect(rerunMatching(t.ctx, admin, request.id)).resolves.toMatchObject({ requestId: request.id });
    expect(audits().map((row) => row.action)).toEqual(["category.disabled", "category.enabled", "request.matching_rerun"]);
  });

  it("refuses unknown categories", async () => {
    await expectDomainError(setCategoryEnabled(t.ctx, admin, { categoryId: "teleportation", enabled: false }), "not_found");
    await expectDomainError(setCategoryEnabled(t.ctx, admin, { categoryId: "Brake Work!", enabled: false }), "invalid_input");
  });
});

describe("pilot ZIPs", () => {
  it("adds a ZIP with an admin-entered centroid and lists it", async () => {
    const result = await upsertPilotZip(t.ctx, admin, {
      zip: "80202",
      metroLabel: "Denver metro",
      enabled: true,
      centroid: { ...DENVER, state: "co", timeZone: "america/denver" },
    });

    expect(result).toEqual({ zip: "80202", created: true, centroid: "added" });
    expect(one("SELECT city, state, lat, lng, time_zone, source FROM zip_centroids WHERE zip = '80202'")).toEqual({
      city: "Denver",
      state: "CO",
      lat: 39.74,
      lng: -104.99,
      time_zone: "America/Denver",
      source: ADMIN_CENTROID_SOURCE,
    });
    expect(await listPilotZips(t.ctx, admin)).toEqual([
      {
        zip: "80202",
        city: "Denver",
        state: "CO",
        metroLabel: "Denver metro",
        enabled: true,
        timeZone: "America/Denver",
        centroidSource: "admin-entered (approximate)",
        lat: 39.74,
        lng: -104.99,
        activeRequests: 0,
        mechanicsBasedHere: 0,
        createdAt: t.ctx.now.toISOString(),
        updatedAt: t.ctx.now.toISOString(),
      },
    ]);
    const [audit] = audits();
    expect(audit).toMatchObject({ action: "pilot_zip.added", entity_type: "pilot_zip", entity_id: "80202" });
    expect(JSON.parse(audit.metadata_json)).toEqual({
      metroLabel: "Denver metro",
      enabled: true,
      centroid: "added",
      location: { city: "Denver", state: "CO", lat: 39.74, lng: -104.99, timeZone: "America/Denver" },
    });
    expect(await getZipCentroid(t.ctx, admin, "80202")).toMatchObject({ city: "Denver", editable: true, pilotEnabled: true });
    expect(await getZipCentroid(t.ctx, admin, "99999")).toBeNull();
  });

  it.each(["Mars/Olympus_Mons", "EST", "+07:00", "America", "  "])("rejects the time zone %j", async (timeZone) => {
    const error = await expectDomainError(
      upsertPilotZip(t.ctx, admin, { zip: "80202", metroLabel: "Denver metro", enabled: true, centroid: { ...DENVER, timeZone } }),
      "invalid_input",
    );
    expect(error.details?.fieldErrors).toEqual({ timeZone: [expect.stringContaining("IANA time zone")] });
    expect(rows("SELECT zip FROM zip_centroids WHERE zip = '80202'")).toEqual([]);
  });

  it("asks for a centroid when the ZIP has no location on file", async () => {
    const error = await expectDomainError(
      upsertPilotZip(t.ctx, admin, { zip: "80202", metroLabel: "Denver metro", enabled: true }),
      "invalid_input",
    );
    expect(error.userMessage).toBe(
      "We don't have location data for ZIP 80202. Enter its city, state, latitude, longitude and time zone.",
    );
    expect(Object.keys(error.details?.fieldErrors ?? {}).sort()).toEqual(["city", "lat", "lng", "state", "timeZone"]);

    const badLatitude = await expectDomainError(
      upsertPilotZip(t.ctx, admin, { zip: "80202", metroLabel: "Denver", enabled: true, centroid: { ...DENVER, lat: 120 } }),
      "invalid_input",
    );
    expect(badLatitude.details?.fieldErrors).toEqual({ lat: [expect.stringContaining("latitude")] });
    expect(audits()).toEqual([]);
  });

  it("updates an existing pilot ZIP and protects reference centroids", async () => {
    await createZip(t.ctx, { zip: "85281", ...TEST_ZIPS["85281"], metroLabel: "Phoenix metro" });
    await createMechanic(t.ctx, { baseZip: "85281" });
    await createOpenRequest(t.ctx, customer, { zip: "85281" });

    await expect(upsertPilotZip(t.ctx, admin, { zip: "85281", metroLabel: "Phoenix East Valley", enabled: false })).resolves.toEqual({
      zip: "85281",
      created: false,
      centroid: "existing",
    });
    expect(one("SELECT metro_label, enabled, updated_at FROM pilot_zips WHERE zip = '85281'")).toEqual({
      metro_label: "Phoenix East Valley",
      enabled: 0,
      updated_at: t.ctx.now.toISOString(),
    });
    expect(JSON.parse(audits()[0].metadata_json)).toMatchObject({
      centroid: "existing",
      previous: { metroLabel: "Phoenix metro", enabled: true },
    });
    expect((await listPilotZips(t.ctx, admin))[0]).toMatchObject({ zip: "85281", activeRequests: 1, mechanicsBasedHere: 1, enabled: false });

    const protectedCentroid = await expectDomainError(
      upsertPilotZip(t.ctx, admin, { zip: "85281", metroLabel: "Tempe", enabled: true, centroid: { ...DENVER } }),
      "invalid_input",
    );
    expect(protectedCentroid.userMessage).toContain("ZIP 85281 already has location data (Tempe, AZ)");
    expect(one<{ city: string }>("SELECT city FROM zip_centroids WHERE zip = '85281'").city).toBe("Tempe");
  });

  it("lets an admin correct a centroid they entered", async () => {
    await upsertPilotZip(t.ctx, admin, { zip: "80202", metroLabel: "Denver metro", enabled: true, centroid: { ...DENVER, lat: 39.0 } });
    await expect(
      upsertPilotZip(t.ctx, admin, { zip: "80202", metroLabel: "Denver metro", enabled: true, centroid: DENVER }),
    ).resolves.toEqual({ zip: "80202", created: false, centroid: "updated" });
    expect(one<{ lat: number }>("SELECT lat FROM zip_centroids WHERE zip = '80202'").lat).toBe(39.74);
    expect(JSON.parse(audits()[1].metadata_json)).toMatchObject({ centroid: "updated", previousLocation: { lat: 39 } });
  });

  it("enables and disables a pilot ZIP", async () => {
    await createZip(t.ctx, { zip: "85004", ...TEST_ZIPS["85004"] });

    await expect(setPilotZipEnabled(t.ctx, admin, { zip: "85004", enabled: false, reason: "Pausing downtown" })).resolves.toEqual({
      zip: "85004",
      enabled: false,
      changed: true,
    });
    expect(one<{ enabled: number }>("SELECT enabled FROM pilot_zips WHERE zip = '85004'").enabled).toBe(0);
    await expect(setPilotZipEnabled(t.ctx, admin, { zip: "85004", enabled: false })).resolves.toMatchObject({ changed: false });
    expect(audits()).toEqual([expect.objectContaining({ action: "pilot_zip.disabled", reason: "Pausing downtown" })]);
    expect(await getZipCentroid(t.ctx, admin, "85004")).toMatchObject({ pilotEnabled: false, editable: false });

    await expectDomainError(setPilotZipEnabled(t.ctx, admin, { zip: "10001", enabled: true }), "not_found");
    await expectDomainError(setPilotZipEnabled(t.ctx, admin, { zip: "8500", enabled: true }), "invalid_input");
  });
});
