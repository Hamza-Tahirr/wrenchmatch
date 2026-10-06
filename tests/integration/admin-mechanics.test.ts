// Admin review of mechanics: listing and detail, status transitions with reasons and the
// insurance rule, safety approvals (and their effect on matching), document review,
// audited private-detail reveals, insurance expiry and invitations.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MechanicStatus } from "@/lib/domain";
import type { AdminMechanicStatus } from "@/lib/validation/admin";
import { inviteMechanic } from "@/server/admin/invites";
import { rerunMatching } from "@/server/admin/matching";
import { revealMechanicPrivate } from "@/server/admin/mechanic-private";
import { reviewDocument, setSafetyApproval } from "@/server/admin/mechanic-review";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { getMechanic, listInsuranceExpiring, listMechanics } from "@/server/admin/mechanics";
import { recordAudit } from "@/server/audit";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { newId } from "@/server/ids";
import { runMatching } from "@/server/matching/run";
import { createTestContext, withNow, type TestContext } from "../support/db";
import { createMechanic, createOpenRequest, createUser } from "../support/factories";

// ctx.now is Monday 5 Oct 2026, 10:00 in Phoenix (17:00 UTC). Mechanics default to
// approved, base ZIP 85004 (Phoenix), insurance valid for a year.

let t: TestContext;
let admin: Viewer;

