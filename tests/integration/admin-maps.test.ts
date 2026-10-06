// The admin maps' data: every point is an approximate ZIP centroid (a request's ZIP, a
// mechanic's base ZIP or a pilot ZIP), never an exact address; plus the presentation codes
// of audit actions (stored names stay as recorded).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listAuditEvents } from "@/server/admin/audit-log";
import { markDemoBookingDisputed } from "@/server/admin/interventions";
import { auditActionCode, auditActionLabel, auditActionsForCode } from "@/server/admin/labels";
import { listMatchingFailures } from "@/server/admin/matching";
import { getMechanic } from "@/server/admin/mechanics";
import { getOperationsMap } from "@/server/admin/operations-map";
import { getRequest } from "@/server/admin/requests";
import { recordAudit } from "@/server/audit";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { runMatching } from "@/server/matching/run";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createUser,
  TEST_ZIPS,
} from "../support/factories";

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

const centroid = (zip: keyof typeof TEST_ZIPS) => ({ lat: TEST_ZIPS[zip].lat, lng: TEST_ZIPS[zip].lng });

const initialMatching = (requestId: string) =>
  writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId, now: t.ctx.now, mode: "initial" }));

describe("getOperationsMap", () => {
  it("shows pilot ZIPs, requests waiting for quotes and approved mechanics at ZIP centroids only", async () => {
    const marco = await createMechanic(t.ctx, { displayName: "Marco R.", baseZip: "85281", travelRadiusMiles: 15 });
    await createMechanic(t.ctx, { displayName: "Alex K.", status: "applied", baseZip: "85201" });
    const reached = await createOpenRequest(t.ctx, customer, { zip: "85004", streetAddress: "100 Secret Lane" });
    await initialMatching(reached.id);
    const unreached = await createOpenRequest(t.ctx, customer, { zip: "85251" });
    const booked = await createDemoFixtureBooking(t.ctx, { customer, mechanic: marco });

    const map = await getOperationsMap(t.ctx, admin);

    expect(map.zips.map((zip) => zip.zip).sort()).toEqual(["85004", "85201", "85251", "85281"]);
    expect(map.zips.find((zip) => zip.zip === "85004")).toMatchObject({
      ...centroid("85004"),
      city: "Phoenix",
      enabled: true,
      activeRequests: 1,
    });
    expect(map.requests.map((request) => request.id)).toEqual([reached.id, unreached.id]);
    expect(map.requests.map((request) => request.id)).not.toContain(booked.requestId);
    expect(map.requests[0]).toMatchObject({
      ...centroid("85004"),
      zip: "85004",
      status: "open",
      areaLabel: "Phoenix, AZ 85004",
      title: "2016 Toyota Camry · Diagnostic visit",
    });
    expect(map.requests[0].matchedCount).toBeGreaterThan(0);
    expect(map.requests[1]).toMatchObject({ ...centroid("85251"), matchedCount: 0 });
    expect(map.mechanics).toEqual([
      {
        id: marco.id,
        displayName: "Marco R.",
        ...centroid("85281"),
        area: "Tempe, AZ 85281",
        serviceMode: "both",
        travelRadiusMiles: 15,
        acceptingJobs: true,
      },
    ]);
    // Nothing private: no exact address, contact detail or customer identity on the map.
    expect(JSON.stringify(map)).not.toContain("Secret Lane");
    expect(JSON.stringify(map)).not.toContain("@");
  });
});

