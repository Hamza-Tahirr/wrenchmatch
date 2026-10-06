import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addHours } from "@/server/clock";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { runMatching, type MatchingMode } from "@/server/matching/run";
import { createTestContext, type TestContext } from "../support/db";
import {
  createMechanic,
  createOpenRequest,
  createSubmittedQuote,
  createUser,
  TEST_ZIPS,
  type TestMechanic,
  type TestZipCode,
} from "../support/factories";

// Requests default to ZIP 85004 (Phoenix): a diagnostic visit for a 2016 Toyota Camry on
// Wednesday 7 Oct 2026, morning, mobile or garage, garage distance 15 mi. ctx.now is Monday
// 5 Oct 2026, 10:00 in Phoenix. Mechanics default to approved, insured, "both", 25 mi.
// Approximate distances from 85004: Tempe 85281 8.0, Glendale 85301 8.41, Scottsdale 85251
// 9.09, Mesa 85201 12.79, Chandler 85224 14.53, Flagstaff 86001 122.05.

let t: TestContext;
let customer: Viewer;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer" });
});

afterEach(async () => {
  await t.cleanup();
});

function run(requestId: string, mode: MatchingMode, now: Date = t.ctx.now) {
  return writeTx(t.ctx.db, (trx) => runMatching(trx, { requestId, now, mode }));
}

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

const milesFrom85004 = (zip: TestZipCode) => roundMiles(haversineMiles(TEST_ZIPS["85004"], TEST_ZIPS[zip]));

type Evaluation = {
  eligible: boolean;
  notified: boolean;
  distanceMiles: number | null;
  reasons: string[];
  evaluatedAt: string;
};

function evaluationsOf(requestId: string): Map<string, Evaluation> {
  const found = rows<{
    mechanic_id: string;
    eligible: number;
    notified: number;
    distance_miles: number | null;
    reasons_json: string;
    evaluated_at: string;
  }>(
    "SELECT mechanic_id, eligible, notified, distance_miles, reasons_json, evaluated_at FROM match_evaluations WHERE request_id = ?",
    requestId,
  );
  return new Map(
    found.map((row) => [
      row.mechanic_id,
      {
        eligible: row.eligible === 1,
        notified: row.notified === 1,
        distanceMiles: row.distance_miles,
        reasons: JSON.parse(row.reasons_json) as string[],
        evaluatedAt: row.evaluated_at,
      },
    ]),
  );
}

type JobMatchRow = {
  id: string;
  mechanic_id: string;
  rank: number;
  status: string;
  distance_miles: number;
  notified_at: string;
};

const jobMatchesOf = (requestId: string) =>
  rows<JobMatchRow>(
    "SELECT id, mechanic_id, rank, status, distance_miles, notified_at FROM job_matches WHERE request_id = ? ORDER BY rank",
    requestId,
  );

const matchedCountOf = (requestId: string) =>
  rows<{ matched_count: number }>("SELECT matched_count FROM repair_requests WHERE id = ?", requestId)[0]
    .matched_count;

type NotificationRow = { user_id: string; type: string; title: string; body: string; link_path: string; created_at: string };
const notifications = () =>
  rows<NotificationRow>("SELECT user_id, type, title, body, link_path, created_at FROM notifications ORDER BY created_at, user_id");

type EmailRow = { to_user_id: string; to_email: string; subject: string; body_text: string; template: string };
const emails = () => rows<EmailRow>("SELECT to_user_id, to_email, subject, body_text, template FROM email_outbox");

const sortedIds = (...people: { id: string }[]) => people.map((person) => person.id).sort();

async function approve(mechanic: TestMechanic) {
  await t.ctx.db
    .updateTable("mechanic_profiles")
    .set({ status: "approved", approved_at: t.ctx.now.toISOString() })
    .where("user_id", "=", mechanic.id)
    .execute();
}

