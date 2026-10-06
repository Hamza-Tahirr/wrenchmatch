// Every admin query and command refuses customer and mechanic viewers before reading input
// or touching a row (defense in depth behind requireRole("admin") in pages and actions).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDashboard } from "@/server/admin/dashboard";
import { listAuditEvents } from "@/server/admin/audit-log";
import { listCategories, setCategoryEnabled } from "@/server/admin/categories";
import { getAdminShell, getRequestStatusCounts } from "@/server/admin/counts";
import { cancelDemoBooking, markDemoBookingDisputed, setDemoPayoutHold } from "@/server/admin/interventions";
import { inviteMechanic } from "@/server/admin/invites";
import { getCapturedEmail, listCapturedEmails } from "@/server/admin/mailbox";
import { listBookings, listQuotes, listReservations, listReviews } from "@/server/admin/marketplace";
import { listMatchingFailures, rerunMatching } from "@/server/admin/matching";
import { revealMechanicPrivate } from "@/server/admin/mechanic-private";
import { reviewDocument, setSafetyApproval } from "@/server/admin/mechanic-review";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { getMechanic, listInsuranceExpiring, listMechanics } from "@/server/admin/mechanics";
import { getOperationsMap } from "@/server/admin/operations-map";
import { getZipCentroid, listPilotZips, setPilotZipEnabled, upsertPilotZip } from "@/server/admin/pilot-zips";
import { getRequest, listRequests, revealRequestContact } from "@/server/admin/requests";
import { getSupportCounts, listSupportRequests, resolveSupportRequest } from "@/server/admin/support";
import type { AppContext, Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createUser,
  type TestDemoBooking,
  type TestMechanic,
  type TestRequest,
} from "../support/factories";

let t: TestContext;
let customer: Viewer;
let mechanic: TestMechanic;
let admin: Viewer;
let request: TestRequest;
let booking: TestDemoBooking;
let documentId: string;
let supportRequestId: string;
let emailId: string;

