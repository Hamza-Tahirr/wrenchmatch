// The sample-data seed (scripts/seed.ts) on a fresh temp database: the sample accounts, each
// scenario in docs/DEMO_DATA.md, the pictures people "added" (avatars, work galleries, booking
// photos) and the invariants the sample data relies on (only seeded fixtures get past pending
// payment, matched counts are real, images are sanitized, money comes from pricing.ts,
// excluded mechanics are never matched, no "demo" wording in anything people read). Also
// seeded at an awkward time of the week to check that the relative dates hold up whenever
// `npm run db:reset` runs.
import { createHash } from "node:crypto";

import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { BOOKING_CONSENTS, MATCH_REASONS, type MatchReason } from "@/lib/domain";
import { addDaysToDate, todayInZone, utcToZonedParts, weekdayOfDate } from "@/lib/time";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/auth/demo-accounts";
import { verifyPassword } from "@/server/auth/password";
import type { DB } from "@/server/db/schema.generated";
import {
  computeBookingMoney,
  computeInvoiceTotals,
  computeQuoteTotals,
  QUOTE_ITEM_KINDS,
  type QuoteItemKind,
  type QuoteTotals,
} from "@/server/pricing";
import { jpegMetadataMarkers } from "@/server/storage/uploads";

import { seed, type SeedSummary } from "../../scripts/seed";
import { SUPPORTING_ACCOUNTS } from "../../scripts/seed/accounts";
import { findDemoWording, GENERATED_TEXT, SEEDED_TEXT } from "../../scripts/seed/finish";
import { createTestContext, type TestContext } from "../support/db";

const ZONE = "America/Phoenix";
/** Monday 5 Oct 2026, 10:00 in Phoenix. */
const SEEDED_AT = new Date("2026-10-05T17:00:00.000Z");
// Drawing the photo scenes takes a while on a busy machine (they are cached for the second seed).
const SEED_TIMEOUT_MS = 240_000;
const quiet = () => undefined;

let t: TestContext;
let summary: SeedSummary;

beforeAll(async () => {
  t = createTestContext({ now: SEEDED_AT });
  summary = await seed({ db: t.ctx.db, storage: t.ctx.storage, now: SEEDED_AT, log: quiet });
}, SEED_TIMEOUT_MS);

afterAll(async () => {
  await t?.cleanup();
});

function all<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare<unknown[], T>(query).all(...params);
}

function one<T>(query: string, ...params: unknown[]): T {
  const row = t.sqlite.prepare<unknown[], T>(query).get(...params);
  if (row === undefined) throw new Error(`No row for: ${query}`);
  return row;
}

function idOf(email: string): string {
  const account = summary.accounts.find((entry) => entry.email === email);
  if (!account) throw new Error(`No seeded account ${email}`);
  return account.id;
}

function reasonsOf(requestId: string, email: string): MatchReason[] {
  const row = one<{ reasons_json: string }>(
    "SELECT reasons_json FROM match_evaluations WHERE request_id = ? AND mechanic_id = ?",
    requestId,
    idOf(email),
  );
  return JSON.parse(row.reasons_json) as MatchReason[];
}

function matchedEmails(requestId: string): string[] {
  return all<{ email: string }>(
    "SELECT u.email FROM job_matches m JOIN users u ON u.id = m.mechanic_id WHERE m.request_id = ? ORDER BY m.rank",
    requestId,
  ).map((row) => row.email);
}

function itemKind(value: string): QuoteItemKind {
  const kind = QUOTE_ITEM_KINDS.find((candidate) => candidate === value);
  if (!kind) throw new Error(`Unexpected quote item kind ${value}`);
  return kind;
}

type MoneyRow = { labor_cents: number; parts_cents: number; tax_cents: number; fee_cents: number; total_cents: number };

function totalsOf(row: MoneyRow): QuoteTotals {
  return {
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
  };
}