describe("runMatching: initial run", () => {
  it("notifies the closest eligible mechanics and records why the others were left out", async () => {
    const phoenix = await createMechanic(t.ctx, { baseZip: "85004", makes: ["Honda", "Toyota"] });
    const tempe = await createMechanic(t.ctx, { baseZip: "85281" });
    const mesa = await createMechanic(t.ctx, { baseZip: "85201" });
    const flagstaff = await createMechanic(t.ctx, { baseZip: "86001" });
    const applicant = await createMechanic(t.ctx, { baseZip: "85251", status: "under_review" });
    const suspended = await createMechanic(t.ctx, { baseZip: "85301", status: "suspended" });
    const lapsed = await createMechanic(t.ctx, { baseZip: "85224", insuranceExpiresOn: "2026-10-04" });
    const hondaOnly = await createMechanic(t.ctx, { baseZip: "85004", makes: ["Honda"] });
    const request = await createOpenRequest(t.ctx, customer);
    const nowIso = t.ctx.now.toISOString();

    const result = await run(request.id, "initial");

    expect(result).toEqual({
      evaluatedCount: 8,
      eligibleCount: 3,
      notifiedCount: 3,
      newlyNotifiedMechanicIds: [phoenix.id, tempe.id, mesa.id],
    });

    expect(jobMatchesOf(request.id)).toEqual([
      { id: expect.any(String), mechanic_id: phoenix.id, rank: 1, status: "notified", distance_miles: 0, notified_at: nowIso },
      { id: expect.any(String), mechanic_id: tempe.id, rank: 2, status: "notified", distance_miles: milesFrom85004("85281"), notified_at: nowIso },
      { id: expect.any(String), mechanic_id: mesa.id, rank: 3, status: "notified", distance_miles: milesFrom85004("85201"), notified_at: nowIso },
    ]);
    expect(matchedCountOf(request.id)).toBe(3);

    const evaluations = evaluationsOf(request.id);
    expect(evaluations.size).toBe(8);
    const expectEvaluation = (mechanic: TestMechanic, zip: TestZipCode, expected: { notified?: boolean; reasons: string[] }) =>
      expect(evaluations.get(mechanic.id), mechanic.baseZip).toEqual({
        eligible: expected.reasons.length === 0,
        notified: expected.notified ?? false,
        distanceMiles: milesFrom85004(zip),
        reasons: expected.reasons,
        evaluatedAt: nowIso,
      });
    expectEvaluation(phoenix, "85004", { notified: true, reasons: [] });
    expectEvaluation(tempe, "85281", { notified: true, reasons: [] });
    expectEvaluation(mesa, "85201", { notified: true, reasons: [] });
    expectEvaluation(flagstaff, "86001", { reasons: ["out_of_range"] });
    expectEvaluation(applicant, "85251", { reasons: ["status_not_approved"] });
    expectEvaluation(suspended, "85301", { reasons: ["suspended"] });
    expectEvaluation(lapsed, "85224", { reasons: ["insurance_expired"] });
    expectEvaluation(hondaOnly, "85004", { reasons: ["make_not_supported"] });
  });

  it("notifies only the matched mechanics, without the customer's contact details", async () => {
    const phoenix = await createMechanic(t.ctx, { baseZip: "85004", displayName: "Pat Phoenix" });
    const tempe = await createMechanic(t.ctx, { baseZip: "85281" });
    await createMechanic(t.ctx, { baseZip: "85251", status: "under_review" });
    await createMechanic(t.ctx, { baseZip: "86001" });
    const request = await createOpenRequest(t.ctx, customer, {
      contactPhone: "602-555-0199",
      streetAddress: "123 Test Street",
    });

    await run(request.id, "initial");

    const sent = notifications();
    expect(sent.map((row) => row.user_id).sort()).toEqual(sortedIds(phoenix, tempe));
    for (const row of sent) {
      expect(row).toMatchObject({
        type: "job_matched",
        title: "New repair request near Phoenix, AZ",
        link_path: `/mechanic/jobs/${request.id}`,
        created_at: t.ctx.now.toISOString(),
      });
      expect(row.body).toContain("Diagnostic visit for a 2016 Toyota Camry");
      expect(row.body).toContain("Wed, Oct 7, 2026, morning (8 AM–12 PM)");
    }

    const mail = emails();
    expect(mail.map((row) => row.to_user_id).sort()).toEqual(sortedIds(phoenix, tempe));
    for (const row of mail) {
      expect(row).toMatchObject({ subject: "New repair request near Phoenix, AZ", template: "job_matched" });
      expect(row.body_text).toContain("Job: Diagnostic visit");
      expect(row.body_text).toContain("Vehicle: 2016 Toyota Camry");
      expect(row.body_text).toContain(`/mechanic/jobs/${request.id}`);
    }
    expect(mail.find((row) => row.to_user_id === phoenix.id)).toMatchObject({ to_email: phoenix.email });
    expect(mail.find((row) => row.to_user_id === phoenix.id)?.body_text).toMatch(/^Hi Pat Phoenix,/);

    const everything = [...sent.flatMap((row) => [row.title, row.body]), ...mail.flatMap((row) => [row.subject, row.body_text])];
    for (const text of everything) {
      expect(text).not.toContain(customer.email);
      expect(text).not.toContain("602-555-0199");
      expect(text).not.toContain("123 Test Street");
    }
  });

  it(`notifies at most ${MAX_MECHANICS_NOTIFIED} mechanics, closest first`, async () => {
    const phoenixA = await createMechanic(t.ctx, { baseZip: "85004" });
    const phoenixB = await createMechanic(t.ctx, { baseZip: "85004" });
    const chandler = await createMechanic(t.ctx, { baseZip: "85224" });
    const scottsdale = await createMechanic(t.ctx, { baseZip: "85251" });
    const mesa = await createMechanic(t.ctx, { baseZip: "85201" });
    const tempe = await createMechanic(t.ctx, { baseZip: "85281" });
    const glendale = await createMechanic(t.ctx, { baseZip: "85301" });
    const request = await createOpenRequest(t.ctx, customer);

    const result = await run(request.id, "initial");

    // Equal distances are ordered by id.
    const expected = [...sortedIds(phoenixA, phoenixB), tempe.id, glendale.id, scottsdale.id];
    expect(result).toEqual({
      evaluatedCount: 7,
      eligibleCount: 7,
      notifiedCount: 5,
      newlyNotifiedMechanicIds: expected,
    });
    expect(jobMatchesOf(request.id).map((row) => [row.rank, row.mechanic_id])).toEqual(
      expected.map((id, index) => [index + 1, id]),
    );
    expect(matchedCountOf(request.id)).toBe(5);

    const evaluations = evaluationsOf(request.id);
    for (const leftOut of [mesa, chandler]) {
      expect(evaluations.get(leftOut.id)).toMatchObject({ eligible: true, notified: false, reasons: [] });
    }
    expect(notifications().map((row) => row.user_id).sort()).toEqual([...expected].sort());
    expect(emails()).toHaveLength(5);
  });

  it("records a request nobody can take as zero matches, with the reasons", async () => {
    const notSafetyApproved = await createMechanic(t.ctx, {
      baseZip: "85004",
      categories: [{ id: "brake_work", safetyApproved: false }],
    });
    const noBrakes = await createMechanic(t.ctx, { baseZip: "85281" });
    const tooFar = await createMechanic(t.ctx, {
      baseZip: "86001",
      categories: [{ id: "brake_work", safetyApproved: true }],
    });
    const paused = await createMechanic(t.ctx, {
      baseZip: "85004",
      categories: [{ id: "brake_work", safetyApproved: true }],
      acceptingJobs: false,
      availability: [],
    });
    const noProvider = await createMechanic(t.ctx, {
      baseZip: "85004",
      categories: [{ id: "brake_work", safetyApproved: true }],
      insuranceProvider: null,
    });
    // A stale count is replaced by the actual number notified.
    const request = await createOpenRequest(t.ctx, customer, { categoryId: "brake_work", matchedCount: 2 });

    const result = await run(request.id, "initial");

    expect(result).toEqual({ evaluatedCount: 5, eligibleCount: 0, notifiedCount: 0, newlyNotifiedMechanicIds: [] });
    expect(matchedCountOf(request.id)).toBe(0);
    expect(jobMatchesOf(request.id)).toEqual([]);
    expect(notifications()).toEqual([]);
    expect(emails()).toEqual([]);

    const evaluations = evaluationsOf(request.id);
    expect(evaluations.get(notSafetyApproved.id)?.reasons).toEqual(["safety_category_not_approved"]);
    expect(evaluations.get(noBrakes.id)?.reasons).toEqual(["category_not_offered"]);
    expect(evaluations.get(tooFar.id)?.reasons).toEqual(["out_of_range"]);
    expect(evaluations.get(paused.id)?.reasons).toEqual(["not_accepting_jobs", "no_availability"]);
    expect(evaluations.get(noProvider.id)?.reasons).toEqual(["insurance_missing"]);
    for (const evaluation of evaluations.values()) {
      expect(evaluation).toMatchObject({ eligible: false, notified: false });
    }
  });

  it("refuses to run twice for the same request", async () => {
    await createMechanic(t.ctx, { baseZip: "85004" });
    const request = await createOpenRequest(t.ctx, customer);
    await run(request.id, "initial");

    const second = run(request.id, "initial", addHours(t.ctx.now, 1));
    await expect(second).rejects.toBeInstanceOf(DomainError);
    await expect(second).rejects.toMatchObject({ code: "conflict" });
    expect(jobMatchesOf(request.id)).toHaveLength(1);
    expect(notifications()).toHaveLength(1);
    expect(emails()).toHaveLength(1);
  });

  it("judges insurance by today's date in the request's time zone", async () => {
    // 03:00 UTC on 6 Oct is still 5 Oct (20:00) in Phoenix.
    const lateEvening = new Date("2026-10-06T03:00:00.000Z");
    const expiresToday = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-05" });
    const expiredYesterday = await createMechanic(t.ctx, { insuranceExpiresOn: "2026-10-04" });
    const request = await createOpenRequest(t.ctx, customer, { preferredDate: "2026-10-05", preferredWindow: "evening" });

    const result = await run(request.id, "initial", lateEvening);

    expect(result.newlyNotifiedMechanicIds).toEqual([expiresToday.id]);
    expect(evaluationsOf(request.id).get(expiredYesterday.id)?.reasons).toEqual(["insurance_expired"]);
  });
});