beforeAll(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  admin = await createUser(t.ctx, { role: "admin" });
  mechanic = await createMechanic(t.ctx, {
    status: "applied",
    categories: ["oil_change", { id: "brake_work", safetyApproved: false }],
  });
  const bookedMechanic = await createMechanic(t.ctx, {});
  request = await createOpenRequest(t.ctx, customer);
  booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic: bookedMechanic, payoutStatus: "pending" });

  const fileId = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id: fileId,
      owner_user_id: mechanic.id,
      purpose: "mechanic_document",
      storage_key: `test/${fileId}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 2048,
      sha256: "0".repeat(64),
      metadata_stripped: 0,
    })
    .execute();
  documentId = newId();
  await t.ctx.db
    .insertInto("mechanic_documents")
    .values({ id: documentId, mechanic_id: mechanic.id, file_id: fileId, kind: "insurance" })
    .execute();
  supportRequestId = newId();
  await t.ctx.db
    .insertInto("support_requests")
    .values({
      id: supportRequestId,
      user_id: customer.id,
      role: "customer",
      request_id: request.id,
      topic: "quote_question",
      message: "When will I hear back from a mechanic?",
    })
    .execute();
  emailId = newId();
  await t.ctx.db
    .insertInto("email_outbox")
    .values({ id: emailId, to_user_id: customer.id, to_email: customer.email, subject: "Hi", body_text: "Hello", template: "test" })
    .execute();
});

afterAll(async () => {
  await t.cleanup();
});

type AdminCall = (ctx: AppContext, viewer: Viewer) => Promise<unknown>;

/** One call per exported admin domain function, with otherwise valid input. */
const ADMIN_CALLS: Record<string, AdminCall> = {
  getDashboard: (ctx, viewer) => getDashboard(ctx, viewer),
  getOperationsMap: (ctx, viewer) => getOperationsMap(ctx, viewer),
  getAdminShell: (ctx, viewer) => getAdminShell(ctx, viewer),
  getRequestStatusCounts: (ctx, viewer) => getRequestStatusCounts(ctx, viewer),
  listMechanics: (ctx, viewer) => listMechanics(ctx, viewer, { status: "awaiting_review" }),
  getMechanic: (ctx, viewer) => getMechanic(ctx, viewer, mechanic.id),
  revealMechanicPrivate: (ctx, viewer) =>
    revealMechanicPrivate(ctx, viewer, { mechanicId: mechanic.id, reason: "Verifying the application" }),
  setMechanicStatus: (ctx, viewer) => setMechanicStatus(ctx, viewer, { mechanicId: mechanic.id, status: "approved" }),
  setSafetyApproval: (ctx, viewer) =>
    setSafetyApproval(ctx, viewer, { mechanicId: mechanic.id, categoryId: "brake_work", approved: true }),
  reviewDocument: (ctx, viewer) => reviewDocument(ctx, viewer, { documentId, status: "verified" }),
  listInsuranceExpiring: (ctx, viewer) => listInsuranceExpiring(ctx, viewer, 30),
  inviteMechanic: (ctx, viewer) => inviteMechanic(ctx, viewer, { email: "new.mechanic@example.test" }),
  listRequests: (ctx, viewer) => listRequests(ctx, viewer, {}),
  getRequest: (ctx, viewer) => getRequest(ctx, viewer, request.id),
  revealRequestContact: (ctx, viewer) =>
    revealRequestContact(ctx, viewer, { requestId: request.id, reason: "Customer asked for a call back" }),
  listMatchingFailures: (ctx, viewer) => listMatchingFailures(ctx, viewer),
  rerunMatching: (ctx, viewer) => rerunMatching(ctx, viewer, request.id),
  listQuotes: (ctx, viewer) => listQuotes(ctx, viewer, {}),
  listReservations: (ctx, viewer) => listReservations(ctx, viewer),
  listBookings: (ctx, viewer) => listBookings(ctx, viewer, {}),
  listReviews: (ctx, viewer) => listReviews(ctx, viewer, {}),
  cancelDemoBooking: (ctx, viewer) => cancelDemoBooking(ctx, viewer, { bookingId: booking.id, reason: "Duplicate booking" }),
  markDemoBookingDisputed: (ctx, viewer) =>
    markDemoBookingDisputed(ctx, viewer, { bookingId: booking.id, reason: "Customer reports a problem" }),
  setDemoPayoutHold: (ctx, viewer) =>
    setDemoPayoutHold(ctx, viewer, { bookingId: booking.id, hold: true, reason: "Checking the invoice" }),
  listCategories: (ctx, viewer) => listCategories(ctx, viewer),
  setCategoryEnabled: (ctx, viewer) => setCategoryEnabled(ctx, viewer, { categoryId: "wipers", enabled: false }),
  listPilotZips: (ctx, viewer) => listPilotZips(ctx, viewer),
  getZipCentroid: (ctx, viewer) => getZipCentroid(ctx, viewer, "85004"),
  upsertPilotZip: (ctx, viewer) => upsertPilotZip(ctx, viewer, { zip: "85004", metroLabel: "Phoenix metro", enabled: false }),
  setPilotZipEnabled: (ctx, viewer) => setPilotZipEnabled(ctx, viewer, { zip: "85004", enabled: false }),
  listSupportRequests: (ctx, viewer) => listSupportRequests(ctx, viewer, {}),
  getSupportCounts: (ctx, viewer) => getSupportCounts(ctx, viewer),
  resolveSupportRequest: (ctx, viewer) =>
    resolveSupportRequest(ctx, viewer, { supportRequestId, resolutionNote: "Mechanics were notified." }),
  listAuditEvents: (ctx, viewer) => listAuditEvents(ctx, viewer, {}),
  listCapturedEmails: (ctx, viewer) => listCapturedEmails(ctx, viewer, {}),
  getCapturedEmail: (ctx, viewer) => getCapturedEmail(ctx, viewer, emailId),
};

// Exported async helpers that take a database handle rather than a viewer (used inside
// the admin modules, never by pages).
const INTERNAL_ASYNC_HELPERS = new Set([
  "loadBookingRecords",
  "loadEvaluationsFor",
  "loadInsuranceStandings",
  "loadQuoteLineItems",
  "reportingTimeZone",
]);

/** The parameter names of a function, read from its (type-stripped) source. */
function parameterNames(fn: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(fn);
  const open = source.indexOf("(");
  let depth = 0;
  let close = open;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    if (char === ")" || char === "}" || char === "]") depth -= 1;
    if (depth === 0) {
      close = index;
      break;
    }
  }
  return source
    .slice(open + 1, close)
    .split(",")
    .map((parameter) => parameter.split("=")[0].trim())
    .filter((parameter) => parameter.length > 0);
}

type AdminExport = { name: string; isAsync: boolean; takesViewer: boolean };

/** Every exported function of every module in src/server/admin. */
async function adminModuleExports(): Promise<AdminExport[]> {
  const dir = fileURLToPath(new URL("../../src/server/admin/", import.meta.url));
  const found: AdminExport[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const exports = (await import(/* @vite-ignore */ path.join(dir, file).replaceAll("\\", "/"))) as Record<
      string,
      unknown
    >;
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function") continue;
      const fn = value as (...args: never[]) => unknown;
      found.push({
        name,
        isAsync: fn.constructor.name === "AsyncFunction",
        takesViewer: parameterNames(fn).includes("viewer"),
      });
    }
  }
  return found;
}

function snapshot() {
  const count = (table: string) =>
    (t.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    audit: count("audit_events"),
    notifications: count("notifications"),
    emails: count("email_outbox"),
    jobMatches: count("job_matches"),
    mechanicStatus: t.sqlite.prepare("SELECT status FROM mechanic_profiles WHERE user_id = ?").get(mechanic.id),
    bookingStatus: t.sqlite.prepare("SELECT status, payout_status FROM bookings WHERE id = ?").get(booking.id),
    categories: t.sqlite.prepare("SELECT count(*) AS n FROM service_categories WHERE enabled = 1").get(),
    supportStatus: t.sqlite.prepare("SELECT status FROM support_requests WHERE id = ?").get(supportRequestId),
  };
}

describe("admin access control", () => {
  it("covers every exported admin domain function", async () => {
    const exports = await adminModuleExports();
    // A domain function is any exported function that takes a viewer, sync or async, plus
    // every async export that is not a documented internal helper.
    const domain = exports
      .filter((entry) => entry.name !== "assertAdmin")
      .filter((entry) => entry.takesViewer || (entry.isAsync && !INTERNAL_ASYNC_HELPERS.has(entry.name)))
      .map((entry) => entry.name);
    expect(new Set(domain).size).toBe(domain.length);
    expect([...domain].sort()).toEqual(Object.keys(ADMIN_CALLS).sort());
    // The list is derived from the modules: a sanity floor so an empty scan cannot pass.
    expect(domain.length).toBeGreaterThanOrEqual(30);
  });

  it("keeps the internal helpers internal: they exist and never take a viewer", async () => {
    const exports = await adminModuleExports();
    for (const helper of INTERNAL_ASYNC_HELPERS) {
      const entry = exports.find((candidate) => candidate.name === helper);
      expect(entry, helper).toBeDefined();
      expect(entry?.takesViewer, helper).toBe(false);
    }
    expect(exports.find((entry) => entry.name === "assertAdmin")).toMatchObject({ takesViewer: true, isAsync: false });
  });

  for (const role of ["customer", "mechanic"] as const) {
    it.each(Object.entries(ADMIN_CALLS))(`%s refuses a ${role}`, async (_name, call) => {
      const viewer = role === "customer" ? customer : mechanic;
      const before = snapshot();
      const error = await call(t.ctx, viewer).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("forbidden");
      expect(snapshot()).toEqual(before);
    });
  }

  it("refuses a forged viewer whose role is not admin even with an admin's id", async () => {
    const forged: Viewer = { ...admin, role: "customer" };
    await expect(getDashboard(t.ctx, forged)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets an admin read the dashboard", async () => {
    await expect(getDashboard(t.ctx, admin)).resolves.toMatchObject({ mechanics: expect.any(Object) });
  });
});
