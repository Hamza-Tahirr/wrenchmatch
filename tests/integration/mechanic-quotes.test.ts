// submitQuote / withdrawQuote (src/server/mechanic/quotes.ts): server-side totals, slot rules
// in the request's time zone, eligibility, slot conflicts, expiry, rate limit and withdrawal.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { JobMatchStatus } from "@/lib/domain";
import { parseQuoteForm, type QuoteFormValues } from "@/lib/validation/quote";
import { bucketKey } from "@/server/auth/rate-limit";
import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { quoteLines, SLOT_CONFLICT_MESSAGE, submitQuote, withdrawQuote, type SubmitQuoteInput } from "@/server/mechanic/quotes";
import { domainFieldErrors } from "@/server/mechanic/shared";
import { computeQuoteTotals, type QuoteItemKind } from "@/server/pricing";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type TestMechanic,
  type TestRequest,
} from "../support/factories";

// ctx.now: Monday 5 Oct 2026, 10:00 in Phoenix (17:00 UTC). Requests default to ZIP 85004
// (America/Phoenix, UTC-7), preferred Wednesday 7 Oct, morning, mobile or garage, and expire
// on Monday 12 Oct at 17:00 UTC.

let t: TestContext;
let customer: Viewer;
let mechanic: TestMechanic;
let request: TestRequest;

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

async function match(requestId: string, who: { id: string }, status: JobMatchStatus = "notified") {
  await t.ctx.db
    .insertInto("job_matches")
    .values({
      id: newId(),
      request_id: requestId,
      mechanic_id: who.id,
      distance_miles: 0,
      rank: 1,
      status,
      notified_at: t.ctx.now.toISOString(),
    })
    .execute();
}

function formValues(overrides: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    laborPrice: "120",
    partsIncluded: "yes",
    parts: [{ description: "AGM battery, group 35", quantity: "1", unitPrice: "189.99" }],
    taxes: [{ description: "Sales tax on parts (8.6%)", amount: "16.34" }],
    fees: [{ description: "Disposal fee", amount: "5" }],
    earliestStart: "2026-10-07T09:00",
    durationMinutes: "90",
    serviceMode: "mobile",
    scope: "Test the battery and charging system, then replace the battery.",
    exclusions: "Alternator repair.",
    notes: "Please have the key fob ready.",
    validityHours: "24",
    ...overrides,
  };
}

function input(requestId: string, overrides: Partial<QuoteFormValues> = {}): SubmitQuoteInput {
  const parsed = parseQuoteForm(formValues(overrides));
  if (!parsed.ok) throw new Error(`invalid test quote: ${JSON.stringify(parsed.fieldErrors)}`);
  return { requestId, ...parsed.data };
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

const quoteCount = () => rows("SELECT id FROM quotes").length;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R.", legalName: "Marco Rossi", phone: "602-555-0142" });
  request = await createOpenRequest(t.ctx, customer);
  await match(request.id, mechanic);
});

afterEach(async () => {
  await t.cleanup();
});