describe("runMatching: rematch", () => {
  it("adds only a mechanic approved since the first run", async () => {
    const phoenix = await createMechanic(t.ctx, { baseZip: "85004" });
    const pending = await createMechanic(t.ctx, { baseZip: "85281", status: "under_review" });
    const request = await createOpenRequest(t.ctx, customer);
    await run(request.id, "initial");
    const [firstMatch] = jobMatchesOf(request.id);
    expect(evaluationsOf(request.id).get(pending.id)?.reasons).toEqual(["status_not_approved"]);

    // The first mechanic quotes (request -> quoted), then an admin approves the second.
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: phoenix.id });
    await approve(pending);
    const later = addHours(t.ctx.now, 2);
    const result = await run(request.id, "rematch", later);

    expect(result).toEqual({
      evaluatedCount: 2,
      eligibleCount: 2,
      notifiedCount: 2,
      newlyNotifiedMechanicIds: [pending.id],
    });
    expect(jobMatchesOf(request.id)).toEqual([
      firstMatch,
      {
        id: expect.any(String),
        mechanic_id: pending.id,
        rank: 2,
        status: "notified",
        distance_miles: milesFrom85004("85281"),
        notified_at: later.toISOString(),
      },
    ]);
    expect(matchedCountOf(request.id)).toBe(2);

    const evaluations = evaluationsOf(request.id);
    for (const mechanic of [phoenix, pending]) {
      expect(evaluations.get(mechanic.id)).toMatchObject({
        eligible: true,
        notified: true,
        reasons: [],
        evaluatedAt: later.toISOString(),
      });
    }
    // One notification each: the first mechanic is not notified again.
    expect(notifications().map((row) => [row.user_id, row.created_at])).toEqual([
      [phoenix.id, t.ctx.now.toISOString()],
      [pending.id, later.toISOString()],
    ]);
    expect(emails().map((row) => row.to_user_id).sort()).toEqual(sortedIds(phoenix, pending));
  });

  it(`adds nobody once ${MAX_MECHANICS_NOTIFIED} mechanics have been notified`, async () => {
    const zips: TestZipCode[] = ["85004", "85281", "85301", "85251", "85201"];
    for (const baseZip of zips) await createMechanic(t.ctx, { baseZip });
    const closest = await createMechanic(t.ctx, { baseZip: "85004", status: "under_review" });
    const request = await createOpenRequest(t.ctx, customer);
    await run(request.id, "initial");
    await approve(closest);

    const result = await run(request.id, "rematch", addHours(t.ctx.now, 1));

    expect(result).toEqual({ evaluatedCount: 6, eligibleCount: 6, notifiedCount: 5, newlyNotifiedMechanicIds: [] });
    expect(jobMatchesOf(request.id).map((row) => row.mechanic_id)).not.toContain(closest.id);
    expect(evaluationsOf(request.id).get(closest.id)).toMatchObject({ eligible: true, notified: false });
    expect(matchedCountOf(request.id)).toBe(5);
    expect(notifications()).toHaveLength(5);
  });

  it("keeps the match of a mechanic who is no longer eligible but never notifies an ineligible one", async () => {
    const phoenix = await createMechanic(t.ctx, { baseZip: "85004" });
    const tempe = await createMechanic(t.ctx, { baseZip: "85281" });
    const pending = await createMechanic(t.ctx, { baseZip: "85251", status: "under_review" });
    const stillPending = await createMechanic(t.ctx, { baseZip: "85004", status: "applied" });
    const request = await createOpenRequest(t.ctx, customer);
    await run(request.id, "initial");

    await t.ctx.db
      .updateTable("mechanic_profiles")
      .set({ status: "suspended", status_reason: "Paused pending a complaint review" })
      .where("user_id", "=", phoenix.id)
      .execute();
    await approve(pending);
    const result = await run(request.id, "rematch", addHours(t.ctx.now, 1));

    expect(result).toEqual({
      evaluatedCount: 4,
      eligibleCount: 2,
      notifiedCount: 3,
      newlyNotifiedMechanicIds: [pending.id],
    });
    expect(jobMatchesOf(request.id).map((row) => [row.rank, row.mechanic_id])).toEqual([
      [1, phoenix.id],
      [2, tempe.id],
      [3, pending.id],
    ]);
    expect(matchedCountOf(request.id)).toBe(3);

    const evaluations = evaluationsOf(request.id);
    // The schema allows notified only for eligible rows; job_matches keeps the history.
    expect(evaluations.get(phoenix.id)).toMatchObject({ eligible: false, notified: false, reasons: ["suspended"] });
    expect(evaluations.get(tempe.id)).toMatchObject({ eligible: true, notified: true });
    expect(evaluations.get(pending.id)).toMatchObject({ eligible: true, notified: true });
    expect(evaluations.get(stillPending.id)).toMatchObject({ eligible: false, notified: false });
    expect(notifications().map((row) => row.user_id).sort()).toEqual(sortedIds(phoenix, tempe, pending));
  });

  it("brings a zero-match request its first mechanic once one is approved", async () => {
    const pending = await createMechanic(t.ctx, { baseZip: "85201", status: "under_review" });
    const request = await createOpenRequest(t.ctx, customer);
    expect((await run(request.id, "initial")).notifiedCount).toBe(0);

    await approve(pending);
    const result = await run(request.id, "rematch", addHours(t.ctx.now, 1));

    expect(result.newlyNotifiedMechanicIds).toEqual([pending.id]);
    expect(jobMatchesOf(request.id).map((row) => [row.rank, row.mechanic_id])).toEqual([[1, pending.id]]);
    expect(matchedCountOf(request.id)).toBe(1);
  });
});

describe("runMatching: requests that cannot be matched", () => {
  it("reports an unknown request as not found", async () => {
    await expect(run("00000000-0000-4000-8000-000000000000", "initial")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a cancelled request", async () => {
    await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await t.ctx.db.updateTable("repair_requests").set({ status: "cancelled" }).where("id", "=", request.id).execute();

    for (const mode of ["initial", "rematch"] as const) {
      await expect(run(request.id, mode), mode).rejects.toMatchObject({ code: "conflict" });
    }
    expect(notifications()).toEqual([]);
  });

  it("refuses a request whose seven days have run out", async () => {
    await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    const expired = new Date(request.expiresAt);

    await expect(run(request.id, "rematch", expired)).rejects.toMatchObject({ code: "conflict" });
    await expect(run(request.id, "initial", expired)).rejects.toMatchObject({ code: "conflict" });
    expect(jobMatchesOf(request.id)).toEqual([]);
  });

  it("refuses an initial run once quotes have arrived", async () => {
    const mechanic = await createMechanic(t.ctx);
    const request = await createOpenRequest(t.ctx, customer);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });

    await expect(run(request.id, "initial")).rejects.toMatchObject({ code: "conflict" });
  });
});