describe("matching diagnostics points", () => {
  it("places the request and each evaluated mechanic's base, with their travel radius", async () => {
    const near = await createMechanic(t.ctx, { displayName: "Near", baseZip: "85281", travelRadiusMiles: 20 });
    const far = await createMechanic(t.ctx, { displayName: "Far", baseZip: "86001", travelRadiusMiles: 10, serviceMode: "mobile" });
    const request = await createOpenRequest(t.ctx, customer, { zip: "85004", serviceMode: "mobile" });
    await initialMatching(request.id);

    const detail = await getRequest(t.ctx, admin, request.id);
    expect(detail.location).toEqual(centroid("85004"));
    const byName = new Map(detail.evaluations.map((evaluation) => [evaluation.mechanic.displayName, evaluation]));
    expect(byName.get("Near")).toMatchObject({
      mechanic: { id: near.id },
      base: { ...centroid("85281"), zip: "85281", area: "Tempe, AZ 85281" },
      serviceMode: "both",
      travelRadiusMiles: 20,
      eligible: true,
      notified: true,
    });
    expect(byName.get("Far")).toMatchObject({
      mechanic: { id: far.id },
      base: { ...centroid("86001"), zip: "86001", area: "Flagstaff, AZ 86001" },
      serviceMode: "mobile",
      travelRadiusMiles: 10,
      eligible: false,
      notified: false,
    });
    expect(byName.get("Far")?.reasons.map((reason) => reason.code)).toContain("out_of_range");
  });

  it("gives every matching failure its point and its evaluations", async () => {
    await createMechanic(t.ctx, { displayName: "Far", baseZip: "86001", travelRadiusMiles: 10, serviceMode: "mobile" });
    const request = await createOpenRequest(t.ctx, customer, { zip: "85251", serviceMode: "mobile" });
    await initialMatching(request.id);

    const report = await listMatchingFailures(t.ctx, admin);
    expect(report.requests).toHaveLength(1);
    const [failure] = report.requests;
    expect(failure.location).toEqual(centroid("85251"));
    expect(failure.maxGarageDistanceMiles).toBe(15);
    expect(failure.evaluations).toEqual([
      expect.objectContaining({
        mechanic: expect.objectContaining({ displayName: "Far" }),
        base: expect.objectContaining({ ...centroid("86001"), zip: "86001" }),
        eligible: false,
        notified: false,
      }),
    ]);
    expect(failure.evaluatedCount).toBe(1);
    expect(failure.eligibleCount).toBe(0);
    expect(failure.reasons.map((reason) => reason.code)).toEqual(failure.evaluations[0].reasons.map((reason) => reason.code));
  });

  it("gives a mechanic's review page the base ZIP centroid", async () => {
    const mechanic = await createMechanic(t.ctx, { baseZip: "85201", travelRadiusMiles: 30 });
    const detail = await getMechanic(t.ctx, admin, mechanic.id);
    expect(detail.profile).toMatchObject({ baseZip: "85201", baseLocation: centroid("85201"), travelRadiusMiles: 30 });
  });
});

describe("audit action codes", () => {
  it("shows and filters stored names under presentation codes", async () => {
    const mechanic = await createMechanic(t.ctx, {});
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed", payoutStatus: "pending" });
    await markDemoBookingDisputed(t.ctx, admin, { bookingId: booking.id, reason: "Customer reports a leak" });
    await writeTx(t.ctx.db, (trx) =>
      recordAudit(trx, { actor: "system", action: "booking.demo_fixture_created", entityType: "booking", entityId: booking.id, at: t.ctx.now }),
    );

    expect(auditActionCode("booking.demo_disputed")).toBe("booking.admin_disputed");
    expect(auditActionCode("booking.demo_fixture_created")).toBe("booking.sample_loaded");
    expect(auditActionCode("mechanic.approved")).toBe("mechanic.approved");
    expect(auditActionCode("demo.data_loaded")).toBe("sample.data_loaded");
    expect(auditActionLabel("booking.demo_disputed")).toBe("Booking marked disputed");
    expect(auditActionsForCode("booking.admin_disputed", ["booking.demo_disputed", "mechanic.approved"])).toEqual([
      "booking.demo_disputed",
    ]);

    const log = await listAuditEvents(t.ctx, admin);
    expect(log.filters.actions).toEqual([
      { value: "booking.admin_disputed", label: "Booking marked disputed" },
      { value: "booking.sample_loaded", label: "Booking loaded from sample data (no online payment)" },
    ]);
    expect(log.items.map((event) => event.actionCode).sort()).toEqual(["booking.admin_disputed", "booking.sample_loaded"]);

    const disputed = await listAuditEvents(t.ctx, admin, { action: "booking.admin_disputed" });
    expect(disputed.items.map((event) => [event.action, event.reason])).toEqual([
      ["booking.demo_disputed", "Customer reports a leak"],
    ]);
    // A stored name is not a code (it is shown under its alias), and unknown codes match nothing.
    expect((await listAuditEvents(t.ctx, admin, { action: "booking.demo_disputed" })).totalCount).toBe(0);
    expect((await listAuditEvents(t.ctx, admin, { action: "nothing.here" })).totalCount).toBe(0);
  });
});