describe("sample accounts", () => {
  it("creates the DEMO_ACCOUNTS logins and the supporting cast: right roles, verified, flagged internally", () => {
    const users = all<{ email: string; role: string; display_name: string; is_demo_account: number; email_verified_at: string | null }>(
      "SELECT email, role, display_name, is_demo_account, email_verified_at FROM users",
    );
    const byEmail = (a: string[], b: string[]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    expect(users.map((user) => [user.email, user.role, user.display_name]).sort(byEmail)).toEqual(
      [
        ...DEMO_ACCOUNTS.map((account) => [account.email, account.role, account.displayName]),
        ...SUPPORTING_ACCOUNTS.map((account) => [account.email, account.role, account.displayName]),
      ].sort(byEmail),
    );
    expect(users).toHaveLength(22);
    for (const user of users) {
      expect(user.is_demo_account).toBe(1);
      expect(user.email_verified_at).not.toBeNull();
      expect(user.email.endsWith("@example.com")).toBe(true);
    }
  });

  it("hashes the documented sample password (scrypt, a different salt for each account)", async () => {
    const hashes = all<{ email: string; password_hash: string }>("SELECT email, password_hash FROM users");
    expect(new Set(hashes.map((row) => row.password_hash)).size).toBe(hashes.length);
    for (const email of ["admin@example.com", "customer@example.com", "mechanic@example.com", "nina@example.com", "elena@example.com"]) {
      const row = hashes.find((entry) => entry.email === email);
      expect(row && (await verifyPassword(DEMO_PASSWORD, row.password_hash))).toBe(true);
    }
  });
});

describe("pilot region", () => {
  it("seeds Phoenix-metro pilot ZIPs from the Census centroids, plus Flagstaff outside the pilot", () => {
    const pilot = all<{ zip: string; enabled: number; metro_label: string; time_zone: string }>(
      "SELECT p.zip, p.enabled, p.metro_label, z.time_zone FROM pilot_zips p JOIN zip_centroids z ON z.zip = p.zip",
    );
    expect(pilot.length).toBeGreaterThanOrEqual(30);
    expect(pilot.every((row) => row.enabled === 1 && row.metro_label === "Phoenix metro" && row.time_zone === ZONE)).toBe(true);
    expect(pilot.map((row) => row.zip)).toEqual(expect.arrayContaining(["85281", "85282", "85301", "85138"]));
    expect(all("SELECT zip FROM pilot_zips WHERE zip = '86001'")).toHaveLength(0);
    expect(one<{ city: string }>("SELECT city FROM zip_centroids WHERE zip = '86001'").city).toBe("Flagstaff");
    const sources = all<{ source: string }>("SELECT DISTINCT source FROM zip_centroids");
    expect(sources).toEqual([{ source: "US Census 2020 ZCTA Gazetteer (internal point)" }]);
  });
});

describe("mechanics", () => {
  it("puts every mechanic in the documented state", () => {
    const rows = all<{ email: string; status: string; status_reason: string | null; insurance_expires_on: string }>(
      "SELECT u.email, p.status, p.status_reason, p.insurance_expires_on FROM mechanic_profiles p JOIN users u ON u.id = p.user_id",
    );
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    for (const email of [
      "mechanic@example.com",
      "mechanic2@example.com",
      "garage@example.com",
      "jordan@example.com",
      "expired@example.com",
      "rosa@example.com",
      "valleyauto@example.com",
      "kenji@example.com",
      "elena@example.com",
      "andre@example.com",
      "westside@example.com",
    ]) {
      expect(byEmail.get(email)?.status).toBe("approved");
    }
    expect(rows).toHaveLength(14);
    expect(byEmail.get("suspended@example.com")).toMatchObject({ status: "suspended", status_reason: expect.any(String) });
    expect(byEmail.get("rejected@example.com")).toMatchObject({ status: "rejected", status_reason: expect.any(String) });
    expect(byEmail.get("applicant@example.com")?.status).toBe("applied");

    // Morgan's insurance expired last month; everyone else's is current.
    const today = todayInZone(SEEDED_AT, ZONE);
    const morgan = byEmail.get("expired@example.com")?.insurance_expires_on ?? "";
    expect(morgan < today).toBe(true);
    expect(morgan.slice(0, 7)).toBe("2026-09");
    expect(rows.filter((row) => row.email !== "expired@example.com").every((row) => row.insurance_expires_on > today)).toBe(true);
  });

  it("safety-approves brakes and suspension per the plan, but not Jordan's brake work", () => {
    const rows = all<{ email: string; category_id: string; safety_approved: number }>(
      `SELECT u.email, s.category_id, s.safety_approved FROM mechanic_services s JOIN users u ON u.id = s.mechanic_id
       WHERE s.category_id IN ('brake_work', 'suspension_work') ORDER BY u.email, s.category_id`,
    );
    expect(rows).toEqual([
      { email: "applicant@example.com", category_id: "suspension_work", safety_approved: 0 },
      { email: "elena@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "elena@example.com", category_id: "suspension_work", safety_approved: 1 },
      { email: "garage@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "garage@example.com", category_id: "suspension_work", safety_approved: 1 },
      { email: "jordan@example.com", category_id: "brake_work", safety_approved: 0 },
      { email: "mechanic2@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "mechanic@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "valleyauto@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "westside@example.com", category_id: "brake_work", safety_approved: 1 },
      { email: "westside@example.com", category_id: "suspension_work", safety_approved: 0 },
    ]);
    const offered = all<{ category_id: string }>("SELECT DISTINCT category_id FROM mechanic_services");
    expect(offered).toHaveLength(12);
  });

  it("keeps garage addresses for garage modes only, with fictional contact details", () => {
    const rows = all<{ service_mode: string; garage_address_line1: string | null; phone: string; contact_email: string }>(
      "SELECT p.service_mode, m.garage_address_line1, m.phone, m.contact_email FROM mechanic_profiles p JOIN mechanic_private m ON m.user_id = p.user_id",
    );
    expect(rows).toHaveLength(14);
    for (const row of rows) {
      expect(row.garage_address_line1 === null).toBe(row.service_mode === "mobile");
      expect(row.phone).toMatch(/^\d{3}-555-01\d\d$/);
      expect(row.contact_email.endsWith("@example.com")).toBe(true);
    }
  });

  it("gives Alex a pending application with SAMPLE-marked images and one PDF, and every mechanic a photo", () => {
    const documents = all<{ kind: string; status: string; mime_type: string }>(
      `SELECT d.kind, d.status, f.mime_type FROM mechanic_documents d JOIN files f ON f.id = d.file_id
       WHERE d.mechanic_id = ? ORDER BY d.kind`,
      idOf("applicant@example.com"),
    );
    expect(documents).toEqual([
      { kind: "certification", status: "pending", mime_type: "application/pdf" },
      { kind: "id_document", status: "pending", mime_type: "image/jpeg" },
      { kind: "insurance", status: "pending", mime_type: "image/jpeg" },
    ]);
    expect(one<{ n: number }>("SELECT count(*) AS n FROM mechanic_profiles WHERE profile_photo_file_id IS NULL").n).toBe(0);
  });

  it("records the admin's decisions in the audit log, reasons included", () => {
    const events = all<{ action: string; reason: string | null; email: string }>(
      `SELECT a.action, a.reason, u.email FROM audit_events a JOIN users u ON u.id = a.entity_id
       WHERE a.entity_type = 'mechanic' AND a.actor_role = 'admin'`,
    );
    const approved = events.filter((event) => event.action === "mechanic.approved").map((event) => event.email);
    expect(approved.sort()).toEqual(
      [
        "andre@example.com",
        "elena@example.com",
        "expired@example.com",
        "garage@example.com",
        "jordan@example.com",
        "kenji@example.com",
        "mechanic2@example.com",
        "mechanic@example.com",
        "rosa@example.com",
        "suspended@example.com",
        "valleyauto@example.com",
        "westside@example.com",
      ].sort(),
    );
    expect(events.find((event) => event.action === "mechanic.suspended")).toMatchObject({ email: "suspended@example.com", reason: expect.any(String) });
    expect(events.find((event) => event.action === "mechanic.rejected")).toMatchObject({ email: "rejected@example.com", reason: expect.any(String) });
  });
});

describe("invariants", () => {
  it("flags every request and quote as a seeded fixture (internal flag)", () => {
    expect(all("SELECT id FROM repair_requests WHERE is_demo_fixture = 0")).toEqual([]);
    expect(all("SELECT id FROM quotes WHERE is_demo_fixture = 0")).toEqual([]);
    expect(one<{ n: number }>("SELECT count(*) AS n FROM repair_requests").n).toBe(17);
  });

  it("has requests in every state, spread over the metro and the service categories", () => {
    const states = all<{ status: string; n: number }>("SELECT status, count(*) AS n FROM repair_requests GROUP BY status ORDER BY status");
    expect(states).toEqual([
      { status: "booked", n: 6 },
      { status: "cancelled", n: 1 },
      { status: "expired", n: 1 },
      { status: "open", n: 4 },
      { status: "quoted", n: 4 },
      { status: "reserved", n: 1 },
    ]);
    expect(one<{ n: number }>("SELECT count(DISTINCT zip) AS n FROM repair_requests").n).toBeGreaterThanOrEqual(10);
    expect(one<{ n: number }>("SELECT count(DISTINCT category_id) AS n FROM repair_requests").n).toBeGreaterThanOrEqual(10);
    expect(one<{ n: number }>("SELECT count(DISTINCT base_zip) AS n FROM mechanic_profiles").n).toBeGreaterThanOrEqual(12);
  });

  it("only seeded fixtures get past pending_payment", () => {
    const bookings = all<{ status: string; is_demo_fixture: number; payment_state: string; payout_status: string }>(
      "SELECT status, is_demo_fixture, payment_state, payout_status FROM bookings",
    );
    expect(bookings).toHaveLength(7);
    expect(bookings.map((booking) => booking.status).sort()).toEqual(["completed", "completed", "completed", "completed", "confirmed", "in_progress", "pending_payment"]);
    for (const booking of bookings) {
      if (booking.status === "pending_payment") {
        expect(booking).toMatchObject({ is_demo_fixture: 0, payment_state: "stripe_not_connected", payout_status: "not_eligible" });
      } else {
        expect(booking).toMatchObject({ is_demo_fixture: 1, payment_state: "demo_fixture_no_real_payment" });
      }
    }
  });

  it("stores matched_count as the actual number of job matches for every request", () => {
    const rows = all<{ matched_count: number; matches: number }>(
      "SELECT r.matched_count, (SELECT count(*) FROM job_matches m WHERE m.request_id = r.id) AS matches FROM repair_requests r",
    );
    for (const row of rows) expect(row.matched_count).toBe(row.matches);
  });

  it("never matches Morgan, Taylor, Casey or Alex", () => {
    const excluded = ["expired@example.com", "suspended@example.com", "rejected@example.com", "applicant@example.com"].map(idOf);
    const matched = all<{ mechanic_id: string }>("SELECT DISTINCT mechanic_id FROM job_matches").map((row) => row.mechanic_id);
    expect(matched.filter((id) => excluded.includes(id))).toEqual([]);
    // The diagnostics say why, for a request each of them would otherwise reach.
    expect(reasonsOf(summary.requests.noStart, "expired@example.com")).toEqual(["insurance_expired"]);
    expect(reasonsOf(summary.requests.noStart, "suspended@example.com")).toEqual(["suspended"]);
    expect(reasonsOf(summary.requests.luisGlendale, "rejected@example.com")).toContain("status_not_approved");
    expect(reasonsOf(summary.requests.luisGlendale, "applicant@example.com")).toEqual(["status_not_approved"]);
  });

  it("stores only metadata-stripped images, each matching its recorded hash", async () => {
    const files = all<{ storage_key: string; mime_type: string; metadata_stripped: number; sha256: string; size_bytes: number }>(
      "SELECT storage_key, mime_type, metadata_stripped, sha256, size_bytes FROM files",
    );
    expect(files.length).toBeGreaterThan(30);
    for (const file of files) {
      const bytes = await t.ctx.storage.read(file.storage_key);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(bytes.byteLength).toBe(file.size_bytes);
      if (file.mime_type.startsWith("image/")) {
        expect(file.metadata_stripped).toBe(1);
        expect(jpegMetadataMarkers(bytes)).toEqual([]);
      } else {
        expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      }
    }
    const photos = all<{ shareable_before_booking: number; kind: string }>("SELECT shareable_before_booking, kind FROM request_media");
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((media) => media.kind === "photo" && media.shareable_before_booking === 1)).toBe(true);
  });

  it("keeps every quote, booking and invoice consistent with pricing.ts", async () => {
    const db: Kysely<DB> = t.ctx.db;
    const quotes = await db.selectFrom("quotes").select(["id", "labor_cents", "parts_cents", "tax_cents", "fee_cents", "total_cents"]).execute();
    for (const quote of quotes) {
      const items = await db.selectFrom("quote_items").select(["kind", "quantity", "unit_price_cents", "amount_cents"]).where("quote_id", "=", quote.id).execute();
      expect(items.find((item) => item.kind === "labor")).toBeDefined();
      const recomputed = computeQuoteTotals(
        items.map((item) => ({ kind: itemKind(item.kind), quantity: item.quantity, unitPriceCents: item.unit_price_cents })),
      );
      expect(recomputed).toEqual(totalsOf(quote));
      for (const item of items) expect(item.amount_cents).toBe(item.quantity * item.unit_price_cents);
    }

    const bookings = await db
      .selectFrom("bookings as b")
      .innerJoin("quotes as q", "q.id", "b.quote_id")
      .select([
        "b.id",
        "b.labor_cents",
        "b.parts_cents",
        "b.tax_cents",
        "b.fee_cents",
        "b.total_cents",
        "b.platform_fee_bps",
        "b.platform_fee_cents",
        "b.mechanic_payout_cents",
        "q.labor_cents as quote_labor_cents",
        "q.parts_cents as quote_parts_cents",
        "q.tax_cents as quote_tax_cents",
        "q.fee_cents as quote_fee_cents",
        "q.total_cents as quote_total_cents",
      ])
      .execute();
    for (const booking of bookings) {
      const money = computeBookingMoney({
        laborCents: booking.quote_labor_cents,
        partsCents: booking.quote_parts_cents,
        taxCents: booking.quote_tax_cents,
        feeCents: booking.quote_fee_cents,
        totalCents: booking.quote_total_cents,
      });
      expect({
        ...totalsOf(booking),
        platformFeeBps: booking.platform_fee_bps,
        platformFeeCents: booking.platform_fee_cents,
        mechanicPayoutCents: booking.mechanic_payout_cents,
      }).toEqual(money);
    }

    const invoices = await db
      .selectFrom("invoices as i")
      .innerJoin("bookings as b", "b.id", "i.booking_id")
      .select([
        "i.booking_id",
        "i.invoice_number",
        "i.labor_cents",
        "i.parts_cents",
        "i.tax_cents",
        "i.fee_cents",
        "i.total_cents",
        "i.platform_fee_cents",
        "i.mechanic_payout_cents",
        "i.approved_change_order_count",
        "i.is_demo_fixture",
        "b.labor_cents as booking_labor_cents",
        "b.parts_cents as booking_parts_cents",
        "b.tax_cents as booking_tax_cents",
        "b.fee_cents as booking_fee_cents",
        "b.total_cents as booking_total_cents",
        "b.platform_fee_bps",
      ])
      .execute();
    expect(invoices).toHaveLength(4);
    for (const invoice of invoices) {
      const approved = await db
        .selectFrom("change_orders")
        .select(["labor_cents", "parts_cents", "tax_cents"])
        .where("booking_id", "=", invoice.booking_id)
        .where("status", "=", "approved")
        .execute();
      const expected = computeInvoiceTotals(
        {
          laborCents: invoice.booking_labor_cents,
          partsCents: invoice.booking_parts_cents,
          taxCents: invoice.booking_tax_cents,
          feeCents: invoice.booking_fee_cents,
          totalCents: invoice.booking_total_cents,
        },
        approved.map((order) => ({ laborCents: order.labor_cents, partsCents: order.parts_cents, taxCents: order.tax_cents })),
        invoice.platform_fee_bps,
      );
      expect({
        ...totalsOf(invoice),
        platformFeeCents: invoice.platform_fee_cents,
        mechanicPayoutCents: invoice.mechanic_payout_cents,
        approvedChangeOrderCount: invoice.approved_change_order_count,
      }).toEqual({
        ...totalsOf({
          labor_cents: expected.laborCents,
          parts_cents: expected.partsCents,
          tax_cents: expected.taxCents,
          fee_cents: expected.feeCents,
          total_cents: expected.totalCents,
        }),
        platformFeeCents: expected.platformFeeCents,
        mechanicPayoutCents: expected.mechanicPayoutCents,
        approvedChangeOrderCount: expected.approvedChangeOrderCount,
      });
      expect(invoice).toMatchObject({ is_demo_fixture: 1, invoice_number: expect.stringMatching(/^INV-[A-Z2-9]{6}$/) });
    }
  });

  it("dates every seeded event at or before the seeding time", () => {
    const latest = (table: string, column: string) =>
      one<{ at: string | null }>(`SELECT max(${column}) AS at FROM ${table}`).at ?? "";
    for (const [table, column] of [
      ["users", "created_at"],
      ["repair_requests", "submitted_at"],
      ["quotes", "created_at"],
      ["bookings", "created_at"],
      ["notifications", "created_at"],
      ["audit_events", "created_at"],
      ["support_requests", "created_at"],
      ["mechanic_gallery", "created_at"],
      ["booking_photos", "created_at"],
    ] as const) {
      expect(latest(table, column) <= SEEDED_AT.toISOString()).toBe(true);
    }
  });
});

describe("Dana's scenarios", () => {
  const today = todayInZone(SEEDED_AT, ZONE);

  it("(a) brake quotes to compare: Marco and Sam's Garage live for about 48 hours, Priya's expired", () => {
    const requestId = summary.requests.brakeQuotes;
    expect(one<{ status: string; zip: string }>("SELECT status, zip FROM repair_requests WHERE id = ?", requestId)).toEqual({
      status: "quoted",
      zip: "85281",
    });
    const quotes = all<{ email: string; status: string; expires_at: string }>(
      "SELECT u.email, q.status, q.expires_at FROM quotes q JOIN users u ON u.id = q.mechanic_id WHERE q.request_id = ? ORDER BY u.email",
      requestId,
    );
    expect(quotes.map((quote) => [quote.email, quote.status])).toEqual([
      ["garage@example.com", "submitted"],
      ["mechanic2@example.com", "expired"],
      ["mechanic@example.com", "submitted"],
    ]);
    for (const quote of quotes.filter((entry) => entry.status === "submitted")) {
      const hoursLeft = (Date.parse(quote.expires_at) - SEEDED_AT.getTime()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(40);
      expect(hoursLeft).toBeLessThanOrEqual(48);
    }
    const itemKinds = all<{ kind: string }>(
      "SELECT DISTINCT i.kind FROM quote_items i JOIN quotes q ON q.id = i.quote_id WHERE q.request_id = ?",
      requestId,
    ).map((row) => row.kind);
    expect(itemKinds.sort()).toEqual(["fee", "labor", "part", "tax"]);
    expect(reasonsOf(requestId, "jordan@example.com")).toContain("safety_category_not_approved");
    expect(matchedEmails(requestId)).not.toContain("jordan@example.com");
  });

  it("(b) a no-start job matched to Marco with no quotes yet", () => {
    const requestId = summary.requests.noStart;
    const request = one<{ status: string; zip: string; preferred_date: string }>(
      "SELECT status, zip, preferred_date FROM repair_requests WHERE id = ?",
      requestId,
    );
    expect(request).toMatchObject({ status: "open", zip: "85282" });
    expect(request.preferred_date > today).toBe(true);
    expect(matchedEmails(requestId)).toContain("mechanic@example.com");
    expect(all("SELECT id FROM quotes WHERE request_id = ?", requestId)).toEqual([]);
  });

  it("(c) a reservation made by selectQuote: pending payment, Marco's quote selected, Jordan's declined", () => {
    const booking = one<{ request_id: string; status: string; mechanic_id: string; consent_snapshot_json: string }>(
      "SELECT request_id, status, mechanic_id, consent_snapshot_json FROM bookings WHERE id = ?",
      summary.bookings.pendingReservation,
    );
    expect(booking).toMatchObject({ request_id: summary.requests.pendingReservation, status: "pending_payment", mechanic_id: idOf("mechanic@example.com") });
    const consent = JSON.parse(booking.consent_snapshot_json) as { items: { key: string }[] };
    expect(consent.items.map((item) => item.key)).toEqual(BOOKING_CONSENTS.map((item) => item.key));
    expect(one<{ status: string }>("SELECT status FROM repair_requests WHERE id = ?", booking.request_id).status).toBe("reserved");
    const quotes = all<{ email: string; status: string }>(
      "SELECT u.email, q.status FROM quotes q JOIN users u ON u.id = q.mechanic_id WHERE q.request_id = ? ORDER BY u.email",
      booking.request_id,
    );
    expect(quotes).toEqual([
      { email: "jordan@example.com", status: "declined" },
      { email: "mechanic@example.com", status: "selected" },
    ]);
  });

  it("(d) a confirmed demo booking with Marco tomorrow, with a change order awaiting Dana", () => {
    const booking = one<{ status: string; is_demo_fixture: number; slot_start_at: string; mechanic_id: string }>(
      "SELECT status, is_demo_fixture, slot_start_at, mechanic_id FROM bookings WHERE id = ?",
      summary.bookings.confirmedBooking,
    );
    expect(booking).toMatchObject({ status: "confirmed", is_demo_fixture: 1, mechanic_id: idOf("mechanic@example.com") });
    expect(utcToZonedParts(new Date(booking.slot_start_at), ZONE).date).toBe(addDaysToDate(today, 1));
    expect(all<{ status: string; is_demo_fixture: number }>(
      "SELECT status, is_demo_fixture FROM change_orders WHERE booking_id = ?",
      summary.bookings.confirmedBooking,
    )).toEqual([{ status: "proposed", is_demo_fixture: 1 }]);
    expect(matchedEmails(summary.requests.confirmedBooking)).toEqual(["mechanic@example.com"]);
  });

  it("(e) yesterday's completed job: demo invoice issued, payout pending, no review yet", () => {
    const bookingId = summary.bookings.completedInvoiced;
    const booking = one<{ status: string; payout_status: string; slot_start_at: string }>(
      "SELECT status, payout_status, slot_start_at FROM bookings WHERE id = ?",
      bookingId,
    );
    expect(booking).toMatchObject({ status: "completed", payout_status: "pending" });
    expect(utcToZonedParts(new Date(booking.slot_start_at), ZONE).date).toBe(addDaysToDate(today, -1));
    expect(one<{ approved_change_order_count: number }>("SELECT approved_change_order_count FROM invoices WHERE booking_id = ?", bookingId).approved_change_order_count).toBe(1);
    expect(all("SELECT id FROM reviews WHERE booking_id = ?", bookingId)).toEqual([]);
  });

  it("(f) last week's completed job with a seeded review that never counts toward ratings", () => {
    const bookingId = summary.bookings.completedReviewed;
    expect(one<{ status: string; mechanic_id: string }>("SELECT status, mechanic_id FROM bookings WHERE id = ?", bookingId)).toEqual({
      status: "completed",
      mechanic_id: idOf("garage@example.com"),
    });
    expect(all<{ rating: number; is_demo_fixture: number }>("SELECT rating, is_demo_fixture FROM reviews WHERE booking_id = ?", bookingId)).toEqual([
      { rating: 5, is_demo_fixture: 1 },
    ]);
    // Every seeded review is a fixture, so no mechanic gets a rating from sample data.
    expect(all("SELECT id FROM reviews WHERE is_demo_fixture = 0")).toEqual([]);
  });

  it("(i) an open help request about the confirmed booking, with the admins notified", () => {
    const request = one<{ status: string; topic: string; booking_id: string; request_id: string; user_id: string }>(
      "SELECT status, topic, booking_id, request_id, user_id FROM support_requests WHERE id = ?",
      summary.supportRequestId,
    );
    expect(request).toEqual({
      status: "open",
      topic: "booking_issue",
      booking_id: summary.bookings.confirmedBooking,
      request_id: summary.requests.confirmedBooking,
      user_id: idOf("customer@example.com"),
    });
    // One help-desk alert per request: Dana's, Omar's, and the two already answered.
    expect(all("SELECT id FROM notifications WHERE user_id = ? AND type = 'support.created'", idOf("admin@example.com"))).toHaveLength(4);
  });

  it("leaves the last two days' notifications unread and earlier ones read", () => {
    const cutoff = new Date(SEEDED_AT.getTime() - 48 * 3_600_000).toISOString();
    expect(all("SELECT id FROM notifications WHERE created_at < ? AND read_at IS NULL", cutoff)).toEqual([]);
    expect(all("SELECT id FROM notifications WHERE created_at >= ? AND read_at IS NOT NULL", cutoff)).toEqual([]);
    expect(one<{ n: number }>("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", idOf("customer@example.com")).n).toBeGreaterThan(0);
  });
});

describe("Luis's scenarios", () => {
  it("(g) a Glendale request matched to nearby mechanics, but not to Marco or Sam's Garage", () => {
    const matched = matchedEmails(summary.requests.luisGlendale);
    expect(matched.length).toBeGreaterThan(0);
    expect(matched).not.toContain("mechanic@example.com");
    expect(matched).not.toContain("garage@example.com");
    expect(reasonsOf(summary.requests.luisGlendale, "mechanic@example.com")).toEqual(["out_of_range"]);
  });

  it("(h) a request in the far pilot ZIP that genuinely matches nobody, flagged for the admins", () => {
    const requestId = summary.requests.luisNoMatch;
    expect(one<{ status: string; zip: string; matched_count: number }>(
      "SELECT status, zip, matched_count FROM repair_requests WHERE id = ?",
      requestId,
    )).toEqual({ status: "open", zip: "85138", matched_count: 0 });
    expect(matchedEmails(requestId)).toEqual([]);
    const evaluations = all<{ eligible: number; reasons_json: string }>(
      "SELECT eligible, reasons_json FROM match_evaluations WHERE request_id = ?",
      requestId,
    );
    expect(evaluations).toHaveLength(14);
    expect(evaluations.every((row) => row.eligible === 0)).toBe(true);
    // Approved mobile mechanics fail on distance alone; the garage-only one on the mode.
    for (const email of ["mechanic@example.com", "mechanic2@example.com", "jordan@example.com"]) {
      expect(reasonsOf(requestId, email)).toEqual(["out_of_range"]);
    }
    expect(reasonsOf(requestId, "garage@example.com")).toContain("mode_mismatch");
    expect(all("SELECT id FROM notifications WHERE user_id = ? AND type = 'admin.request_no_match'", idOf("admin@example.com"))).toHaveLength(1);
  });

  it("uses only known match reason codes", () => {
    const codes = new Set(all<{ reasons_json: string }>("SELECT reasons_json FROM match_evaluations").flatMap((row) => JSON.parse(row.reasons_json) as string[]));
    for (const code of codes) expect(MATCH_REASONS).toContain(code);
  });
});

describe("the supporting cast's scenarios", () => {
  function quotesOn(requestId: string): { email: string; status: string; service_mode: string; parts_cents: number }[] {
    return all(
      "SELECT u.email, q.status, q.service_mode, q.parts_cents FROM quotes q JOIN users u ON u.id = q.mechanic_id WHERE q.request_id = ? ORDER BY u.email",
      requestId,
    );
  }

  function matchStatus(requestId: string, email: string): string {
    return one<{ status: string }>("SELECT status FROM job_matches WHERE request_id = ? AND mechanic_id = ?", requestId, idOf(email)).status;
  }

  it("(j) Nina's headlight: Kenji and Marco quoted an evening visit", () => {
    const requestId = summary.requests.ninaHeadlight;
    expect(one<{ status: string; zip: string }>("SELECT status, zip FROM repair_requests WHERE id = ?", requestId)).toEqual({ status: "quoted", zip: "85251" });
    expect(quotesOn(requestId).map((quote) => [quote.email, quote.status])).toEqual([
      ["kenji@example.com", "submitted"],
      ["mechanic@example.com", "submitted"],
    ]);
    // Elena offers bulbs but works daytime only; Jordan doesn't work on Mazdas.
    expect(reasonsOf(requestId, "elena@example.com")).toEqual(["no_availability"]);
    expect(reasonsOf(requestId, "jordan@example.com")).toEqual(["make_not_supported"]);
  });

  it("(k) Omar's wipers: Elena quoted and Marco passed on the job", () => {
    const requestId = summary.requests.omarWipers;
    expect(matchedEmails(requestId).sort()).toEqual(["elena@example.com", "mechanic@example.com"]);
    expect(matchStatus(requestId, "mechanic@example.com")).toBe("passed");
    expect(quotesOn(requestId).map((quote) => quote.email)).toEqual(["elena@example.com"]);
  });

  it("(l) Grace's filters: matched to three mechanics, no quotes yet, Priya interested", () => {
    const requestId = summary.requests.graceFilters;
    expect(one<{ status: string }>("SELECT status FROM repair_requests WHERE id = ?", requestId).status).toBe("open");
    expect(matchedEmails(requestId).sort()).toEqual(["elena@example.com", "mechanic2@example.com", "mechanic@example.com"]);
    expect(matchStatus(requestId, "mechanic2@example.com")).toBe("interested");
    expect(quotesOn(requestId)).toEqual([]);
  });

  it("(m) Ben's misfire: a garage and a mobile mechanic quoted a diagnosis without parts", () => {
    expect(quotesOn(summary.requests.benMisfire)).toEqual([
      { email: "rosa@example.com", status: "submitted", service_mode: "mobile", parts_cents: 0 },
      { email: "westside@example.com", status: "submitted", service_mode: "garage", parts_cents: 0 },
    ]);
  });

  it("(n) Hannah's battery: completed, the cabin-filter change order declined and left off the invoice", () => {
    const bookingId = summary.bookings.hannahBattery;
    expect(one<{ status: string; mechanic_id: string }>("SELECT status, mechanic_id FROM bookings WHERE id = ?", bookingId)).toEqual({
      status: "completed",
      mechanic_id: idOf("mechanic2@example.com"),
    });
    expect(all<{ status: string }>("SELECT status FROM change_orders WHERE booking_id = ?", bookingId)).toEqual([{ status: "rejected" }]);
    expect(one<{ n: number }>("SELECT approved_change_order_count AS n FROM invoices WHERE booking_id = ?", bookingId).n).toBe(0);
    expect(all("SELECT id FROM reviews WHERE booking_id = ?", bookingId)).toEqual([]);
  });

  it("(o) Omar's truck: in progress, the caliper change order approved, no invoice yet", () => {
    const bookingId = summary.bookings.omarBrakes;
    const booking = one<{ status: string; started_at: string | null; payout_status: string; mechanic_id: string }>(
      "SELECT status, started_at, payout_status, mechanic_id FROM bookings WHERE id = ?",
      bookingId,
    );
    expect(booking).toMatchObject({ status: "in_progress", payout_status: "not_eligible", mechanic_id: idOf("garage@example.com") });
    expect(booking.started_at).not.toBeNull();
    expect(all<{ status: string }>("SELECT status FROM change_orders WHERE booking_id = ?", bookingId)).toEqual([{ status: "approved" }]);
    expect(all("SELECT id FROM invoices WHERE booking_id = ?", bookingId)).toEqual([]);
  });

  it("(p) Grace's service: completed, invoiced and reviewed with a seeded 4-star review", () => {
    const bookingId = summary.bookings.graceService;
    expect(one<{ status: string }>("SELECT status FROM bookings WHERE id = ?", bookingId).status).toBe("completed");
    expect(all("SELECT id FROM invoices WHERE booking_id = ?", bookingId)).toHaveLength(1);
    expect(all<{ rating: number; is_demo_fixture: number }>("SELECT rating, is_demo_fixture FROM reviews WHERE booking_id = ?", bookingId)).toEqual([
      { rating: 4, is_demo_fixture: 1 },
    ]);
  });

  it("(q) and (r): one request expired with its quote, one cancelled by the customer", () => {
    expect(one<{ status: string }>("SELECT status FROM repair_requests WHERE id = ?", summary.requests.benExpired).status).toBe("expired");
    expect(quotesOn(summary.requests.benExpired).map((quote) => [quote.email, quote.status])).toEqual([["westside@example.com", "expired"]]);
    const cancelled = summary.requests.ninaCancelled;
    expect(one<{ status: string }>("SELECT status FROM repair_requests WHERE id = ?", cancelled).status).toBe("cancelled");
    // Both matched mechanics heard about the cancellation.
    const told = all<{ email: string }>(
      "SELECT u.email FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.type = 'request.cancelled' AND n.link_path = ? ORDER BY u.email",
      `/mechanic/jobs/${cancelled}`,
    ).map((row) => row.email);
    expect(told).toEqual(matchedEmails(cancelled).sort());
    expect(told).toHaveLength(2);
  });

  it("keeps two help requests open and two answered, with honest payment wording", () => {
    const rows = all<{ status: string; resolution_note: string | null }>("SELECT status, resolution_note FROM support_requests ORDER BY created_at");
    expect(rows.map((row) => row.status).sort()).toEqual(["open", "open", "resolved", "resolved"]);
    for (const row of rows.filter((entry) => entry.status === "resolved")) expect(row.resolution_note).toMatch(/coming soon/);
    expect(one<{ status: string }>("SELECT status FROM support_requests WHERE id = ?", summary.supportRequests.omarOpen).status).toBe("open");
  });
});

describe("pictures people added (migration 0003)", () => {
  it("gives some customers and the admin a profile picture", () => {
    const rows = all<{ email: string; purpose: string; owner_user_id: string; id: string }>(
      "SELECT u.email, f.purpose, f.owner_user_id, u.id FROM users u JOIN files f ON f.id = u.avatar_file_id ORDER BY u.email",
    );
    expect(rows.map((row) => row.email)).toEqual([
      "admin@example.com",
      "customer2@example.com",
      "customer@example.com",
      "grace@example.com",
      "nina@example.com",
      "omar@example.com",
    ]);
    for (const row of rows) expect(row).toMatchObject({ purpose: "user_avatar", owner_user_id: row.id });
    expect(summary.pictures.avatars).toBe(6);
  });

  it("fills work galleries for most approved mechanics, every photo captioned and in order", () => {
    const rows = all<{ email: string; n: number; captions: number; owned: number; max_order: number }>(
      `SELECT u.email, count(*) AS n, count(g.caption) AS captions, sum(f.owner_user_id = g.mechanic_id AND f.purpose = 'mechanic_gallery') AS owned,
              max(g.sort_order) AS max_order
       FROM mechanic_gallery g JOIN users u ON u.id = g.mechanic_id JOIN files f ON f.id = g.file_id GROUP BY u.email ORDER BY u.email`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(row.n).toBeGreaterThanOrEqual(3);
      expect(row.captions).toBe(row.n);
      expect(row.owned).toBe(row.n);
      expect(row.max_order).toBe(row.n - 1);
    }
    expect(rows.map((row) => row.email)).toEqual(expect.arrayContaining(["mechanic@example.com", "garage@example.com", "mechanic2@example.com"]));
    // A mechanic who hasn't added any photos shows the empty state.
    expect(rows.map((row) => row.email)).not.toContain("andre@example.com");
  });

  it("adds before/after photos only to confirmed-or-later bookings, by their own customer or mechanic", () => {
    const rows = all<{ status: string; phase: string; by_party: number; purpose: string; owned: number }>(
      `SELECT b.status, p.phase, p.uploaded_by IN (b.customer_id, b.mechanic_id) AS by_party, f.purpose, f.owner_user_id = p.uploaded_by AS owned
       FROM booking_photos p JOIN bookings b ON b.id = p.booking_id JOIN files f ON f.id = p.file_id`,
    );
    expect(rows.length).toBe(summary.pictures.bookingPhotos);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(["confirmed", "in_progress", "completed", "disputed"]).toContain(row.status);
      expect(row).toMatchObject({ by_party: 1, purpose: "booking_photo", owned: 1 });
    }
    expect(new Set(rows.map((row) => row.phase))).toEqual(new Set(["before", "after"]));
    expect(all("SELECT id FROM booking_photos WHERE booking_id = ?", summary.bookings.pendingReservation)).toEqual([]);
  });
});

describe("presentation mode", () => {
  it("never says demo in anything people read, seeded or generated", async () => {
    expect(await findDemoWording(t.ctx.db, SEEDED_TEXT)).toEqual([]);
    expect(await findDemoWording(t.ctx.db, GENERATED_TEXT)).toEqual([]);
  });

  it("keeps credentials honest: sample insurers and policy numbers, self-reported certifications", () => {
    const rows = all<{ insurance_provider: string; certifications: string | null; insurance_policy_number: string }>(
      "SELECT p.insurance_provider, p.certifications, m.insurance_policy_number FROM mechanic_profiles p JOIN mechanic_private m ON m.user_id = p.user_id",
    );
    expect(rows).toHaveLength(14);
    for (const row of rows) {
      expect(row.insurance_provider).toMatch(/\(sample\)$/);
      expect(row.insurance_policy_number).toMatch(/^SMPL-/);
      if (row.certifications !== null) expect(row.certifications).toMatch(/\(self-reported\)$/);
    }
  });
});

describe("guards", () => {
  it("refuses a database that already has data", async () => {
    await expect(seed({ db: t.ctx.db, storage: t.ctx.storage, now: SEEDED_AT, log: quiet })).rejects.toThrow(/already has data/);
  });

  it("never touches a database when NODE_ENV=production", async () => {
    const untouchable = new Proxy({} as Kysely<DB>, {
      get() {
        throw new Error("The database was touched");
      },
    });
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(seed({ db: untouchable, log: quiet })).rejects.toThrow(/NODE_ENV=production/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("seeding at the end of a Saturday", () => {
  // Saturday 3 Oct 2026, 23:50 in Phoenix: tomorrow is a Sunday and today's date ends soon.
  const LATE_SATURDAY = new Date("2026-10-04T06:50:00.000Z");
  let late: TestContext;
  let lateSummary: SeedSummary;

  beforeAll(async () => {
    late = createTestContext({ now: LATE_SATURDAY });
    lateSummary = await seed({ db: late.ctx.db, storage: late.ctx.storage, now: LATE_SATURDAY, log: quiet });
  }, SEED_TIMEOUT_MS);

  afterAll(async () => {
    await late?.cleanup();
  });

  it("still books Marco for tomorrow, yesterday's job is done and open requests prefer weekdays ahead", () => {
    const today = todayInZone(LATE_SATURDAY, ZONE);
    const slot = late.sqlite
      .prepare<[string], { slot_start_at: string }>("SELECT slot_start_at FROM bookings WHERE id = ?")
      .get(lateSummary.bookings.confirmedBooking);
    expect(slot && utcToZonedParts(new Date(slot.slot_start_at), ZONE).date).toBe(addDaysToDate(today, 1));
    const open = late.sqlite
      .prepare<[], { preferred_date: string }>("SELECT preferred_date FROM repair_requests WHERE status IN ('open', 'quoted', 'reserved')")
      .all();
    expect(open).toHaveLength(9);
    for (const request of open) {
      expect(request.preferred_date > today).toBe(true);
      expect([1, 2, 3, 4, 5]).toContain(weekdayOfDate(request.preferred_date));
    }
    const noMatch = late.sqlite
      .prepare<[string], { matched_count: number }>("SELECT matched_count FROM repair_requests WHERE id = ?")
      .get(lateSummary.requests.luisNoMatch);
    expect(noMatch?.matched_count).toBe(0);
  });
});