beforeEach(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin", displayName: "Avery Admin" });
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

const auditCount = () => one<{ n: number }>("SELECT count(*) AS n FROM audit_events").n;

type AuditRow = { actor_user_id: string; actor_role: string; action: string; entity_type: string; entity_id: string; reason: string | null; metadata_json: string };
const auditFor = (entityId: string) =>
  rows<AuditRow>(
    "SELECT actor_user_id, actor_role, action, entity_type, entity_id, reason, metadata_json FROM audit_events WHERE entity_id = ? ORDER BY rowid",
    entityId,
  );

type NotificationRow = { type: string; title: string; body: string; link_path: string };
const notificationsFor = (userId: string) =>
  rows<NotificationRow>("SELECT type, title, body, link_path FROM notifications WHERE user_id = ? ORDER BY rowid", userId);

type EmailRow = { to_email: string; to_user_id: string | null; subject: string; body_text: string; template: string };
const emailsTo = (email: string) =>
  rows<EmailRow>("SELECT to_email, to_user_id, subject, body_text, template FROM email_outbox WHERE to_email = ? ORDER BY rowid", email);

async function insertDocument(
  mechanicId: string,
  kind: "id_document" | "insurance" | "certification" | "other" = "insurance",
  status: "pending" | "verified" | "rejected" = "pending",
): Promise<{ documentId: string; fileId: string }> {
  const fileId = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id: fileId,
      owner_user_id: mechanicId,
      purpose: "mechanic_document",
      storage_key: `test/${fileId}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 4096,
      sha256: "a".repeat(64),
      metadata_stripped: 0,
      created_at: t.ctx.now.toISOString(),
    })
    .execute();
  const documentId = newId();
  await t.ctx.db
    .insertInto("mechanic_documents")
    .values({
      id: documentId,
      mechanic_id: mechanicId,
      file_id: fileId,
      kind,
      status,
      expires_on: kind === "insurance" ? "2027-06-30" : null,
      created_at: t.ctx.now.toISOString(),
    })
    .execute();
  return { documentId, fileId };
}

describe("listMechanics", () => {
  it("lists the review queue first, with counts, insurance standing and the account email", async () => {
    const rejected = await createMechanic(t.ctx, { status: "rejected", displayName: "Rae Rejected" });
    const approved = await createMechanic(t.ctx, {
      displayName: "Ana Approved",
      baseZip: "85281",
      categories: ["oil_change", "filters", { id: "brake_work", safetyApproved: false }],
    });
    const suspended = await createMechanic(t.ctx, { status: "suspended", displayName: "Sol Suspended" });
    const applied = await createMechanic(t.ctx, { status: "applied", displayName: "Abe Applied" });
    const underReview = await createMechanic(t.ctx, { status: "under_review", displayName: "Uma Review" });
    await insertDocument(approved.id, "insurance", "pending");
    await insertDocument(approved.id, "id_document", "verified");

    const list = await listMechanics(t.ctx, admin);

    expect(list.map((item) => item.id)).toEqual([underReview.id, applied.id, approved.id, suspended.id, rejected.id]);
    const item = list.find((entry) => entry.id === approved.id);
    expect(item).toMatchObject({
      displayName: "Ana Approved",
      accountEmail: approved.email,
      status: "approved",
      serviceMode: "both",
      baseZip: "85281",
      baseArea: "Tempe, AZ 85281",
      travelRadiusMiles: 25,
      servicesCount: 3,
      safetyApprovalsPending: 1,
      documentsCount: 2,
      pendingDocumentsCount: 1,
      acceptingJobs: true,
      isDemoAccount: false,
      insurance: { state: "valid", tone: "success", provider: "Test Mutual Insurance", expiresOn: "2027-10-05" },
    });
    expect(list.find((entry) => entry.id === rejected.id)?.statusReason).toBe("Test reason");
  });

  it("filters by status, by applications awaiting review and by name or email", async () => {
    const applied = await createMechanic(t.ctx, { status: "applied", displayName: "Jordan Wrench", email: "jordan.w@example.test" });
    const underReview = await createMechanic(t.ctx, { status: "under_review", displayName: "Kim Lee" });
    const approved = await createMechanic(t.ctx, { displayName: "Marco 100% Mobile" });

    const ids = async (filters: Parameters<typeof listMechanics>[2]) =>
      (await listMechanics(t.ctx, admin, filters)).map((item) => item.id).sort();

    expect(await ids({ status: "awaiting_review" })).toEqual([applied.id, underReview.id].sort());
    expect(await ids({ status: "approved" })).toEqual([approved.id]);
    expect(await ids({ query: "WRENCH" })).toEqual([applied.id]);
    expect(await ids({ query: "jordan.w@" })).toEqual([applied.id]);
    // LIKE wildcards in the search text are matched literally
    expect(await ids({ query: "100%" })).toEqual([approved.id]);
    expect(await ids({ query: "_" })).toEqual([]);
    // an unknown filter value is ignored rather than failing the page
    expect(await ids({ status: "bogus" as MechanicStatus })).toHaveLength(3);
  });
});

describe("getMechanic", () => {
  it("returns the review view without the private record", async () => {
    const mechanic = await createMechanic(t.ctx, {
      displayName: "Pat P.",
      legalName: "Patricia Private-Name",
      businessName: "Pat's Secret Garage LLC",
      phone: "602-555-0123",
      makes: ["Toyota", "Honda"],
      categories: ["oil_change", { id: "brake_work", safetyApproved: true }, { id: "suspension_work", safetyApproved: false }],
      availability: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
    });
    const { documentId, fileId } = await insertDocument(mechanic.id, "insurance", "pending");

    const detail = await getMechanic(t.ctx, admin, mechanic.id);

    expect(detail).toMatchObject({
      id: mechanic.id,
      account: { email: mechanic.email, isDemoAccount: false, disabledAt: null },
      profile: {
        displayName: "Pat P.",
        serviceMode: "both",
        baseArea: "Phoenix, AZ 85004",
        timeZone: "America/Phoenix",
        servicesAllMakes: false,
        acceptingJobs: true,
      },
      status: { current: "approved", allowedTransitions: ["suspended"], approvalBlockedReason: null },
      insurance: { state: "valid", provider: "Test Mutual Insurance", policyNumberOnFile: true },
      makes: ["Honda", "Toyota"],
      availability: [{ weekday: 1, weekdayLabel: "Monday", startMinute: 480, endMinute: 1080, label: "8:00 AM–6:00 PM" }],
      documents: [
        { id: documentId, kind: "insurance", kindLabel: "Insurance certificate", status: "pending", fileId, mimeType: "application/pdf", expiresOn: "2027-06-30" },
      ],
      hasPrivateDetails: true,
      stats: { jobsMatched: 0, jobsQuoted: 0, quotesSent: 0, activeQuotes: 0, bookings: 0, genuineAverageRating: null },
    });
    expect(detail.services.map((service) => [service.categoryId, service.safetySensitive, service.safetyApproved])).toEqual([
      ["oil_change", false, false],
      ["brake_work", true, true],
      ["suspension_work", true, false],
    ]);

    const serialized = JSON.stringify(detail);
    for (const secret of ["Patricia Private-Name", "Pat's Secret Garage LLC", "602-555-0123", "TEST-POLICY-0001", "100 Test Garage Way"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("explains when approval is blocked by insurance", async () => {
    const lapsed = await createMechanic(t.ctx, { status: "applied", insuranceExpiresOn: "2026-10-04" });
    const detail = await getMechanic(t.ctx, admin, lapsed.id);
    expect(detail.status.allowedTransitions).toEqual(["under_review", "approved", "rejected"]);
    expect(detail.insurance).toMatchObject({ state: "expired", tone: "danger", daysUntilExpiry: -1 });
    expect(detail.status.approvalBlockedReason).toContain("expired on Oct 4, 2026");
  });

  it("is not_found for an unknown or malformed id", async () => {
    await expectDomainError(getMechanic(t.ctx, admin, newId()), "not_found");
    // an id from a mangled URL is just another missing record (the page 404s)
    const malformed = await expectDomainError(getMechanic(t.ctx, admin, "../etc/passwd"), "not_found");
    expect(malformed.userMessage).toBe("That mechanic application was not found.");
  });

  it("includes what the mechanic did and what was done to their documents in the history", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx, { status: "applied" });
    const someoneElse = await createMechanic(t.ctx, {});
    const { documentId } = await insertDocument(mechanic.id, "insurance");
    const request = await createOpenRequest(t.ctx, customer);
    const quoteId = newId();
    const at = (hours: number) => new Date(t.ctx.now.getTime() + hours * 3_600_000);
    const asMechanic = { id: mechanic.id, role: "mechanic" as const, email: mechanic.email, displayName: mechanic.displayName };
    // recorded the way the mechanic module records them
    await writeTx(t.ctx.db, async (trx) => {
      await recordAudit(trx, { actor: asMechanic, action: "mechanic.apply", entityType: "mechanic", entityId: mechanic.id, at: at(-3) });
      await recordAudit(trx, { actor: asMechanic, action: "mechanic_document.add", entityType: "mechanic_document", entityId: documentId, metadata: { kind: "insurance" }, at: at(-2) });
      await recordAudit(trx, { actor: asMechanic, action: "quote.submit", entityType: "quote", entityId: quoteId, metadata: { requestId: request.id }, at: at(-1) });
      await recordAudit(trx, { actor: "system", action: "mechanic.apply", entityType: "mechanic", entityId: someoneElse.id, at: at(-1) });
    });

    const { history } = await getMechanic(t.ctx, admin, mechanic.id);

    expect(history.map((event) => [event.action, event.actionLabel, event.entityHref])).toEqual([
      ["quote.submit", "Quote sent", `/admin/requests/${request.id}`],
      ["mechanic_document.add", "Document uploaded", `/admin/mechanics/${mechanic.id}`],
      ["mechanic.apply", "Application submitted", `/admin/mechanics/${mechanic.id}`],
    ]);
  });
});

describe("setMechanicStatus", () => {
  const ALLOWED: ReadonlyArray<[MechanicStatus, AdminMechanicStatus]> = [
    ["applied", "under_review"],
    ["applied", "approved"],
    ["applied", "rejected"],
    ["under_review", "approved"],
    ["under_review", "rejected"],
    ["approved", "suspended"],
    ["suspended", "approved"],
    ["suspended", "rejected"],
  ];

  it.each(ALLOWED)("moves a mechanic from %s to %s and records who did it", async (from, to) => {
    const mechanic = await createMechanic(t.ctx, { status: from });
    const reason = to === "rejected" || to === "suspended" ? "Missing a valid certificate" : undefined;

    const result = await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: to, reason });

    expect(result).toMatchObject({ mechanicId: mechanic.id, previousStatus: from, status: to });
    const row = one<{ status: string; status_reason: string | null; status_changed_at: string; status_changed_by: string; approved_at: string | null }>(
      "SELECT status, status_reason, status_changed_at, status_changed_by, approved_at FROM mechanic_profiles WHERE user_id = ?",
      mechanic.id,
    );
    expect(row).toMatchObject({
      status: to,
      status_reason: reason ?? null,
      status_changed_at: t.ctx.now.toISOString(),
      status_changed_by: admin.id,
    });
    if (to === "approved") expect(row.approved_at).toBe(t.ctx.now.toISOString());
    expect(auditFor(mechanic.id)).toEqual([
      expect.objectContaining({ actor_user_id: admin.id, actor_role: "admin", entity_type: "mechanic", reason: reason ?? null }),
    ]);
    expect(notificationsFor(mechanic.id)).toHaveLength(1);
  });

  const REFUSED: ReadonlyArray<[MechanicStatus, AdminMechanicStatus]> = [
    ["applied", "suspended"],
    ["under_review", "under_review"],
    ["under_review", "suspended"],
    ["approved", "under_review"],
    ["approved", "approved"],
    ["approved", "rejected"],
    ["suspended", "under_review"],
    ["suspended", "suspended"],
    ["rejected", "approved"],
    ["rejected", "under_review"],
    ["rejected", "suspended"],
  ];

  it.each(REFUSED)("refuses to move a mechanic from %s to %s", async (from, to) => {
    const mechanic = await createMechanic(t.ctx, { status: from });
    await expectDomainError(
      setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: to, reason: "Because of a test" }),
      "conflict",
    );
    expect(one<{ status: string }>("SELECT status FROM mechanic_profiles WHERE user_id = ?", mechanic.id).status).toBe(from);
    expect(auditCount()).toBe(0);
    expect(notificationsFor(mechanic.id)).toEqual([]);
  });

  it.each(["rejected", "suspended"] as const)("requires a reason of at least 3 characters to set %s", async (status) => {
    const mechanic = await createMechanic(t.ctx, { status: status === "rejected" ? "under_review" : "approved" });
    for (const reason of [undefined, null, "", "   ", "no"]) {
      const error = await expectDomainError(
        setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status, reason }),
        "invalid_input",
      );
      expect(error.details?.fieldErrors).toEqual({ reason: [expect.stringContaining("at least 3 characters")] });
    }
    const tooLong = "x".repeat(501);
    await expectDomainError(setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status, reason: tooLong }), "invalid_input");
    expect(auditCount()).toBe(0);
  });

  it("approves with a notification that the mechanic can now receive job matches", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "under_review", displayName: "Alex K." });

    const result = await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: "approved" });

    expect(result.event).toBe("approved");
    expect(notificationsFor(mechanic.id)).toEqual([
      {
        type: "mechanic.approved",
        title: "Your application is approved",
        body: expect.stringContaining("You can now receive job matches"),
        link_path: "/mechanic/jobs",
      },
    ]);
    expect(emailsTo(mechanic.email)).toEqual([
      expect.objectContaining({ to_user_id: mechanic.id, subject: "Your application is approved", template: "mechanic_approved" }),
    ]);
    expect(emailsTo(mechanic.email)[0].body_text).toMatch(/^Hi Alex K\.,/);
    const [audit] = auditFor(mechanic.id);
    expect(audit).toMatchObject({ action: "mechanic.approved", actor_user_id: admin.id });
    expect(JSON.parse(audit.metadata_json)).toEqual({ from: "under_review", to: "approved", insuranceExpiresOn: "2027-10-05" });

    const detail = await getMechanic(t.ctx, admin, mechanic.id);
    expect(detail.status).toMatchObject({ current: "approved", changedBy: { id: admin.id, displayName: "Avery Admin" } });
    expect(detail.history.map((event) => event.action)).toContain("mechanic.approved");
  });

  it("tells a rejected or suspended mechanic why", async () => {
    const applicant = await createMechanic(t.ctx, { status: "applied" });
    const active = await createMechanic(t.ctx, {});

    await setMechanicStatus(t.ctx, admin, { mechanicId: applicant.id, status: "rejected", reason: "Insurance certificate is unreadable" });
    await setMechanicStatus(t.ctx, admin, { mechanicId: active.id, status: "suspended", reason: "Repeated no-shows" });

    expect(notificationsFor(applicant.id)).toEqual([
      expect.objectContaining({ type: "mechanic.rejected", title: "Your application was not approved", body: expect.stringContaining("Reason: Insurance certificate is unreadable.") }),
    ]);
    expect(notificationsFor(active.id)).toEqual([
      expect.objectContaining({ type: "mechanic.suspended", title: "Your account is suspended", body: expect.stringContaining("Reason: Repeated no-shows.") }),
    ]);
    expect(auditFor(active.id)[0]).toMatchObject({ action: "mechanic.suspended", reason: "Repeated no-shows" });
  });

  it("reinstates a suspended mechanic", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "suspended" });
    const result = await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: "approved", reason: "Insurance renewed" });
    expect(result).toMatchObject({ event: "reinstated", previousStatus: "suspended", status: "approved" });
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ type: "mechanic.reinstated", title: "Your account is reinstated", body: expect.stringContaining("Note from the admin: Insurance renewed.") }),
    ]);
    expect(auditFor(mechanic.id)[0]).toMatchObject({ action: "mechanic.reinstated" });
  });

  it("blocks approval when insurance has expired or is missing", async () => {
    const lapsed = await createMechanic(t.ctx, { status: "under_review", insuranceExpiresOn: "2026-10-04" });
    const uninsured = await createMechanic(t.ctx, { status: "applied", insuranceProvider: null, insuranceExpiresOn: null });
    const lapsedSuspended = await createMechanic(t.ctx, { status: "suspended", insuranceExpiresOn: "2026-09-30" });

    const expired = await expectDomainError(setMechanicStatus(t.ctx, admin, { mechanicId: lapsed.id, status: "approved" }), "mechanic_not_eligible");
    expect(expired.userMessage).toContain("expired on Oct 4, 2026");
    const missing = await expectDomainError(setMechanicStatus(t.ctx, admin, { mechanicId: uninsured.id, status: "approved" }), "mechanic_not_eligible");
    expect(missing.userMessage).toContain("Record the mechanic's insurance provider and expiry date");
    await expectDomainError(setMechanicStatus(t.ctx, admin, { mechanicId: lapsedSuspended.id, status: "approved" }), "mechanic_not_eligible");

    expect(rows("SELECT user_id FROM mechanic_profiles WHERE status = 'approved'")).toEqual([]);
    expect(auditCount()).toBe(0);
    // insurance doesn't block the other decisions
    await expect(setMechanicStatus(t.ctx, admin, { mechanicId: lapsed.id, status: "rejected", reason: "Insurance lapsed" })).resolves.toBeDefined();
  });

  it("checks insurance against the mechanic's local date, not UTC", async () => {
    // 04:30 UTC on 5 Oct is 21:30 on 4 Oct in Phoenix but 00:30 on 5 Oct in New York.
    const ctx = withNow(t.ctx, "2026-10-05T04:30:00.000Z");
    const phoenix = await createMechanic(ctx, { status: "under_review", baseZip: "85004", insuranceExpiresOn: "2026-10-04" });
    const newYork = await createMechanic(ctx, { status: "under_review", baseZip: "10001", insuranceExpiresOn: "2026-10-04" });

    await expect(setMechanicStatus(ctx, admin, { mechanicId: phoenix.id, status: "approved" })).resolves.toMatchObject({ status: "approved" });
    await expectDomainError(setMechanicStatus(ctx, admin, { mechanicId: newYork.id, status: "approved" }), "mechanic_not_eligible");
  });

  it("is not_found for an unknown mechanic", async () => {
    await expectDomainError(setMechanicStatus(t.ctx, admin, { mechanicId: newId(), status: "approved" }), "not_found");
  });
});

describe("setSafetyApproval", () => {
  it("approves safety work only for safety-sensitive categories the mechanic offers", async () => {
    const mechanic = await createMechanic(t.ctx, { categories: ["oil_change", { id: "brake_work", safetyApproved: false }] });
    const call = (categoryId: string, approved = true) =>
      setSafetyApproval(t.ctx, admin, { mechanicId: mechanic.id, categoryId, approved });

    const notSafety = await expectDomainError(call("oil_change"), "invalid_input");
    expect(notSafety.userMessage).toContain("isn't safety-sensitive");
    const notOffered = await expectDomainError(call("suspension_work"), "conflict");
    expect(notOffered.userMessage).toContain("doesn't offer suspension work");
    await expectDomainError(call("made_up_category"), "invalid_input");
    await expectDomainError(setSafetyApproval(t.ctx, admin, { mechanicId: newId(), categoryId: "brake_work", approved: true }), "not_found");
    expect(auditCount()).toBe(0);

    await expect(
      setSafetyApproval(t.ctx, admin, {
        mechanicId: mechanic.id,
        categoryId: "brake_work",
        approved: true,
        reason: "Checked 8 years of brake experience",
      }),
    ).resolves.toEqual({ mechanicId: mechanic.id, categoryId: "brake_work", approved: true, changed: true });
    expect(
      one("SELECT safety_approved, safety_approved_by, safety_approved_at FROM mechanic_services WHERE mechanic_id = ? AND category_id = 'brake_work'", mechanic.id),
    ).toEqual({ safety_approved: 1, safety_approved_by: admin.id, safety_approved_at: t.ctx.now.toISOString() });
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ type: "mechanic.safety_approved", title: "You're approved for brake work" }),
    ]);
    expect(auditFor(mechanic.id)).toEqual([
      expect.objectContaining({ action: "mechanic.safety_approval_granted", reason: "Checked 8 years of brake experience" }),
    ]);

    // repeating it changes nothing
    await expect(call("brake_work")).resolves.toMatchObject({ changed: false });
    expect(auditCount()).toBe(1);

    await expect(call("brake_work", false)).resolves.toMatchObject({ approved: false, changed: true });
    expect(
      one("SELECT safety_approved, safety_approved_by, safety_approved_at FROM mechanic_services WHERE mechanic_id = ? AND category_id = 'brake_work'", mechanic.id),
    ).toEqual({ safety_approved: 0, safety_approved_by: null, safety_approved_at: null });
    expect(auditFor(mechanic.id).map((row) => row.action)).toEqual([
      "mechanic.safety_approval_granted",
      "mechanic.safety_approval_removed",
    ]);
  });

  it("makes the mechanic eligible for brake requests once approved", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const brakes = await createMechanic(t.ctx, { displayName: "Bea Brakes", categories: [{ id: "brake_work", safetyApproved: false }] });
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "brake_work" });

    const first = await writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId: request.id, now: t.ctx.now, mode: "initial" }));
    expect(first.notifiedCount).toBe(0);
    expect(JSON.parse(one<{ reasons_json: string }>("SELECT reasons_json FROM match_evaluations WHERE mechanic_id = ?", brakes.id).reasons_json)).toEqual([
      "safety_category_not_approved",
    ]);

    await setSafetyApproval(t.ctx, admin, { mechanicId: brakes.id, categoryId: "brake_work", approved: true });
    const rerun = await rerunMatching(t.ctx, admin, request.id);

    expect(rerun).toMatchObject({ notifiedCount: 1, newlyNotifiedCount: 1, newlyNotified: [{ id: brakes.id, displayName: "Bea Brakes" }] });
    expect(rows("SELECT mechanic_id FROM job_matches WHERE request_id = ?", request.id)).toEqual([{ mechanic_id: brakes.id }]);
    expect(notificationsFor(brakes.id).map((row) => row.type)).toEqual(["mechanic.safety_approved", "job_matched"]);
  });
});

describe("reviewDocument", () => {
  it("verifying an insurance certificate with a later expiry renews the insurance on file", async () => {
    const mechanic = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-09-01" });
    const { documentId } = await insertDocument(mechanic.id, "insurance");
    t.sqlite.prepare("UPDATE mechanic_documents SET expires_on = '2027-09-01' WHERE id = ?").run(documentId);

    await reviewDocument(t.ctx, admin, { documentId, status: "verified" });

    expect(one("SELECT insurance_expires_on FROM mechanic_profiles WHERE user_id = ?", mechanic.id)).toEqual({
      insurance_expires_on: "2027-09-01",
    });
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ type: "mechanic.document_verified", body: expect.stringContaining("2027-09-01") }),
    ]);

    // An older certificate never shortens the cover on file.
    const older = await insertDocument(mechanic.id, "insurance");
    t.sqlite.prepare("UPDATE mechanic_documents SET expires_on = '2027-01-01' WHERE id = ?").run(older.documentId);
    await reviewDocument(t.ctx, admin, { documentId: older.documentId, status: "verified" });
    expect(one("SELECT insurance_expires_on FROM mechanic_profiles WHERE user_id = ?", mechanic.id)).toEqual({
      insurance_expires_on: "2027-09-01",
    });
  });

  it("verifies a document and tells the mechanic", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "applied" });
    const { documentId } = await insertDocument(mechanic.id, "insurance");

    const result = await reviewDocument(t.ctx, admin, { documentId, status: "verified" });

    expect(result).toEqual({ documentId, mechanicId: mechanic.id, previousStatus: "pending", status: "verified", changed: true });
    expect(one("SELECT status, review_note, reviewed_by, reviewed_at FROM mechanic_documents WHERE id = ?", documentId)).toEqual({
      status: "verified",
      review_note: null,
      reviewed_by: admin.id,
      reviewed_at: t.ctx.now.toISOString(),
    });
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ type: "mechanic.document_verified", title: "Your insurance certificate was verified" }),
    ]);
    const [audit] = auditFor(documentId);
    expect(audit).toMatchObject({ action: "mechanic_document.verified", entity_type: "mechanic_document" });
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ mechanicId: mechanic.id, kind: "insurance", from: "pending", to: "verified" });
    // the review shows up in the mechanic's history through metadata.mechanicId
    const detail = await getMechanic(t.ctx, admin, mechanic.id);
    expect(detail.history[0]).toMatchObject({ action: "mechanic_document.verified", entityHref: `/admin/mechanics/${mechanic.id}` });
    expect(detail.documents[0]).toMatchObject({ status: "verified", reviewedBy: { id: admin.id, displayName: "Avery Admin" } });

    // a repeated decision (double submit) writes nothing and notifies nobody again
    await expect(reviewDocument(t.ctx, admin, { documentId, status: "verified" })).resolves.toMatchObject({
      previousStatus: "verified",
      changed: false,
    });
    expect(notificationsFor(mechanic.id)).toHaveLength(1);
    expect(auditFor(documentId)).toHaveLength(1);
  });

  it("needs a note to reject a document", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "applied" });
    const { documentId } = await insertDocument(mechanic.id, "id_document");

    const error = await expectDomainError(reviewDocument(t.ctx, admin, { documentId, status: "rejected" }), "invalid_input");
    expect(error.details?.fieldErrors).toEqual({ note: [expect.stringContaining("Say why the document was rejected")] });

    await reviewDocument(t.ctx, admin, { documentId, status: "rejected", note: "The photo is blurry" });
    expect(one("SELECT status, review_note FROM mechanic_documents WHERE id = ?", documentId)).toEqual({
      status: "rejected",
      review_note: "The photo is blurry",
    });
    expect(notificationsFor(mechanic.id)).toEqual([
      expect.objectContaining({ title: "Your photo id was not accepted", body: expect.stringContaining("Reason: The photo is blurry.") }),
    ]);
    await expectDomainError(reviewDocument(t.ctx, admin, { documentId: newId(), status: "verified" }), "not_found");
  });
});

describe("revealMechanicPrivate", () => {
  it("returns the private record and audits the reveal with its reason", async () => {
    const mechanic = await createMechanic(t.ctx, {
      legalName: "Patricia Private-Name",
      businessName: "Pat's Garage LLC",
      phone: "602-555-0123",
    });

    const details = await revealMechanicPrivate(t.ctx, admin, { mechanicId: mechanic.id, reason: "Confirming the insurance policy" });

    expect(details).toEqual({
      mechanicId: mechanic.id,
      legalName: "Patricia Private-Name",
      businessName: "Pat's Garage LLC",
      phone: "602-555-0123",
      contactEmail: mechanic.email,
      garageAddress: { line1: "100 Test Garage Way", city: "Phoenix", state: "AZ", zip: "85004" },
      insurancePolicyNumber: "TEST-POLICY-0001",
      revealedAt: t.ctx.now.toISOString(),
    });
    expect(auditFor(mechanic.id)).toEqual([
      expect.objectContaining({
        action: "mechanic.private_revealed",
        actor_user_id: admin.id,
        entity_type: "mechanic",
        reason: "Confirming the insurance policy",
      }),
    ]);
    // audit metadata never repeats the revealed values
    expect(auditFor(mechanic.id)[0].metadata_json).not.toContain("602-555-0123");
  });

  it("requires a reason and an existing mechanic", async () => {
    const mobileOnly = await createMechanic(t.ctx, { serviceMode: "mobile" });
    await expectDomainError(revealMechanicPrivate(t.ctx, admin, { mechanicId: mobileOnly.id, reason: "" }), "invalid_input");
    await expectDomainError(revealMechanicPrivate(t.ctx, admin, { mechanicId: newId(), reason: "Checking" }), "not_found");
    expect(auditCount()).toBe(0);
    await expect(revealMechanicPrivate(t.ctx, admin, { mechanicId: mobileOnly.id, reason: "Checking" })).resolves.toMatchObject({
      garageAddress: null,
    });
  });
});

describe("listInsuranceExpiring", () => {
  it("lists expired and soon-expiring insurance of mechanics who are not rejected, soonest first", async () => {
    const expired = await createMechanic(t.ctx, { displayName: "Expired", insuranceExpiresOn: "2026-10-04" });
    const today = await createMechanic(t.ctx, { displayName: "Today", status: "applied", insuranceExpiresOn: "2026-10-05" });
    const soon = await createMechanic(t.ctx, { displayName: "Soon", status: "suspended", insuranceExpiresOn: "2026-10-20" });
    await createMechanic(t.ctx, { displayName: "Later", insuranceExpiresOn: "2026-11-30" });
    await createMechanic(t.ctx, { displayName: "Rejected", status: "rejected", insuranceExpiresOn: "2026-09-01" });
    await createMechanic(t.ctx, { displayName: "Missing", insuranceProvider: null, insuranceExpiresOn: null, status: "applied" });

    const list = await listInsuranceExpiring(t.ctx, admin);

    expect(list.map((item) => [item.mechanicId, item.insurance.state, item.insurance.daysUntilExpiry])).toEqual([
      [expired.id, "expired", -1],
      [today.id, "expiring_soon", 0],
      [soon.id, "expiring_soon", 15],
    ]);
    expect(list[0].insurance).toMatchObject({ label: "Expired Oct 4, 2026", tone: "danger" });
    expect(list[1].insurance.label).toBe("Expires Oct 5, 2026 (today)");
    expect(list[2].insurance).toMatchObject({ label: "Expires Oct 20, 2026 (in 15 days)", tone: "warning" });

    expect((await listInsuranceExpiring(t.ctx, admin, 7)).map((item) => item.mechanicId)).toEqual([expired.id, today.id]);
    await expectDomainError(listInsuranceExpiring(t.ctx, admin, -1), "invalid_input");
    await expectDomainError(listInsuranceExpiring(t.ctx, admin, 1.5), "invalid_input");
  });
});

describe("inviteMechanic", () => {
  it("captures an invitation email with the mechanic sign-up link and audits it", async () => {
    const result = await inviteMechanic(t.ctx, admin, {
      email: "  New.Mechanic@Example.TEST ",
      name: "Jamie",
      note: "We need more mobile mechanics in Mesa",
    });

    expect(result).toEqual({ emailId: expect.any(String), toEmail: "new.mechanic@example.test", previouslyInvited: false });
    const [email] = emailsTo("new.mechanic@example.test");
    expect(email).toMatchObject({ to_user_id: null, template: "mechanic_invite", subject: "You're invited to join WrenchMatch as a mechanic" });
    expect(email.body_text).toMatch(/^Hi Jamie,/);
    expect(email.body_text).toContain("/signup?role=mechanic");
    expect(email.body_text).toContain("Their note: We need more mobile mechanics in Mesa.");
    expect(email.body_text).toContain("Avery Admin");

    const [audit] = auditFor(result.emailId);
    expect(audit).toMatchObject({
      action: "mechanic.invited",
      entity_type: "email",
      actor_user_id: admin.id,
      reason: "We need more mobile mechanics in Mesa",
    });
    expect(JSON.parse(audit.metadata_json)).toEqual({ invitee: "n***@example.test", template: "mechanic_invite", reinvite: false });

    await expect(inviteMechanic(t.ctx, admin, { email: "new.mechanic@example.test" })).resolves.toMatchObject({ previouslyInvited: true });
  });

  it("refuses addresses that already have an account, whatever their case", async () => {
    const mechanic = await createMechanic(t.ctx, { email: "marco@example.test" });
    const customer = await createUser(t.ctx, { role: "customer", email: "dana@example.test" });

    const existingMechanic = await expectDomainError(inviteMechanic(t.ctx, admin, { email: "MARCO@example.test" }), "conflict");
    expect(existingMechanic.userMessage).toBe(
      "marco@example.test already has a mechanic account, so there's no need to invite them. Find them under Mechanics.",
    );
    const existingCustomer = await expectDomainError(inviteMechanic(t.ctx, admin, { email: customer.email }), "conflict");
    expect(existingCustomer.userMessage).toContain("already has a customer account");
    await expectDomainError(inviteMechanic(t.ctx, admin, { email: "not-an-email" }), "invalid_input");

    expect(rows("SELECT id FROM email_outbox")).toEqual([]);
    expect(auditCount()).toBe(0);
    expect(mechanic.email).toBe("marco@example.test");
  });
});
