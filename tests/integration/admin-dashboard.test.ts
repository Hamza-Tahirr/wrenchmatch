// The admin dashboard's counts against direct SQL on factory data, the navigation and tab
// counts against the lists they link to, plus the help desk, the audit log and the dev mailbox.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "@/lib/domain";
import { listAuditEvents } from "@/server/admin/audit-log";
import { setCategoryEnabled } from "@/server/admin/categories";
import { getAdminShell, getRequestStatusCounts } from "@/server/admin/counts";
import { getDashboard } from "@/server/admin/dashboard";
import { inviteMechanic } from "@/server/admin/invites";
import { getCapturedEmail, listCapturedEmails } from "@/server/admin/mailbox";
import { listMatchingFailures } from "@/server/admin/matching";
import { reviewDocument } from "@/server/admin/mechanic-review";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { listMechanics } from "@/server/admin/mechanics";
import { setPilotZipEnabled } from "@/server/admin/pilot-zips";
import { listRequests } from "@/server/admin/requests";
import { getSupportCounts, listSupportRequests, mentionsAccountDeletion, resolveSupportRequest } from "@/server/admin/support";
import { recordAudit, type AuditInput } from "@/server/audit";
import { addDays, addHours } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { newId } from "@/server/ids";
import { runMatching } from "@/server/matching/run";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
} from "../support/factories";

// ctx.now: Monday 5 Oct 2026, 10:00 in Phoenix (17:00 UTC). Every test ZIP used here is in
// America/Phoenix, so the dashboard's "today" runs from 07:00 UTC on 5 Oct to 07:00 UTC on 6 Oct.

let t: TestContext;
let admin: Viewer;
let customer: Viewer;

beforeEach(async () => {
  t = createTestContext();
  admin = await createUser(t.ctx, { role: "admin", displayName: "Avery Admin" });
  customer = await createUser(t.ctx, { role: "customer", displayName: "Dana" });
});

afterEach(async () => {
  await t.cleanup();
});

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