describe("submitQuote", () => {
  it("prices the quote on the server from its items and stores it exactly", async () => {
    const quoteInput = input(request.id);
    const result = await submitQuote(t.ctx, mechanic, quoteInput);
    const expectedTotals = { laborCents: 12_000, partsCents: 18_999, taxCents: 1_634, feeCents: 500, totalCents: 33_133 };
    expect(result.totals).toEqual(expectedTotals);
    expect(result.totals).toEqual(computeQuoteTotals(quoteLines(quoteInput)));
    expect(result).toMatchObject({
      requestId: request.id,
      slotStartAt: "2026-10-07T16:00:00.000Z",
      slotEndAt: "2026-10-07T17:30:00.000Z",
      expiresAt: "2026-10-06T17:00:00.000Z",
    });

    const [row] = rows<Record<string, unknown>>("SELECT * FROM quotes WHERE id = ?", result.quoteId);
    expect(row).toMatchObject({
      request_id: request.id,
      mechanic_id: mechanic.id,
      status: "submitted",
      service_mode: "mobile",
      parts_included: 1,
      currency: "USD",
      labor_cents: 12_000,
      parts_cents: 18_999,
      tax_cents: 1_634,
      fee_cents: 500,
      total_cents: 33_133,
      slot_start_at: "2026-10-07T16:00:00.000Z",
      slot_end_at: "2026-10-07T17:30:00.000Z",
      estimated_duration_minutes: 90,
      scope: "Test the battery and charging system, then replace the battery.",
      exclusions: "Alternator repair.",
      notes: "Please have the key fob ready.",
      expires_at: "2026-10-06T17:00:00.000Z",
      is_demo_fixture: 0,
    });
    const items = rows<{ kind: QuoteItemKind; description: string; quantity: number; unit_price_cents: number; amount_cents: number; sort_order: number }>(
      "SELECT kind, description, quantity, unit_price_cents, amount_cents, sort_order FROM quote_items WHERE quote_id = ? ORDER BY sort_order",
      result.quoteId,
    );
    expect(items).toEqual([
      { kind: "labor", description: "Labor", quantity: 1, unit_price_cents: 12_000, amount_cents: 12_000, sort_order: 0 },
      { kind: "part", description: "AGM battery, group 35", quantity: 1, unit_price_cents: 18_999, amount_cents: 18_999, sort_order: 1 },
      { kind: "tax", description: "Sales tax on parts (8.6%)", quantity: 1, unit_price_cents: 1_634, amount_cents: 1_634, sort_order: 2 },
      { kind: "fee", description: "Disposal fee", quantity: 1, unit_price_cents: 500, amount_cents: 500, sort_order: 3 },
    ]);
    expect(
      computeQuoteTotals(items.map((item) => ({ kind: item.kind, quantity: item.quantity, unitPriceCents: item.unit_price_cents }))),
    ).toEqual(expectedTotals);

    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "quoted" }]);
    expect(rows("SELECT status FROM job_matches WHERE request_id = ?", request.id)).toEqual([{ status: "quoted" }]);
    expect(rows("SELECT attempt_count FROM rate_limits WHERE bucket_key = ?", bucketKey("quote_submit", mechanic.id))).toEqual([
      { attempt_count: 1 },
    ]);

    const [note] = rows<{ user_id: string; type: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, type, title, body, link_path FROM notifications WHERE type = 'quote.received'",
    );
    expect(note).toMatchObject({
      user_id: customer.id,
      title: "New quote for your 2016 Toyota Camry",
      link_path: `/requests/${request.id}`,
    });
    expect(note.body).toContain("Marco R. quoted $331.33 for Diagnostic visit");
    expect(note.body).toContain("Wed, Oct 7, 9:00 AM MST");
    const [email] = rows<{ to_user_id: string; body_text: string; template: string }>(
      "SELECT to_user_id, body_text, template FROM email_outbox",
    );
    expect(email).toMatchObject({ to_user_id: customer.id, template: "quote_received" });
    for (const text of [note.body, email.body_text]) {
      for (const secret of ["602-555-0142", mechanic.email, "Marco Rossi", "Test Garage Way"]) expect(text).not.toContain(secret);
    }

    const [audit] = rows<{ action: string; entity_id: string; metadata_json: string }>(
      "SELECT action, entity_id, metadata_json FROM audit_events",
    );
    expect(audit).toMatchObject({ action: "quote.submit", entity_id: result.quoteId });
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ requestId: request.id, totalCents: 33_133, validityHours: 24 });
  });

  it("never lets a quote outlive its offered start or its request", async () => {
    const long = await submitQuote(t.ctx, mechanic, input(request.id, { validityHours: "168" }));
    expect(long.expiresAt).toBe(long.slotStartAt);

    const shortLived = await createOpenRequest(t.ctx, customer, { expiresAt: new Date("2026-10-06T23:00:00.000Z") });
    await match(shortLived.id, mechanic);
    const capped = await submitQuote(
      t.ctx,
      mechanic,
      input(shortLived.id, { earliestStart: "2026-10-08T09:00", validityHours: "72" }),
    );
    expect(capped.expiresAt).toBe("2026-10-06T23:00:00.000Z");
  });

  it("is not_found on a request the mechanic was not matched to, and counts nothing", async () => {
    const unmatched = await createOpenRequest(t.ctx, customer);
    await expectDomainError(submitQuote(t.ctx, mechanic, input(unmatched.id)), "not_found");
    await expectDomainError(submitQuote(t.ctx, mechanic, input(newId())), "not_found");
    expect(quoteCount()).toBe(0);
    expect(rows("SELECT * FROM rate_limits")).toEqual([]);
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", unmatched.id)).toEqual([{ status: "open" }]);
  });

  it("refuses an overlapping slot in another active quote or booking", async () => {
    const second = await createOpenRequest(t.ctx, customer);
    const third = await createOpenRequest(t.ctx, customer);
    await match(second.id, mechanic);
    await match(third.id, mechanic);
    await submitQuote(t.ctx, mechanic, input(request.id));

    const error = await expectDomainError(
      submitQuote(t.ctx, mechanic, input(second.id, { earliestStart: "2026-10-07T10:00" })),
      "slot_conflict",
    );
    expect(error.userMessage.startsWith(SLOT_CONFLICT_MESSAGE)).toBe(true);
    expect(error.details?.fieldErrors).toEqual({ earliestStart: [error.userMessage] });
    expect(domainFieldErrors(error)).toEqual({ earliestStart: [error.userMessage] });
    expect(domainFieldErrors(new Error("boom"))).toBeUndefined();
    expect(domainFieldErrors(new DomainError("conflict", "No fields."))).toBeUndefined();

    // Back to back (9:00-10:30, then 10:30) is fine.
    await submitQuote(t.ctx, mechanic, input(second.id, { earliestStart: "2026-10-07T10:30" }));

    // A pending reservation holds its slot too.
    const reserved = await createOpenRequest(t.ctx, customer);
    const reservedQuote = await createSubmittedQuote(t.ctx, {
      requestId: reserved.id,
      mechanicId: mechanic.id,
      slotStart: new Date("2026-10-09T16:00:00.000Z"),
    });
    await createPendingBooking(t.ctx, { quote: reservedQuote, customer });
    await expectDomainError(
      submitQuote(t.ctx, mechanic, input(third.id, { earliestStart: "2026-10-09T09:30" })),
      "slot_conflict",
    );
    expect(rows("SELECT id FROM quotes WHERE request_id = ?", third.id)).toEqual([]);
  });

  it("frees the slot of a quote that has expired", async () => {
    const other = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, {
      requestId: other.id,
      mechanicId: mechanic.id,
      slotStart: new Date("2026-10-07T16:00:00.000Z"),
      expiresAt: new Date("2026-10-05T16:00:00.000Z"),
    });
    await submitQuote(t.ctx, mechanic, input(request.id));
    expect(rows("SELECT status FROM quotes WHERE request_id = ?", other.id)).toEqual([{ status: "expired" }]);
  });

  it("refuses expired, cancelled and reserved requests", async () => {
    const expired = await createOpenRequest(t.ctx, customer, {
      submittedAt: new Date("2026-09-27T17:00:00.000Z"),
      expiresAt: new Date("2026-10-04T17:00:00.000Z"),
    });
    const cancelled = await createOpenRequest(t.ctx, customer);
    t.sqlite.prepare("UPDATE repair_requests SET status = 'cancelled' WHERE id = ?").run(cancelled.id);
    const rival = await createMechanic(t.ctx);
    const reserved = await createOpenRequest(t.ctx, customer);
    const rivalQuote = await createSubmittedQuote(t.ctx, { requestId: reserved.id, mechanicId: rival.id });
    await createPendingBooking(t.ctx, { quote: rivalQuote, customer });

    for (const closed of [expired, cancelled, reserved]) {
      await match(closed.id, mechanic);
      const error = await expectDomainError(submitQuote(t.ctx, mechanic, input(closed.id)), "conflict");
      expect(error.userMessage).toMatch(/no longer accepting quotes/);
    }
    expect(rows("SELECT id FROM quotes WHERE mechanic_id = ?", mechanic.id)).toEqual([]);
  });

  it("enforces the quote-submission rate limit inside the transaction", async () => {
    t.sqlite
      .prepare("INSERT INTO rate_limits (bucket_key, window_started_at, attempt_count) VALUES (?, ?, 30)")
      .run(bucketKey("quote_submit", mechanic.id), "2026-10-05T16:50:00.000Z");
    const error = await expectDomainError(submitQuote(t.ctx, mechanic, input(request.id)), "rate_limited");
    expect(error.userMessage).toMatch(/up to 30 quotes an hour/);
    expect(quoteCount()).toBe(0);

    // A new window starts an hour after the first counted attempt.
    await submitQuote(withNow(t.ctx, "2026-10-05T17:51:00.000Z"), mechanic, input(request.id));
    expect(quoteCount()).toBe(1);
  });

  it("reads the offered time in the request's time zone and applies the 1-hour and 30-day rules", async () => {
    let error = await expectDomainError(
      submitQuote(t.ctx, mechanic, input(request.id, { earliestStart: "2026-10-05T10:59" })),
      "invalid_input",
    );
    expect((error.details?.fieldErrors as Record<string, string[]>).earliestStart[0]).toMatch(
      /at least 1 hour from now: Mon, Oct 5, 11:00 AM MST or later/,
    );
    error = await expectDomainError(
      submitQuote(t.ctx, mechanic, input(request.id, { earliestStart: "2026-11-04T10:01" })),
      "invalid_input",
    );
    expect((error.details?.fieldErrors as Record<string, string[]>).earliestStart[0]).toMatch(/within the next 30 days/);

    const boundary = await submitQuote(t.ctx, mechanic, input(request.id, { earliestStart: "2026-10-05T11:00", validityHours: "24" }));
    expect(boundary).toMatchObject({ slotStartAt: "2026-10-05T18:00:00.000Z", expiresAt: "2026-10-05T18:00:00.000Z" });

    // New York observes DST: 2:30 AM on 14 Mar 2027 does not exist there.
    const newYorker = await createMechanic(t.ctx, { baseZip: "10001" });
    const nyRequest = await createOpenRequest(t.ctx, customer, { zip: "10001" });
    await match(nyRequest.id, newYorker);
    error = await expectDomainError(
      submitQuote(t.ctx, newYorker, input(nyRequest.id, { earliestStart: "2027-03-14T02:30" })),
      "invalid_input",
    );
    expect(error.userMessage).toMatch(/doesn't exist in the job's time zone/);
    const ny = await submitQuote(t.ctx, newYorker, input(nyRequest.id, { earliestStart: "2026-10-07T09:00" }));
    expect(ny.slotStartAt).toBe("2026-10-07T13:00:00.000Z");
  });

  it("accepts only a service mode the request, the mechanic and the distance allow", async () => {
    const mobileOnly = await createOpenRequest(t.ctx, customer, { serviceMode: "mobile" });
    await match(mobileOnly.id, mechanic);
    const error = await expectDomainError(
      submitQuote(t.ctx, mechanic, input(mobileOnly.id, { serviceMode: "garage" })),
      "invalid_input",
    );
    expect(error.details?.fieldErrors).toEqual({ serviceMode: ["For this job you can quote mobile service only."] });
    await submitQuote(t.ctx, mechanic, input(mobileOnly.id, { serviceMode: "mobile" }));
  });

  it("requires an approved mechanic who accepts jobs, is insured for the job and approved for safety work", async () => {
    const lapsing = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-06" });
    const coversPreferredOnly = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-08" });
    const paused = await createMechanic(t.ctx, { acceptingJobs: false });
    const suspended = await createMechanic(t.ctx, { status: "suspended" });
    for (const who of [lapsing, coversPreferredOnly, paused, suspended]) await match(request.id, who);

    expect((await expectDomainError(submitQuote(t.ctx, lapsing, input(request.id)), "mechanic_not_eligible")).userMessage).toMatch(
      /insurance expires on Oct 6, 2026/,
    );
    await expectDomainError(
      submitQuote(t.ctx, coversPreferredOnly, input(request.id, { earliestStart: "2026-10-09T09:00" })),
      "mechanic_not_eligible",
    );
    await submitQuote(t.ctx, coversPreferredOnly, input(request.id, { earliestStart: "2026-10-08T09:00" }));
    expect((await expectDomainError(submitQuote(t.ctx, paused, input(request.id)), "mechanic_not_eligible")).details).toEqual({
      reason: "not_accepting",
    });
    expect((await expectDomainError(submitQuote(t.ctx, suspended, input(request.id)), "mechanic_not_eligible")).details).toEqual({
      reason: "suspended",
    });

    const brakes = await createOpenRequest(t.ctx, customer, { categoryId: "brake_work" });
    const unapproved = await createMechanic(t.ctx, { categories: ["brake_work"] });
    const approved = await createMechanic(t.ctx, { categories: [{ id: "brake_work", safetyApproved: true }] });
    await match(brakes.id, unapproved);
    await match(brakes.id, approved);
    expect((await expectDomainError(submitQuote(t.ctx, unapproved, input(brakes.id)), "mechanic_not_eligible")).details).toEqual({
      reason: "safety_category_not_approved",
    });
    await submitQuote(t.ctx, approved, input(brakes.id));
  });

  it("allows one active quote per job, none after passing, and resists a double click", async () => {
    const [first, second] = await Promise.allSettled([
      submitQuote(t.ctx, mechanic, input(request.id)),
      submitQuote(t.ctx, mechanic, input(request.id)),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(DomainError);
      expect((second.reason as DomainError).code).toBe("conflict");
      expect((second.reason as DomainError).userMessage).toMatch(/already have an active quote/);
    }
    expect(quoteCount()).toBe(1);

    const passedOn = await createOpenRequest(t.ctx, customer);
    await match(passedOn.id, mechanic, "passed");
    expect((await expectDomainError(submitQuote(t.ctx, mechanic, input(passedOn.id)), "conflict")).userMessage).toMatch(/passed/);
  });

  it("re-validates the typed terms and the role", async () => {
    const valid = input(request.id);
    await expectDomainError(submitQuote(t.ctx, mechanic, { ...valid, laborCents: 120.5 }), "invalid_input");
    await expectDomainError(submitQuote(t.ctx, mechanic, { ...valid, partsIncluded: false }), "invalid_input");
    await expectDomainError(submitQuote(t.ctx, mechanic, { ...valid, durationMinutes: 5 }), "invalid_input");
    await expectDomainError(submitQuote(t.ctx, customer, valid), "forbidden");
    expect(quoteCount()).toBe(0);
  });
});

