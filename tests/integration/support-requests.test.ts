// Help / dispute requests from customers and mechanics: ownership of linked records, admin
// alerts without personal data, and each person's own list.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addDays } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { fieldErrorsOf } from "@/server/customer/form-errors";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { ACCOUNT_DELETION_MESSAGE } from "@/lib/validation/support";
import {
  createSupportRequest,
  listMySupportRequests,
  listSupportLinkOptions,
  requestAccountDeletion,
} from "@/server/support/requests";
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
let otherCustomer: Viewer;
let admin: Viewer;
let secondAdmin: Viewer;
let mechanic: TestMechanic;
let otherMechanic: TestMechanic;
let request: TestRequest; // the customer's, matched to `mechanic`
let otherRequest: TestRequest; // another customer's, matched to nobody
let booking: TestDemoBooking; // customer + mechanic
let otherBooking: TestDemoBooking; // otherCustomer + otherMechanic

const MESSAGE = "The mechanic left without fixing the battery terminal. Contact me at riley@example.test.";

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer", email: "riley@example.test" });
  otherCustomer = await createUser(t.ctx, { role: "customer" });
  admin = await createUser(t.ctx, { role: "admin" });
  secondAdmin = await createUser(t.ctx, { role: "admin" });
  mechanic = await createMechanic(t.ctx);
  otherMechanic = await createMechanic(t.ctx);
  request = await createOpenRequest(t.ctx, customer);
  otherRequest = await createOpenRequest(t.ctx, otherCustomer);
  t.sqlite
    .prepare("INSERT INTO job_matches (id, request_id, mechanic_id, distance_miles, rank, notified_at) VALUES (?, ?, ?, 2.5, 1, ?)")
    .run(newId(), request.id, mechanic.id, t.ctx.now.toISOString());
  booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, slotStart: addDays(t.ctx.now, 3) });
  otherBooking = await createDemoFixtureBooking(t.ctx, {
    customer: otherCustomer,
    mechanic: otherMechanic,
    slotStart: addDays(t.ctx.now, 3),
  });
});

afterEach(async () => {
  await t.cleanup();
});

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
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

describe("createSupportRequest", () => {
  it("records a customer's request about their own repair request and alerts admins without personal data", async () => {
    const { supportRequestId } = await createSupportRequest(t.ctx, customer, {
      topic: "dispute",
      message: MESSAGE,
      requestId: request.id,
    });

    expect(rows("SELECT user_id, role, request_id, booking_id, topic, message, status FROM support_requests")).toEqual([
      {
        user_id: customer.id,
        role: "customer",
        request_id: request.id,
        booking_id: null,
        topic: "dispute",
        message: MESSAGE,
        status: "open",
      },
    ]);
    const alerts = rows<{ user_id: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, title, body, link_path FROM notifications WHERE type = 'support.created'",
    );
    expect(alerts.map((alert) => alert.user_id).sort()).toEqual([admin.id, secondAdmin.id].sort());
    for (const alert of alerts) {
      expect(alert).toMatchObject({
        title: "New help request: Dispute",
        body: "A customer opened a help request about one of their repair requests. Open the help desk to read it and respond.",
        link_path: "/admin/support",
      });
    }
    const mail = rows<{ body_text: string }>("SELECT body_text FROM email_outbox");
    expect(mail).toHaveLength(2);
    for (const { body_text } of mail) expect(body_text).not.toContain("riley@example.test");
    expect(rows("SELECT type, link_path FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      { type: "support.received", link_path: "/support" },
    ]);
    const [audit] = rows<{ action: string; entity_id: string; metadata_json: string }>(
      "SELECT action, entity_id, metadata_json FROM audit_events",
    );
    expect(audit).toMatchObject({ action: "support_request.create", entity_id: supportRequestId });
    expect(audit.metadata_json).not.toContain("battery terminal");
  });

  it("links a customer's own booking together with its request", async () => {
    await createSupportRequest(t.ctx, customer, { topic: "booking_issue", message: MESSAGE, bookingId: booking.id });
    expect(rows("SELECT request_id, booking_id FROM support_requests")).toEqual([
      { request_id: booking.request.id, booking_id: booking.id },
    ]);
  });

  it("refuses records that aren't the customer's (not found) and mismatched links", async () => {
    const otherRequestError = await rejection(
      createSupportRequest(t.ctx, customer, { topic: "other", message: MESSAGE, requestId: otherRequest.id }),
    );
    expect(otherRequestError.code).toBe("not_found");
    expect(fieldErrorsOf(otherRequestError)).toEqual({ requestId: ["We couldn't find that request in your account."] });

    const otherBookingError = await rejection(
      createSupportRequest(t.ctx, customer, { topic: "other", message: MESSAGE, bookingId: otherBooking.id }),
    );
    expect(otherBookingError.code).toBe("not_found");
    expect(fieldErrorsOf(otherBookingError)).toEqual({ bookingId: ["We couldn't find that booking in your account."] });

    const mismatch = await rejection(
      createSupportRequest(t.ctx, customer, { topic: "other", message: MESSAGE, requestId: request.id, bookingId: booking.id }),
    );
    expect([mismatch.code, fieldErrorsOf(mismatch)]).toEqual(["invalid_input", { bookingId: ["That booking isn't for the request you chose."] }]);

    const tooShort = await rejection(createSupportRequest(t.ctx, customer, { topic: "other", message: "Help!" }));
    expect(fieldErrorsOf(tooShort)).toEqual({ message: ["Add a little more detail: at least 10 characters."] });
    expect(rows("SELECT count(*) AS n FROM support_requests")).toEqual([{ n: 0 }]);
  });

  it("lets mechanics link jobs they were matched to and their own bookings only", async () => {
    await createSupportRequest(t.ctx, mechanic, { topic: "quote_question", message: MESSAGE, requestId: request.id });
    await createSupportRequest(t.ctx, mechanic, { topic: "booking_issue", message: MESSAGE, bookingId: booking.id });
    expect(rows("SELECT role, request_id, booking_id FROM support_requests ORDER BY booking_id IS NULL")).toEqual([
      { role: "mechanic", request_id: booking.request.id, booking_id: booking.id },
      { role: "mechanic", request_id: request.id, booking_id: null },
    ]);

    expect(
      (await rejection(createSupportRequest(t.ctx, mechanic, { topic: "other", message: MESSAGE, requestId: otherRequest.id })))
        .code,
    ).toBe("not_found");
    expect(
      (await rejection(createSupportRequest(t.ctx, mechanic, { topic: "other", message: MESSAGE, bookingId: otherBooking.id })))
        .code,
    ).toBe("not_found");
  });

  it("is for customers and mechanics only", async () => {
    expect((await rejection(createSupportRequest(t.ctx, admin, { topic: "other", message: MESSAGE }))).code).toBe("forbidden");
    expect((await rejection(listMySupportRequests(t.ctx, admin))).code).toBe("forbidden");
    expect((await rejection(listSupportLinkOptions(t.ctx, admin))).code).toBe("forbidden");
  });
});