function count(query: string, ...params: unknown[]): number {
  return (t.sqlite.prepare(query).get(...params) as { n: number }).n;
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

async function insertDocument(mechanicId: string, status: "pending" | "verified"): Promise<void> {
  const fileId = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id: fileId,
      owner_user_id: mechanicId,
      purpose: "mechanic_document",
      storage_key: `test/${fileId}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 1000,
      sha256: "c".repeat(64),
      metadata_stripped: 0,
    })
    .execute();
  await t.ctx.db
    .insertInto("mechanic_documents")
    .values({ id: newId(), mechanic_id: mechanicId, file_id: fileId, kind: "id_document", status })
    .execute();
}

async function insertSupportRequest(input: {
  user: Viewer;
  role: "customer" | "mechanic";
  topic?: string;
  requestId?: string | null;
  bookingId?: string | null;
  createdAt?: Date;
  message?: string;
}): Promise<string> {
  const id = newId();
  await t.ctx.db
    .insertInto("support_requests")
    .values({
      id,
      user_id: input.user.id,
      role: input.role,
      request_id: input.requestId ?? null,
      booking_id: input.bookingId ?? null,
      topic: input.topic ?? "other",
      message: input.message ?? "I have a question about my repair.",
      created_at: (input.createdAt ?? t.ctx.now).toISOString(),
    })
    .execute();
  return id;
}

async function insertEmail(createdAt: string, template = "test_template", body = "Hello from the test."): Promise<string> {
  const id = newId();
  await t.ctx.db
    .insertInto("email_outbox")
    .values({ id, to_user_id: customer.id, to_email: customer.email, subject: `Email at ${createdAt}`, body_text: body, template, created_at: createdAt })
    .execute();
  return id;
}

describe("getDashboard", () => {
  it("counts everything from the database, matching direct SQL once expiry is applied", async () => {
    // mechanics in every state, with insurance expired, expiring soon and fine
    const applied = await createMechanic(t.ctx, { status: "applied", insuranceExpiresOn: "2026-10-20" });
    await createMechanic(t.ctx, { status: "applied", insuranceProvider: null, insuranceExpiresOn: null });
    const underReview = await createMechanic(t.ctx, { status: "under_review" });
    const approved = await createMechanic(t.ctx, { categories: ["diagnostic_visit", "oil_change", { id: "brake_work", safetyApproved: false }] });
    await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-01", baseZip: "85281" });
    await createMechanic(t.ctx, { insuranceExpiresOn: "2026-11-04", baseZip: "85201" });
    await createMechanic(t.ctx, { status: "suspended", categories: [{ id: "suspension_work", safetyApproved: false }] });
    await createMechanic(t.ctx, { status: "rejected", insuranceExpiresOn: "2026-01-01", categories: [{ id: "brake_work", safetyApproved: false }] });
    await createUser(t.ctx, { role: "mechanic" }); // signed up, never applied
    await insertDocument(applied.id, "pending");
    await insertDocument(underReview.id, "pending");
    await insertDocument(approved.id, "verified");

    // requests: matched, unmatched, quoted, lapsed quote, stale, reserved, cancelled, demo fixtures
    const matched = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -6)), customer);
    await writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId: matched.id, now: t.ctx.now, mode: "initial" }));
    await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -5)), customer, { zip: "86001" });
    const quoted = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -4)), customer);
    await createSubmittedQuote(t.ctx, { requestId: quoted.id, mechanicId: approved.id, slotStart: addHours(t.ctx.now, 30) });
    const lapsed = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -3)), customer);
    await createSubmittedQuote(t.ctx, { requestId: lapsed.id, mechanicId: approved.id, slotStart: addHours(t.ctx.now, 60), expiresAt: addHours(t.ctx.now, -1) });
    await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -9) });
    const reserved = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -2)), customer);
    const reservedQuote = await createSubmittedQuote(t.ctx, { requestId: reserved.id, mechanicId: approved.id, slotStart: addHours(t.ctx.now, 90) });
    await createPendingBooking(t.ctx, { quote: reservedQuote, customer });
    const cancelled = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -1)), customer);
    await t.ctx.db.updateTable("repair_requests").set({ status: "cancelled" }).where("id", "=", cancelled.id).execute();
    const confirmed = await createDemoFixtureBooking(t.ctx, { customer, mechanic: approved, slotStart: addHours(t.ctx.now, 120) });
    await createDemoFixtureBooking(t.ctx, { customer, mechanic: approved, status: "completed", payoutStatus: "pending", slotStart: addHours(t.ctx.now, -48) });
    await createDemoFixtureBooking(t.ctx, { customer, mechanic: approved, status: "disputed", payoutStatus: "held", slotStart: addHours(t.ctx.now, -72) });
    for (const status of ["proposed", "approved"] as const) {
      await t.ctx.db
        .insertInto("change_orders")
        .values({
          id: newId(),
          booking_id: confirmed.id,
          proposed_by: approved.id,
          description: "Extra work found during the job",
          reason: "Hidden fault",
          labor_cents: 3_000,
          amount_cents: 3_000,
          status,
          decided_at: status === "approved" ? t.ctx.now.toISOString() : null,
          is_demo_fixture: 1,
        })
        .execute();
    }

    // help requests, captured emails and audit events
    await insertSupportRequest({ user: customer, role: "customer" });
    await insertSupportRequest({ user: approved, role: "mechanic" });
    const resolved = await insertSupportRequest({ user: customer, role: "customer" });
    await resolveSupportRequest(t.ctx, admin, { supportRequestId: resolved, resolutionNote: "Answered by phone." });
    await setMechanicStatus(t.ctx, admin, { mechanicId: underReview.id, status: "approved" });
    await insertEmail("2026-10-05T06:59:59.999Z"); // 11:59 PM yesterday in Phoenix
    await insertEmail("2026-10-05T07:00:00.000Z"); // midnight today in Phoenix

    const dashboard = await getDashboard(t.ctx, admin);

    // the dashboard reads as of now; apply expiry so plain SQL sees the same states
    await writeTx(t.ctx.db, (trx) => expireStaleRecords(trx, t.ctx.now));
    const groups = (query: string) => Object.fromEntries(rows<{ key: string; n: number }>(query).map((row) => [row.key, row.n]));
    const withZeros = (keys: readonly string[], counts: Record<string, number>) =>
      Object.fromEntries(keys.map((key) => [key, counts[key] ?? 0]));

    expect(dashboard.reportingTimeZone).toBe("America/Phoenix");
    expect(dashboard.generatedAt).toBe(t.ctx.now.toISOString());
    expect(dashboard.mechanics).toEqual({
      awaitingReview: count("SELECT count(*) AS n FROM mechanic_profiles WHERE status IN ('applied', 'under_review')"),
      byStatus: withZeros(
        ["applied", "under_review", "approved", "rejected", "suspended"],
        groups("SELECT status AS key, count(*) AS n FROM mechanic_profiles GROUP BY status"),
      ),
      insuranceExpired: count(
        "SELECT count(*) AS n FROM mechanic_profiles WHERE status != 'rejected' AND insurance_provider IS NOT NULL AND insurance_expires_on < '2026-10-05'",
      ),
      insuranceExpiringSoon: count(
        "SELECT count(*) AS n FROM mechanic_profiles WHERE status != 'rejected' AND insurance_provider IS NOT NULL AND insurance_expires_on BETWEEN '2026-10-05' AND '2026-11-04'",
      ),
      insuranceWarningDays: 30,
      pendingDocuments: count("SELECT count(*) AS n FROM mechanic_documents WHERE status = 'pending'"),
      safetyApprovalsPending: count(
        `SELECT count(*) AS n FROM mechanic_services s JOIN service_categories c ON c.id = s.category_id
         JOIN mechanic_profiles p ON p.user_id = s.mechanic_id
         WHERE c.safety_sensitive = 1 AND s.safety_approved = 0 AND p.status != 'rejected'`,
      ),
      accountsWithoutApplication: count(
        "SELECT count(*) AS n FROM users u LEFT JOIN mechanic_profiles p ON p.user_id = u.id WHERE u.role = 'mechanic' AND p.user_id IS NULL",
      ),
    });
    expect(dashboard.mechanics).toMatchObject({
      awaitingReview: 2,
      insuranceExpired: 1,
      insuranceExpiringSoon: 2,
      pendingDocuments: 2,
      safetyApprovalsPending: 2,
      accountsWithoutApplication: 1,
    });

    expect(dashboard.requests).toEqual({
      open: count("SELECT count(*) AS n FROM repair_requests WHERE status IN ('open', 'quoted')"),
      openWithZeroMatches: count("SELECT count(*) AS n FROM repair_requests WHERE status IN ('open', 'quoted') AND matched_count = 0"),
      byStatus: withZeros(
        ["draft", "open", "quoted", "reserved", "booked", "expired", "cancelled"],
        groups("SELECT status AS key, count(*) AS n FROM repair_requests GROUP BY status"),
      ),
    });
    expect(dashboard.requests).toMatchObject({ open: 4, openWithZeroMatches: 3 });
    expect(dashboard.requests.byStatus).toMatchObject({ open: 3, quoted: 1, reserved: 1, booked: 3, expired: 1, cancelled: 1 });

    expect(dashboard.quotes.active).toBe(count("SELECT count(*) AS n FROM quotes WHERE status = 'submitted'"));
    expect(dashboard.quotes.active).toBe(1);
    expect(dashboard.bookings).toEqual({
      pendingPayment: count("SELECT count(*) AS n FROM bookings WHERE status = 'pending_payment'"),
      bookedByStatus: withZeros(
        ["pending_payment", "confirmed", "in_progress", "completed", "cancelled", "disputed"],
        groups("SELECT status AS key, count(*) AS n FROM bookings WHERE is_demo_fixture = 1 GROUP BY status"),
      ),
      bookedTotal: count("SELECT count(*) AS n FROM bookings WHERE is_demo_fixture = 1"),
    });
    expect(dashboard.bookings).toMatchObject({ pendingPayment: 1, bookedTotal: 3 });
    expect(dashboard.changeOrdersAwaitingCustomer).toBe(count("SELECT count(*) AS n FROM change_orders WHERE status = 'proposed'"));
    expect(dashboard.changeOrdersAwaitingCustomer).toBe(1);
    expect(dashboard.supportRequestsOpen).toBe(count("SELECT count(*) AS n FROM support_requests WHERE status = 'open'"));
    expect(dashboard.supportRequestsOpen).toBe(2);
    expect(dashboard.emailsCapturedToday).toBe(
      count(
        "SELECT count(*) AS n FROM email_outbox WHERE created_at >= '2026-10-05T07:00:00.000Z' AND created_at < '2026-10-06T07:00:00.000Z'",
      ),
    );
    // matching (2 mechanics), the help-desk resolution, the approval and the midnight email
    expect(dashboard.emailsCapturedToday).toBe(5);

    expect(dashboard.recentAuditEvents.map((event) => event.id)).toEqual(
      rows<{ id: string }>("SELECT id FROM audit_events ORDER BY created_at DESC, rowid DESC LIMIT 10").map((row) => row.id),
    );
    expect(dashboard.recentAuditEvents[0]).toMatchObject({
      action: "mechanic.approved",
      actionLabel: "Mechanic approved",
      actor: { id: admin.id, displayName: "Avery Admin", role: "admin" },
      entityHref: `/admin/mechanics/${underReview.id}`,
    });
    expect(dashboard.recentRequests.map((request) => request.id)).toEqual(
      rows<{ id: string }>("SELECT id FROM repair_requests WHERE status != 'draft' ORDER BY created_at DESC, rowid DESC LIMIT 5").map((row) => row.id),
    );
  });

  it("uses UTC days and zero counts without a pilot area", async () => {
    await insertEmail("2026-10-05T00:30:00.000Z");
    await insertEmail("2026-10-04T23:30:00.000Z");
    const dashboard = await getDashboard(t.ctx, admin);
    expect(dashboard.reportingTimeZone).toBe("UTC");
    expect(dashboard.emailsCapturedToday).toBe(1);
    expect(dashboard.mechanics.awaitingReview).toBe(0);
    expect(dashboard.requests.byStatus).toEqual({ draft: 0, open: 0, quoted: 0, reserved: 0, booked: 0, expired: 0, cancelled: 0 });
    expect(dashboard.recentAuditEvents).toEqual([]);
    expect(dashboard.recentRequests).toEqual([]);
  });
});

describe("admin shell and request tab counts", () => {
  it("count the same records as the lists they link to, as of now", async () => {
    await createMechanic(t.ctx, { status: "applied" });
    await createMechanic(t.ctx, { status: "under_review" });
    const approved = await createMechanic(t.ctx);
    await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -6)), customer, { matchedCount: 1 });
    await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -5)), customer, { matchedCount: 0 });
    const quoted = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -4)), customer, { matchedCount: 3 });
    await createSubmittedQuote(t.ctx, { requestId: quoted.id, mechanicId: approved.id, slotStart: addHours(t.ctx.now, 30) });
    // stored as open but past its expiry: counted as expired, never as waiting for quotes
    await createOpenRequest(t.ctx, customer, { submittedAt: addDays(t.ctx.now, -9), matchedCount: 0 });
    const cancelled = await createOpenRequest(withNow(t.ctx, addHours(t.ctx.now, -1)), customer);
    await t.ctx.db.updateTable("repair_requests").set({ status: "cancelled" }).where("id", "=", cancelled.id).execute();
    await insertSupportRequest({ user: customer, role: "customer" });
    const answered = await insertSupportRequest({ user: customer, role: "customer" });
    await resolveSupportRequest(t.ctx, admin, { supportRequestId: answered, resolutionNote: "Answered by phone." });

    const shell = await getAdminShell(t.ctx, admin);
    expect(shell).toEqual({
      reportingTimeZone: "America/Phoenix",
      counts: { mechanicsAwaitingReview: 2, matchingFailures: 2, supportOpen: 1 },
    });
    expect(shell.counts.mechanicsAwaitingReview).toBe((await listMechanics(t.ctx, admin, { status: "awaiting_review" })).length);
    expect(shell.counts.matchingFailures).toBe((await listMatchingFailures(t.ctx, admin)).requests.length);
    expect(shell.counts.supportOpen).toBe((await listSupportRequests(t.ctx, admin, { status: "open" })).totalCount);

    const counts = await getRequestStatusCounts(t.ctx, admin);
    expect(counts).toEqual({
      byStatus: { draft: 0, open: 2, quoted: 1, reserved: 0, booked: 0, expired: 1, cancelled: 1 },
      submitted: 5,
      active: 3,
      activeWithoutMatches: 1,
    });
    expect(counts.byStatus).toEqual((await getDashboard(t.ctx, admin)).requests.byStatus);
    const total = async (filters: Parameters<typeof listRequests>[2]) => (await listRequests(t.ctx, admin, filters)).totalCount;
    expect(counts.submitted).toBe(await total({}));
    expect(counts.active).toBe(await total({ status: "active" }));
    expect(counts.activeWithoutMatches).toBe(await total({ status: "active", zeroMatchesOnly: true }));
    for (const status of REQUEST_STATUSES) expect(counts.byStatus[status]).toBe(await total({ status }));
  });
});

describe("help desk", () => {
  it("lists open help requests first with the requester and what they are about", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, request: { categoryId: "oil_change" } });
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "bulbs", vehicleMake: "Honda", vehicleModel: "Fit", vehicleYear: 2012 });
    const resolved = await insertSupportRequest({ user: customer, role: "customer", topic: "account", createdAt: addHours(t.ctx.now, -10) });
    await resolveSupportRequest(t.ctx, admin, { supportRequestId: resolved, resolutionNote: "Email updated." });
    const aboutBooking = await insertSupportRequest({ user: mechanic, role: "mechanic", topic: "dispute", bookingId: booking.id, createdAt: addHours(t.ctx.now, -2) });
    const aboutRequest = await insertSupportRequest({ user: customer, role: "customer", topic: "quote_question", requestId: request.id, createdAt: addHours(t.ctx.now, -5) });

    const page = await listSupportRequests(t.ctx, admin);

    expect(page.items.map((item) => item.id)).toEqual([aboutRequest, aboutBooking, resolved]);
    expect(page.items[0]).toMatchObject({
      topic: "quote_question",
      topicLabel: "Question about a quote",
      status: "open",
      requester: { id: customer.id, displayName: "Dana", role: "customer" },
      linkedRequest: { id: request.id, summary: "Bulbs · 2012 Honda Fit" },
      linkedBooking: null,
    });
    expect(page.items[1]).toMatchObject({
      topicLabel: "Dispute",
      requester: { displayName: "Marco R.", role: "mechanic" },
      linkedRequest: { id: booking.requestId, summary: "Oil change · 2016 Toyota Camry" },
      linkedBooking: { id: booking.id, status: "confirmed", isDemoFixture: true },
    });
    expect(page.items[2]).toMatchObject({
      status: "resolved",
      resolutionNote: "Email updated.",
      resolvedAt: t.ctx.now.toISOString(),
      resolvedBy: { id: admin.id, displayName: "Avery Admin" },
    });
    expect((await listSupportRequests(t.ctx, admin, { status: "resolved" })).items.map((item) => item.id)).toEqual([resolved]);
    expect((await listSupportRequests(t.ctx, admin, { status: "open" })).totalCount).toBe(2);
  });

  it("uses the topic labels the requester saw when opening the request", async () => {
    const id = await insertSupportRequest({ user: customer, role: "customer", topic: "booking_issue" });
    expect((await listSupportRequests(t.ctx, admin)).items[0]).toMatchObject({ id, topicLabel: "Problem with a booking" });
    await resolveSupportRequest(t.ctx, admin, { supportRequestId: id, resolutionNote: "We called the mechanic" });
    expect(rows("SELECT body FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      { body: "Problem with a booking: We called the mechanic." },
    ]);
  });

  it("resolves a help request, tells the requester and refuses to resolve it twice", async () => {
    const id = await insertSupportRequest({ user: customer, role: "customer", topic: "cancellation" });

    await expect(resolveSupportRequest(t.ctx, admin, { supportRequestId: id, resolutionNote: "  Your request was cancelled  " })).resolves.toEqual({
      supportRequestId: id,
      status: "resolved",
      resolvedAt: t.ctx.now.toISOString(),
    });
    expect(rows("SELECT status, resolution_note, resolved_by, resolved_at FROM support_requests WHERE id = ?", id)).toEqual([
      { status: "resolved", resolution_note: "Your request was cancelled", resolved_by: admin.id, resolved_at: t.ctx.now.toISOString() },
    ]);
    expect(rows("SELECT type, title, body, link_path FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      {
        type: "support.resolved",
        title: "Your help request was resolved",
        body: "Cancellation: Your request was cancelled.",
        link_path: "/support",
      },
    ]);
    expect(rows("SELECT template FROM email_outbox WHERE to_user_id = ?", customer.id)).toEqual([{ template: "support_resolved" }]);
    expect(rows("SELECT action, reason FROM audit_events WHERE entity_id = ?", id)).toEqual([
      { action: "support_request.resolved", reason: "Your request was cancelled" },
    ]);

    const again = await expectDomainError(resolveSupportRequest(t.ctx, admin, { supportRequestId: id, resolutionNote: "Again" }), "conflict");
    expect(again.userMessage).toBe("This help request was already resolved. Refresh to see the latest.");
    await expectDomainError(resolveSupportRequest(t.ctx, admin, { supportRequestId: id, resolutionNote: "" }), "invalid_input");
    await expectDomainError(resolveSupportRequest(t.ctx, admin, { supportRequestId: newId(), resolutionNote: "Done" }), "not_found");
  });

  it("filters by topic, counts by status and topic, and flags account deletion requests", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
    const deletion = await insertSupportRequest({
      user: customer,
      role: "customer",
      topic: "account",
      message: "Please delete my account and the photos I uploaded.",
      createdAt: addHours(t.ctx.now, -3),
    });
    const signIn = await insertSupportRequest({
      user: mechanic,
      role: "mechanic",
      topic: "account",
      message: "I can't change the email on my profile.",
      createdAt: addHours(t.ctx.now, -2),
    });
    const closedAccount = await insertSupportRequest({
      user: customer,
      role: "customer",
      topic: "account",
      message: "I would like my account deleted now that the job is done.",
      createdAt: addHours(t.ctx.now, -4),
    });
    await resolveSupportRequest(t.ctx, admin, { supportRequestId: closedAccount, resolutionNote: "Account closed." });
    const other = await insertSupportRequest({
      user: customer,
      role: "customer",
      topic: "other",
      message: "Can I remove the photo from my request?",
      createdAt: addHours(t.ctx.now, -1),
    });

    const account = await listSupportRequests(t.ctx, admin, { topic: "account" });
    expect(account.items.map((item) => item.id)).toEqual([deletion, signIn, closedAccount]);
    expect(account.items.map((item) => item.mentionsAccountDeletion)).toEqual([true, false, true]);
    expect((await listSupportRequests(t.ctx, admin, { status: "open", topic: "account" })).items.map((item) => item.id)).toEqual([
      deletion,
      signIn,
    ]);
    const everything = await listSupportRequests(t.ctx, admin);
    expect(everything.totalCount).toBe(4);
    expect(everything.items.find((item) => item.id === other)?.mentionsAccountDeletion).toBe(false);
    // An unknown topic is ignored (the list shows every topic), like the other list filters.
    expect((await listSupportRequests(t.ctx, admin, { topic: "nonsense" as never })).totalCount).toBe(4);

    const counts = await getSupportCounts(t.ctx, admin);
    expect(counts.open).toBe(3);
    expect(counts.resolved).toBe(1);
    expect(counts.topics.account).toEqual({ open: 2, resolved: 1 });
    expect(counts.topics.other).toEqual({ open: 1, resolved: 0 });
    expect(counts.topics.dispute).toEqual({ open: 0, resolved: 0 });
    expect(counts.open).toBe((await listSupportRequests(t.ctx, admin, { status: "open" })).totalCount);
    await expectDomainError(getSupportCounts(t.ctx, customer), "forbidden");
  });

  it("recognises account deletion wording without flagging ordinary requests", () => {
    for (const message of [
      "Please delete my account.",
      "Can you close my WrenchMatch account?",
      "I want my account deleted.",
      "Please erase my personal data.",
      "Remove my profile, I sold the car.",
      "Deletion of my account, please.",
    ]) {
      expect(mentionsAccountDeletion(message), message).toBe(true);
    }
    for (const message of [
      "Can I remove the photo from my request?",
      "I can't sign in to my account.",
      "Please close the booking on my profile page.",
      "The mechanic deleted the change order.",
    ]) {
      expect(mentionsAccountDeletion(message), message).toBe(false);
    }
  });
});

describe("audit log", () => {
  it("lists events newest first with actor names, filters and links", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "applied" });
    await writeTx(t.ctx.db, (trx) =>
      recordAudit(trx, { actor: "system", action: "request.expired", entityType: "request", entityId: newId(), at: addHours(t.ctx.now, -1) }),
    );
    await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: "under_review" });
    await setMechanicStatus(t.ctx, admin, { mechanicId: mechanic.id, status: "rejected", reason: "Incomplete documents" });

    const log = await listAuditEvents(t.ctx, admin);

    expect(log.items.map((event) => event.action)).toEqual(["mechanic.rejected", "mechanic.review_started", "request.expired"]);
    expect(log.items[0]).toMatchObject({
      actionLabel: "Application rejected",
      entityType: "mechanic",
      entityLabel: "Mechanic",
      entityName: mechanic.displayName,
      entityId: mechanic.id,
      entityHref: `/admin/mechanics/${mechanic.id}`,
      reason: "Incomplete documents",
      actor: { id: admin.id, displayName: "Avery Admin", role: "admin" },
      metadata: { from: "under_review", to: "rejected" },
    });
    // the expired request no longer exists, so the event names no record
    expect(log.items[2]).toMatchObject({
      actionLabel: "Request expired",
      entityName: null,
      actor: { id: null, displayName: "System", role: "system" },
    });
    expect(log.filters).toEqual({
      entityTypes: [
        { value: "mechanic", label: "Mechanic" },
        { value: "request", label: "Repair request" },
      ],
      actions: [
        { value: "mechanic.rejected", label: "Application rejected" },
        { value: "mechanic.review_started", label: "Application review started" },
        { value: "request.expired", label: "Request expired" },
      ],
    });

    expect((await listAuditEvents(t.ctx, admin, { entityType: "request" })).items.map((event) => event.action)).toEqual(["request.expired"]);
    expect((await listAuditEvents(t.ctx, admin, { action: "mechanic.rejected" })).totalCount).toBe(1);
    expect((await listAuditEvents(t.ctx, admin, { entityType: "mechanic", action: "request.expired" })).items).toEqual([]);
  });

  it("labels events recorded by the other modules and links them to the record's admin page", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
    const confirmed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, slotStart: addHours(t.ctx.now, 30) });
    const completed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed", slotStart: addHours(t.ctx.now, -30) });
    const changeOrderId = newId();
    await t.ctx.db
      .insertInto("change_orders")
      .values({ id: changeOrderId, booking_id: confirmed.id, proposed_by: mechanic.id, description: "Replace the belt", reason: "It is cracked", labor_cents: 3_000, amount_cents: 3_000, is_demo_fixture: 1 })
      .execute();
    const invoiceId = newId();
    await t.ctx.db
      .insertInto("invoices")
      .values({
        id: invoiceId,
        booking_id: completed.id,
        invoice_number: "DEMO-TEST-0001",
        currency: "USD",
        line_items_json: "[]",
        labor_cents: 12_000,
        parts_cents: 4_550,
        tax_cents: 0,
        fee_cents: 0,
        total_cents: 16_550,
        platform_fee_bps: 1_000,
        platform_fee_cents: 1_200,
        mechanic_payout_cents: 15_350,
        issued_by: mechanic.id,
        issued_at: t.ctx.now.toISOString(),
        is_demo_fixture: 1,
      })
      .execute();
    const reviewId = newId();
    await t.ctx.db
      .insertInto("reviews")
      .values({ id: reviewId, booking_id: completed.id, customer_id: customer.id, mechanic_id: mechanic.id, rating: 5, is_demo_fixture: 1 })
      .execute();
    const supportId = await insertSupportRequest({ user: customer, role: "customer" });
    // recorded the way the customer, mechanic, support and auth modules record them
    const events: Omit<AuditInput, "at">[] = [
      { actor: mechanic, action: "booking.start", entityType: "booking", entityId: confirmed.id },
      { actor: mechanic, action: "change_order.propose", entityType: "change_order", entityId: changeOrderId, metadata: { bookingId: confirmed.id } },
      { actor: mechanic, action: "invoice.issue", entityType: "invoice", entityId: invoiceId, metadata: { bookingId: completed.id } },
      { actor: customer, action: "review.submit", entityType: "review", entityId: reviewId, metadata: { bookingId: completed.id, mechanicId: mechanic.id } },
      { actor: customer, action: "support_request.create", entityType: "support_request", entityId: supportId },
      { actor: customer, action: "account.signup", entityType: "user", entityId: customer.id },
      { actor: mechanic, action: "account.signup", entityType: "user", entityId: mechanic.id },
      { actor: "system", action: "demo.data_loaded", entityType: "system", entityId: null },
    ];
    await writeTx(t.ctx.db, async (trx) => {
      for (const [index, event] of events.entries()) await recordAudit(trx, { ...event, at: addHours(t.ctx.now, -index) });
    });

    const log = await listAuditEvents(t.ctx, admin);

    expect(log.items.map((event) => [event.actionLabel, event.entityHref])).toEqual([
      ["Job started", `/admin/requests/${confirmed.requestId}`],
      ["Change order proposed", `/admin/requests/${confirmed.requestId}`],
      ["Invoice issued", `/admin/requests/${completed.requestId}`],
      ["Review left", `/admin/requests/${completed.requestId}`],
      ["Help request opened", "/admin/support"],
      ["Account created", null],
      ["Account created", `/admin/mechanics/${mechanic.id}`],
      ["Sample data loaded", null],
    ]);
    const repair = "2016 Toyota Camry · Diagnostic visit";
    expect(log.items.map((event) => [event.entityLabel, event.entityName])).toEqual([
      ["Booking", repair],
      ["Change order", repair],
      ["Invoice", repair],
      ["Review", repair],
      ["Help request", "Something else"],
      ["Account", "Dana"],
      ["Account", "Marco R."],
      ["System", null],
    ]);
  });

  it("names the record each admin decision is about", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Priya S.", status: "applied" });
    await insertDocument(mechanic.id, "pending");
    const [document] = rows<{ id: string }>("SELECT id FROM mechanic_documents WHERE mechanic_id = ?", mechanic.id);
    await reviewDocument(t.ctx, admin, { documentId: document.id, status: "verified" });
    await setCategoryEnabled(t.ctx, admin, { categoryId: "wipers", enabled: false });
    await setPilotZipEnabled(t.ctx, admin, { zip: "85004", enabled: false });
    await inviteMechanic(t.ctx, admin, { email: "new.person@example.test" });

    const log = await listAuditEvents(t.ctx, admin);

    expect(log.items.map((event) => [event.action, event.entityName])).toEqual([
      ["mechanic.invited", "Invitation to n***@example.test"],
      ["pilot_zip.disabled", "ZIP 85004"],
      ["category.disabled", "Wipers"],
      ["mechanic_document.verified", "Photo ID (Priya S.)"],
    ]);
  });

  it("pages 25 events at a time", async () => {
    await writeTx(t.ctx.db, async (trx) => {
      for (let index = 0; index < 30; index += 1) {
        await recordAudit(trx, { actor: admin, action: "test.event", entityType: "request", entityId: String(index), at: addHours(t.ctx.now, -index) });
      }
    });
    const first = await listAuditEvents(t.ctx, admin, { page: 1 });
    const second = await listAuditEvents(t.ctx, admin, { page: 2 });
    expect(first).toMatchObject({ totalCount: 30, totalPages: 2, pageSize: 25 });
    expect(first.items[0].entityId).toBe("0");
    expect(second.items.map((event) => event.entityId)).toEqual(["25", "26", "27", "28", "29"]);
  });
});

describe("dev mailbox", () => {
  it("lists captured emails newest first and opens one in full", async () => {
    const longBody = `Line one.\n\n${"A very long sentence. ".repeat(20)}`;
    const older = await insertEmail("2026-10-05T10:00:00.000Z", "quote_received");
    const newer = await insertEmail("2026-10-05T12:00:00.000Z", "job_matched", longBody);
    const invitation = newId();
    await t.ctx.db
      .insertInto("email_outbox")
      .values({ id: invitation, to_user_id: null, to_email: "someone@example.test", subject: "Invite", body_text: "Join us", template: "mechanic_invite", created_at: "2026-10-05T11:00:00.000Z" })
      .execute();

    const page = await listCapturedEmails(t.ctx, admin);

    expect(page.items.map((email) => email.id)).toEqual([newer, invitation, older]);
    expect(page.templates).toEqual(["job_matched", "mechanic_invite", "quote_received"]);
    expect(page.items[0]).toMatchObject({
      toEmail: customer.email,
      recipient: { id: customer.id, displayName: "Dana", role: "customer" },
      template: "job_matched",
    });
    expect(page.items[0].preview).toHaveLength(140);
    expect(page.items[0].preview.startsWith("Line one. A very long sentence.")).toBe(true);
    expect(page.items[0].preview.endsWith("…")).toBe(true);
    expect(page.items[1].recipient).toBeNull();

    expect((await listCapturedEmails(t.ctx, admin, { template: "mechanic_invite" })).items.map((email) => email.id)).toEqual([invitation]);

    await expect(getCapturedEmail(t.ctx, admin, newer)).resolves.toMatchObject({
      id: newer,
      bodyText: longBody,
      delivery: "captured_locally",
      subject: "Email at 2026-10-05T12:00:00.000Z",
    });
    await expectDomainError(getCapturedEmail(t.ctx, admin, newId()), "not_found");
    await expectDomainError(getCapturedEmail(t.ctx, admin, "%2e%2e"), "not_found");
  });
});