describe("withdrawQuote", () => {
  it("withdraws the mechanic's own submitted quote and reopens the request", async () => {
    const { quoteId } = await submitQuote(t.ctx, mechanic, input(request.id));
    const later = withNow(t.ctx, "2026-10-05T18:00:00.000Z");
    expect(await withdrawQuote(later, mechanic, quoteId)).toEqual({ quoteId, requestId: request.id, requestStatus: "open" });

    expect(rows("SELECT status, withdrawn_at FROM quotes WHERE id = ?", quoteId)).toEqual([
      { status: "withdrawn", withdrawn_at: "2026-10-05T18:00:00.000Z" },
    ]);
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "open" }]);
    expect(rows("SELECT status FROM job_matches WHERE request_id = ?", request.id)).toEqual([{ status: "interested" }]);
    const [note] = rows<{ user_id: string; body: string; link_path: string }>(
      "SELECT user_id, body, link_path FROM notifications WHERE type = 'quote.withdrawn'",
    );
    expect(note).toEqual({
      user_id: customer.id,
      body: "Marco R. withdrew their $331.33 quote for Diagnostic visit. Your request stays open for new quotes until it expires.",
      link_path: `/requests/${request.id}`,
    });
    expect(rows("SELECT action FROM audit_events WHERE entity_id = ? ORDER BY rowid", quoteId)).toEqual([
      { action: "quote.submit" },
      { action: "quote.withdraw" },
    ]);

    // The mechanic may send a new quote afterwards.
    const again = await submitQuote(later, mechanic, input(request.id, { laborPrice: "100" }));
    expect(rows("SELECT id, status FROM quotes ORDER BY created_at, status")).toHaveLength(2);
    expect(rows("SELECT status FROM quotes WHERE id = ?", again.quoteId)).toEqual([{ status: "submitted" }]);
  });

  it("keeps the request quoted while another quote is active", async () => {
    const rival = await createMechanic(t.ctx);
    await match(request.id, rival);
    await submitQuote(t.ctx, rival, input(request.id, { earliestStart: "2026-10-07T13:00" }));
    const { quoteId } = await submitQuote(t.ctx, mechanic, input(request.id));
    expect((await withdrawQuote(t.ctx, mechanic, quoteId)).requestStatus).toBe("quoted");
    expect(rows("SELECT status FROM repair_requests WHERE id = ?", request.id)).toEqual([{ status: "quoted" }]);
    const [note] = rows<{ body: string }>("SELECT body FROM notifications WHERE type = 'quote.withdrawn'");
    expect(note.body).toMatch(/You still have 1 quote to compare\.$/);
  });

  it("only withdraws the mechanic's own quotes that are still submitted", async () => {
    const rival = await createMechanic(t.ctx);
    await match(request.id, rival);
    const rivalQuote = await submitQuote(t.ctx, rival, input(request.id, { earliestStart: "2026-10-07T13:00" }));
    await expectDomainError(withdrawQuote(t.ctx, mechanic, rivalQuote.quoteId), "not_found");
    await expectDomainError(withdrawQuote(t.ctx, mechanic, newId()), "not_found");
    await expectDomainError(withdrawQuote(t.ctx, customer, rivalQuote.quoteId), "forbidden");

    const { quoteId } = await submitQuote(t.ctx, mechanic, input(request.id));
    await withdrawQuote(t.ctx, mechanic, quoteId);
    expect((await expectDomainError(withdrawQuote(t.ctx, mechanic, quoteId), "conflict")).userMessage).toMatch(/already withdrew/);

    // Expired by the clock: nothing to withdraw.
    const second = await createOpenRequest(t.ctx, customer);
    await match(second.id, mechanic);
    const expiring = await submitQuote(t.ctx, mechanic, input(second.id, { earliestStart: "2026-10-08T09:00" }));
    const afterExpiry = withNow(t.ctx, "2026-10-06T17:00:00.000Z");
    expect((await expectDomainError(withdrawQuote(afterExpiry, mechanic, expiring.quoteId), "conflict")).userMessage).toMatch(
      /already expired/,
    );

    // Selected by the customer: can't be withdrawn.
    const third = await createOpenRequest(t.ctx, customer);
    const selected = await createSubmittedQuote(t.ctx, {
      requestId: third.id,
      mechanicId: mechanic.id,
      slotStart: new Date("2026-10-10T16:00:00.000Z"),
    });
    await createPendingBooking(t.ctx, { quote: selected, customer });
    expect((await expectDomainError(withdrawQuote(t.ctx, mechanic, selected.id), "conflict")).userMessage).toMatch(
      /already selected this quote/,
    );
  });
});