describe("listMySupportRequests and listSupportLinkOptions", () => {
  it("show each person their own requests with links for their role", async () => {
    const { supportRequestId } = await createSupportRequest(t.ctx, customer, {
      topic: "booking_issue",
      message: MESSAGE,
      bookingId: booking.id,
    });
    await createSupportRequest(t.ctx, otherCustomer, { topic: "account", message: "I can't change my display name." });
    await createSupportRequest(t.ctx, mechanic, { topic: "dispute", message: MESSAGE, bookingId: booking.id });
    t.sqlite
      .prepare("UPDATE support_requests SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
      .run("We spoke with both of you; the mechanic will return Friday.", admin.id, t.ctx.now.toISOString(), supportRequestId);

    const mine = await listMySupportRequests(t.ctx, customer);
    expect(mine).toEqual([
      {
        id: supportRequestId,
        topic: "booking_issue",
        topicLabel: "Problem with a booking",
        message: MESSAGE,
        status: "resolved",
        statusLabel: "Resolved",
        statusTone: "success",
        resolutionNote: "We spoke with both of you; the mechanic will return Friday.",
        resolvedAt: t.ctx.now.toISOString(),
        createdAt: t.ctx.now.toISOString(),
        timeZone: "America/Phoenix",
        request: { id: booking.request.id, label: expect.stringContaining("Diagnostic visit · 2016 Toyota Camry"), href: `/requests/${booking.request.id}` },
        booking: { id: booking.id, label: expect.stringContaining("Diagnostic visit · 2016 Toyota Camry"), href: `/bookings/${booking.id}` },
      },
    ]);
    const mechanicView = await listMySupportRequests(t.ctx, mechanic);
    expect(mechanicView).toHaveLength(1);
    expect(mechanicView[0].booking?.href).toBe(`/mechanic/bookings/${booking.id}`);
    expect(mechanicView[0].request?.href).toBe(`/mechanic/jobs/${booking.request.id}`);
  });

  it("offer only the viewer's own records to link", async () => {
    const forCustomer = await listSupportLinkOptions(t.ctx, customer);
    expect(forCustomer.requests.map((option) => option.id).sort()).toEqual([request.id, booking.request.id].sort());
    expect(forCustomer.bookings.map((option) => option.id)).toEqual([booking.id]);

    const forMechanic = await listSupportLinkOptions(t.ctx, mechanic);
    expect(forMechanic.requests.map((option) => option.id).sort()).toEqual([request.id, booking.request.id].sort());
    expect(forMechanic.bookings.map((option) => option.id)).toEqual([booking.id]);
    expect(JSON.stringify(forMechanic)).not.toContain(customer.email);
  });

  it("show times in the linked request's zone, else in the person's own area", async () => {
    // The customer's latest request is in New York (the factory inserts it directly).
    const newYork = await createOpenRequest(t.ctx, customer, { zip: "10001" });
    await createSupportRequest(t.ctx, customer, { topic: "quote_question", message: MESSAGE, requestId: request.id });
    await createSupportRequest(t.ctx, customer, { topic: "account", message: "How do I change my display name?" });
    const customerView = await listMySupportRequests(t.ctx, customer);
    expect(newYork.timeZone).toBe("America/New_York");
    expect(customerView.map((item) => [item.topic, item.timeZone]).sort()).toEqual([
      ["account", "America/New_York"],
      ["quote_question", "America/Phoenix"],
    ]);

    await createSupportRequest(t.ctx, mechanic, { topic: "account", message: "Please update my business name." });
    expect((await listMySupportRequests(t.ctx, mechanic)).map((item) => item.timeZone)).toEqual(["America/Phoenix"]);

    const newcomer = await createUser(t.ctx, { role: "customer" });
    await createSupportRequest(t.ctx, newcomer, { topic: "other", message: "Where does WrenchMatch operate?" });
    expect((await listMySupportRequests(t.ctx, newcomer)).map((item) => item.timeZone)).toEqual(["America/Phoenix"]);
  });
});

describe("requestAccountDeletion", () => {
  it("sends the help desk an account request and deletes nothing", async () => {
    const before = rows<{ n: number }>("SELECT count(*) AS n FROM repair_requests WHERE customer_id = ?", customer.id)[0].n;
    const result = await requestAccountDeletion(t.ctx, customer, { details: "  Moving abroad next month.  " });
    expect(result.alreadyRequested).toBe(false);

    expect(rows("SELECT id, user_id, role, topic, status, request_id, booking_id FROM support_requests")).toEqual([
      {
        id: result.supportRequestId,
        user_id: customer.id,
        role: "customer",
        topic: "account",
        status: "open",
        request_id: null,
        booking_id: null,
      },
    ]);
    const [{ message }] = rows<{ message: string }>("SELECT message FROM support_requests");
    expect(message).toBe(`${ACCOUNT_DELETION_MESSAGE}\n\nMore detail: Moving abroad next month.`);

    // Nothing is deleted or disabled: the account and its records are untouched.
    expect(rows("SELECT id, disabled_at FROM users WHERE id = ?", customer.id)).toEqual([{ id: customer.id, disabled_at: null }]);
    expect(rows<{ n: number }>("SELECT count(*) AS n FROM repair_requests WHERE customer_id = ?", customer.id)[0].n).toBe(before);

    const alerts = rows<{ user_id: string; title: string; body: string }>(
      "SELECT user_id, title, body FROM notifications WHERE type = 'support.created'",
    );
    expect(alerts.map((alert) => alert.user_id).sort()).toEqual([admin.id, secondAdmin.id].sort());
    for (const alert of alerts) {
      expect(alert.title).toBe("New account deletion request");
      expect(alert.body).toContain("Nothing has been deleted");
      expect(alert.body).not.toContain(customer.email);
    }
    expect(rows("SELECT type, title FROM notifications WHERE user_id = ?", customer.id)).toEqual([
      { type: "support.received", title: "We received your account deletion request" },
    ]);
    const [audit] = rows<{ action: string; metadata_json: string }>("SELECT action, metadata_json FROM audit_events");
    expect(audit.action).toBe("support_request.create");
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ topic: "account", accountDeletion: true });

    const [listed] = await listMySupportRequests(t.ctx, customer);
    expect(listed).toMatchObject({ topic: "account", topicLabel: "Account", status: "open" });
  });

  it("doesn't send a second request while one is open, but can after it is resolved", async () => {
    const first = await requestAccountDeletion(t.ctx, customer);
    expect(rows<{ message: string }>("SELECT message FROM support_requests")[0].message).toBe(ACCOUNT_DELETION_MESSAGE);
    // Another account question doesn't count as a deletion request.
    await createSupportRequest(t.ctx, customer, { topic: "account", message: "How do I change my display name?" });

    const again = await requestAccountDeletion(t.ctx, customer, { details: "Still want this." });
    expect(again).toEqual({ supportRequestId: first.supportRequestId, alreadyRequested: true });
    expect(rows<{ n: number }>("SELECT count(*) AS n FROM support_requests")[0].n).toBe(2);

    t.sqlite
      .prepare("UPDATE support_requests SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution_note = 'Done.' WHERE id = ?")
      .run(admin.id, t.ctx.now.toISOString(), first.supportRequestId);
    const later = await requestAccountDeletion(t.ctx, customer);
    expect(later.alreadyRequested).toBe(false);
    expect(later.supportRequestId).not.toBe(first.supportRequestId);
  });

  it("is open to mechanics too, not to admins, and limits the details to 1,000 characters", async () => {
    expect((await requestAccountDeletion(t.ctx, mechanic)).alreadyRequested).toBe(false);
    expect(rows("SELECT role, topic FROM support_requests")).toEqual([{ role: "mechanic", topic: "account" }]);

    expect((await rejection(requestAccountDeletion(t.ctx, admin))).code).toBe("forbidden");
    const tooLong = await rejection(requestAccountDeletion(t.ctx, customer, { details: "x".repeat(1001) }));
    expect(tooLong.code).toBe("invalid_input");
    expect(fieldErrorsOf(tooLong)).toEqual({ details: ["Keep this to 1,000 characters or fewer."] });
    expect(rows<{ n: number }>("SELECT count(*) AS n FROM support_requests WHERE user_id = ?", customer.id)[0].n).toBe(0);
  });
});
