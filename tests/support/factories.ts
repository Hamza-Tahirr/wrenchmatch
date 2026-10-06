// Builders for test data. They insert rows directly (no domain commands, no authorization),
// fill sensible defaults and return small objects with the ids tests need. Every builder
// takes the AppContext from createTestContext(); timestamps come from ctx.now.
//
//   const customer = await createUser(ctx, { role: "customer" });
//   const mechanic = await createMechanic(ctx, { categories: ["oil_change"] });
//   const request = await createOpenRequest(ctx, customer, { categoryId: "oil_change" });
//   const quote = await createSubmittedQuote(ctx, { requestId: request.id, mechanicId: mechanic.id });
//
// Defaults (overridable): ZIP 85004 (downtown Phoenix, America/Phoenix), mechanics approved
// with insurance valid for a year, mode "both", 25-mile radius, all makes, the ten
// non-safety categories, available every day 08:00-18:00; requests open, preferred date two
// days after ctx.now, morning window, mode "either".

import type { Insertable } from "kysely";

import {
  buildConsentSnapshot,
  BOOKING_CONSENTS,
  REQUEST_CONSENTS,
  type BookingStatus,
  type MechanicServiceMode,
  type MechanicStatus,
  type PayoutStatus,
  type PreferredWindow,
  type QuoteServiceMode,
  type RequestServiceMode,
  type UserRole,
} from "@/lib/domain";
import { addDaysToDate, todayInZone } from "@/lib/time";
import { addDays, addHours, addMinutes } from "@/server/clock";
import { REQUEST_TTL_DAYS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import type { Bookings } from "@/server/db/schema.generated";
import { newId } from "@/server/ids";
import {
  computeBookingMoney,
  computeQuoteTotals,
  type BookingMoney,
  type PricedItem,
  type QuoteTotals,
} from "@/server/pricing";

// ---------------------------------------------------------------------------------
// ZIPs
// ---------------------------------------------------------------------------------

export type ZipInput = {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  timeZone: string;
  /** Also add the ZIP to pilot_zips (enabled). Default true. */
  pilot?: boolean;
  metroLabel?: string;
};

type ZipData = Omit<ZipInput, "zip">;

/**
 * Approximate ZIP centroids for tests (not survey data). 85004 is the default; Flagstaff
 * (~120 miles away) is out of range of Phoenix mechanics; 10001 is outside the pilot and
 * observes DST.
 */
export const TEST_ZIPS = {
  "85004": { city: "Phoenix", state: "AZ", lat: 33.451, lng: -112.069, timeZone: "America/Phoenix" },
  "85281": { city: "Tempe", state: "AZ", lat: 33.428, lng: -111.933, timeZone: "America/Phoenix" },
  "85201": { city: "Mesa", state: "AZ", lat: 33.435, lng: -111.848, timeZone: "America/Phoenix" },
  "85251": { city: "Scottsdale", state: "AZ", lat: 33.494, lng: -111.92, timeZone: "America/Phoenix" },
  "85301": { city: "Glendale", state: "AZ", lat: 33.532, lng: -112.178, timeZone: "America/Phoenix" },
  "85224": { city: "Chandler", state: "AZ", lat: 33.33, lng: -111.863, timeZone: "America/Phoenix" },
  "86001": { city: "Flagstaff", state: "AZ", lat: 35.186, lng: -111.667, timeZone: "America/Phoenix" },
  "10001": {
    city: "New York",
    state: "NY",
    lat: 40.751,
    lng: -73.997,
    timeZone: "America/New_York",
    pilot: false,
  },
} as const satisfies Record<string, ZipData>;

export type TestZipCode = keyof typeof TEST_ZIPS;
export const DEFAULT_TEST_ZIP: TestZipCode = "85004";

/** Inserts a ZIP centroid (and pilot ZIP) if missing; existing rows are left unchanged. */
export async function createZip(ctx: AppContext, input: ZipInput): Promise<ZipInput> {
  await ctx.db
    .insertInto("zip_centroids")
    .values({
      zip: input.zip,
      city: input.city,
      state: input.state,
      lat: input.lat,
      lng: input.lng,
      time_zone: input.timeZone,
      source: "test fixture (approximate)",
    })
    .onConflict((oc) => oc.column("zip").doNothing())
    .execute();
  if (input.pilot ?? true) {
    await ctx.db
      .insertInto("pilot_zips")
      .values({
        zip: input.zip,
        enabled: 1,
        metro_label: input.metroLabel ?? `${input.city} area (test)`,
        created_at: ctx.now.toISOString(),
        updated_at: ctx.now.toISOString(),
      })
      .onConflict((oc) => oc.column("zip").doNothing())
      .execute();
  }
  return input;
}

type ZipRow = { zip: string; city: string; state: string; lat: number; lng: number; time_zone: string };

/** Loads a ZIP, creating it first when it is one of TEST_ZIPS. */
async function ensureZip(ctx: AppContext, zip: string): Promise<ZipRow> {
  if (zip in TEST_ZIPS) await createZip(ctx, { zip, ...TEST_ZIPS[zip as TestZipCode] });
  const row = await ctx.db
    .selectFrom("zip_centroids")
    .select(["zip", "city", "state", "lat", "lng", "time_zone"])
    .where("zip", "=", zip)
    .executeTakeFirst();
  if (!row) throw new Error(`Test ZIP ${zip} does not exist; create it with createZip() first.`);
  return row;
}

// ---------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------

/** Stored when a test does not need to log in. Auth tests hash a real password instead. */
export const TEST_PASSWORD_HASH_PLACEHOLDER = "test-placeholder-not-a-real-password-hash";

let sequence = 0;
const nextNumber = () => (sequence += 1);

export type UserInput = {
  role: UserRole;
  email?: string;
  displayName?: string;
  passwordHash?: string;
  isDemoAccount?: boolean;
  /** Default true: local development auto-verifies emails. */
  emailVerified?: boolean;
};

/** Returns a Viewer for the new account. */
export async function createUser(ctx: AppContext, input: UserInput): Promise<Viewer> {
  const id = newId();
  const n = nextNumber();
  const email = input.email ?? `${input.role}${n}-${id.slice(0, 8)}@example.test`;
  const displayName = input.displayName ?? `Test ${input.role} ${n}`;
  const nowIso = ctx.now.toISOString();
  await ctx.db
    .insertInto("users")
    .values({
      id,
      email,
      password_hash: input.passwordHash ?? TEST_PASSWORD_HASH_PLACEHOLDER,
      role: input.role,
      display_name: displayName,
      email_verified_at: input.emailVerified === false ? null : nowIso,
      is_demo_account: input.isDemoAccount ? 1 : 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .execute();
  return { id, role: input.role, email, displayName };
}

export function viewerFor(user: Viewer): Viewer {
  return { id: user.id, role: user.role, email: user.email, displayName: user.displayName };
}

// ---------------------------------------------------------------------------------
// Mechanics
// ---------------------------------------------------------------------------------

/** The ten categories that are not safety-sensitive (seeded by migration 0001). */
export const NON_SAFETY_CATEGORIES = [
  "diagnostic_visit",
  "cel_code_read",
  "battery_replacement",
  "battery_no_start",
  "oil_change",
  "filters",
  "bulbs",
  "wipers",
  "basic_maintenance",
  "minor_engine_sensor",
] as const;

export type AvailabilityWindow = { weekday: number; startMinute: number; endMinute: number };

/** Every day of the week, 08:00-18:00 local time. */
export const EVERY_DAY_8_TO_6: readonly AvailabilityWindow[] = [0, 1, 2, 3, 4, 5, 6].map(
  (weekday) => ({ weekday, startMinute: 480, endMinute: 1080 }),
);

export type MechanicInput = {
  email?: string;
  displayName?: string;
  legalName?: string;
  businessName?: string | null;
  phone?: string;
  /** Default "approved" (inserted directly; status triggers only guard later updates). */
  status?: MechanicStatus;
  /** Required by the schema for rejected/suspended; defaults to "Test reason". */
  statusReason?: string;
  serviceMode?: MechanicServiceMode;
  travelRadiusMiles?: number;
  /** Default DEFAULT_TEST_ZIP; TEST_ZIPS codes are created on demand. */
  baseZip?: string;
  /**
   * Category ids, or { id, safetyApproved } for safety-sensitive categories (brake_work,
   * suspension_work); plain ids are not safety-approved. Default NON_SAFETY_CATEGORIES.
   */
  categories?: ReadonlyArray<string | { id: string; safetyApproved?: boolean }>;
  /** Specific makes, or "all" (services_all_makes = 1). Default "all". */
  makes?: readonly string[] | "all";
  /** Default EVERY_DAY_8_TO_6; [] for none. */
  availability?: readonly AvailabilityWindow[];
  /** Default "Test Mutual Insurance"; null for none on file. */
  insuranceProvider?: string | null;
  /** YYYY-MM-DD; default one year after ctx.now (UTC date); null for none on file. */
  insuranceExpiresOn?: string | null;
  acceptingJobs?: boolean;
  yearsExperience?: number;
};

export type TestMechanic = Viewer & { baseZip: string };

export async function createMechanic(
  ctx: AppContext,
  input: MechanicInput = {},
): Promise<TestMechanic> {
  const user = await createUser(ctx, {
    role: "mechanic",
    email: input.email,
    displayName: input.displayName,
  });
  const nowIso = ctx.now.toISOString();
  const status = input.status ?? "approved";
  const zip = await ensureZip(ctx, input.baseZip ?? DEFAULT_TEST_ZIP);
  const serviceMode = input.serviceMode ?? "both";
  const makes = input.makes ?? "all";
  const todayUtc = nowIso.slice(0, 10);

  await ctx.db
    .insertInto("mechanic_profiles")
    .values({
      user_id: user.id,
      display_name: user.displayName,
      bio: "Test mechanic profile.",
      years_experience: input.yearsExperience ?? 8,
      certifications: null,
      service_mode: serviceMode,
      travel_radius_miles: input.travelRadiusMiles ?? 25,
      base_zip: zip.zip,
      base_lat: zip.lat,
      base_lng: zip.lng,
      services_all_makes: makes === "all" ? 1 : 0,
      insurance_provider:
        input.insuranceProvider === undefined ? "Test Mutual Insurance" : input.insuranceProvider,
      insurance_expires_on:
        input.insuranceExpiresOn === undefined ? addDaysToDate(todayUtc, 365) : input.insuranceExpiresOn,
      accepting_jobs: input.acceptingJobs === false ? 0 : 1,
      status,
      status_reason:
        status === "rejected" || status === "suspended" ? (input.statusReason ?? "Test reason") : null,
      status_changed_at: nowIso,
      approved_at: status === "approved" ? nowIso : null,
      submitted_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .execute();

  await ctx.db
    .insertInto("mechanic_private")
    .values({
      user_id: user.id,
      legal_name: input.legalName ?? `${user.displayName} Legal`,
      business_name: input.businessName === undefined ? null : input.businessName,
      phone: input.phone ?? "602-555-0142",
      contact_email: user.email,
      garage_address_line1: serviceMode === "mobile" ? null : "100 Test Garage Way",
      garage_city: serviceMode === "mobile" ? null : zip.city,
      garage_state: serviceMode === "mobile" ? null : zip.state,
      garage_zip: serviceMode === "mobile" ? null : zip.zip,
      insurance_policy_number: "TEST-POLICY-0001",
      updated_at: nowIso,
    })
    .execute();

  const categories = (input.categories ?? NON_SAFETY_CATEGORIES).map((entry) =>
    typeof entry === "string" ? { id: entry, safetyApproved: false } : entry,
  );
  if (categories.length > 0) {
    await ctx.db
      .insertInto("mechanic_services")
      .values(
        categories.map((category) => ({
          mechanic_id: user.id,
          category_id: category.id,
          safety_approved: category.safetyApproved ? 1 : 0,
          safety_approved_at: category.safetyApproved ? nowIso : null,
        })),
      )
      .execute();
  }

  if (makes !== "all" && makes.length > 0) {
    await ctx.db
      .insertInto("mechanic_makes")
      .values(makes.map((make) => ({ mechanic_id: user.id, make })))
      .execute();
  }

  const availability = input.availability ?? EVERY_DAY_8_TO_6;
  if (availability.length > 0) {
    await ctx.db
      .insertInto("mechanic_availability")
      .values(
        availability.map((window) => ({
          id: newId(),
          mechanic_id: user.id,
          weekday: window.weekday,
          start_minute: window.startMinute,
          end_minute: window.endMinute,
        })),
      )
      .execute();
  }

  return { ...user, baseZip: zip.zip };
}

// ---------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------

export type RequestInput = {
  /** Default DEFAULT_TEST_ZIP; TEST_ZIPS codes are created on demand. */
  zip?: string;
  categoryId?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  mileage?: number;
  description?: string;
  drivable?: boolean;
  /** YYYY-MM-DD; default two days after today in the ZIP's time zone. */
  preferredDate?: string;
  preferredWindow?: PreferredWindow;
  serviceMode?: RequestServiceMode;
  maxGarageDistanceMiles?: number;
  matchedCount?: number;
  /** Default ctx.now. */
  submittedAt?: Date;
  /** Default submittedAt + REQUEST_TTL_DAYS. */
  expiresAt?: Date;
  contactPhone?: string;
  streetAddress?: string | null;
};

export type TestRequest = {
  id: string;
  customerId: string;
  zip: string;
  timeZone: string;
  preferredDate: string;
  submittedAt: string;
  expiresAt: string;
};

type RequestRowOptions = { status: "open" | "booked"; isDemoFixture: boolean };

async function insertRequest(
  ctx: AppContext,
  customer: Viewer,
  input: RequestInput,
  row: RequestRowOptions,
): Promise<TestRequest> {
  const zip = await ensureZip(ctx, input.zip ?? DEFAULT_TEST_ZIP);
  const id = newId();
  const submittedAt = input.submittedAt ?? ctx.now;
  const expiresAt = input.expiresAt ?? addDays(submittedAt, REQUEST_TTL_DAYS);
  const preferredDate = input.preferredDate ?? addDaysToDate(todayInZone(ctx.now, zip.time_zone), 2);
  const nowIso = ctx.now.toISOString();

  await ctx.db
    .insertInto("repair_requests")
    .values({
      id,
      customer_id: customer.id,
      status: row.status,
      zip: zip.zip,
      approx_lat: zip.lat,
      approx_lng: zip.lng,
      area_label: `${zip.city}, ${zip.state} ${zip.zip}`,
      time_zone: zip.time_zone,
      vehicle_year: input.vehicleYear ?? 2016,
      vehicle_make: input.vehicleMake ?? "Toyota",
      vehicle_model: input.vehicleModel ?? "Camry",
      mileage: input.mileage ?? 98_000,
      category_id: input.categoryId ?? "diagnostic_visit",
      description:
        input.description ?? "Grinding noise from the front left wheel when braking at low speed.",
      drivable: input.drivable === false ? 0 : 1,
      preferred_date: preferredDate,
      preferred_window: input.preferredWindow ?? "morning",
      service_mode: input.serviceMode ?? "either",
      max_garage_distance_miles: input.maxGarageDistanceMiles ?? 15,
      matched_count: input.matchedCount ?? 0,
      submitted_at: submittedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_demo_fixture: row.isDemoFixture ? 1 : 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .execute();

  await ctx.db
    .insertInto("request_private")
    .values({
      request_id: id,
      contact_email: customer.email,
      contact_phone: input.contactPhone ?? "602-555-0199",
      street_address: input.streetAddress === undefined ? "123 Test Street" : input.streetAddress,
      address_city: zip.city,
      address_state: zip.state,
      location_notes: null,
      consent_snapshot_json: JSON.stringify(buildConsentSnapshot(REQUEST_CONSENTS, nowIso)),
    })
    .execute();

  return {
    id,
    customerId: customer.id,
    zip: zip.zip,
    timeZone: zip.time_zone,
    preferredDate,
    submittedAt: submittedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/** A submitted request (status open) with its private row and consent snapshot. */
export async function createOpenRequest(
  ctx: AppContext,
  customer: Viewer,
  input: RequestInput = {},
): Promise<TestRequest> {
  return insertRequest(ctx, customer, input, { status: "open", isDemoFixture: false });
}


// ---------------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------------

export type QuoteItemInput = PricedItem & { description?: string };

/** $120.00 labor + $45.50 parts = $165.50. */
export const DEFAULT_QUOTE_ITEMS: readonly QuoteItemInput[] = [
  { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: 12_000 },
  { kind: "part", description: "Parts", quantity: 1, unitPriceCents: 4_550 },
];

export type QuoteInput = {
  requestId: string;
  mechanicId: string;
  items?: readonly QuoteItemInput[];
  /** Default ctx.now + 48 hours. */
  slotStart?: Date;
  durationMinutes?: number;
  /** Default min(ctx.now + 24 hours, slotStart); the schema requires expiresAt <= slotStart. */
  expiresAt?: Date;
  serviceMode?: QuoteServiceMode;
  partsIncluded?: boolean;
  scope?: string;
  /** Move an open request to quoted, as submitting a quote does. Default true. */
  markRequestQuoted?: boolean;
};

export type TestQuote = {
  id: string;
  requestId: string;
  mechanicId: string;
  serviceMode: QuoteServiceMode;
  partsIncluded: boolean;
  scope: string;
  items: readonly QuoteItemInput[];
  totals: QuoteTotals;
  slotStartAt: string;
  slotEndAt: string;
  estimatedDurationMinutes: number;
  expiresAt: string;
};

type QuoteRowOptions = { status: "submitted" | "selected"; isDemoFixture: boolean };

async function insertQuote(ctx: AppContext, input: QuoteInput, row: QuoteRowOptions): Promise<TestQuote> {
  const items = input.items ?? DEFAULT_QUOTE_ITEMS;
  const totals = computeQuoteTotals(items);
  const durationMinutes = input.durationMinutes ?? 90;
  const slotStart = input.slotStart ?? addHours(ctx.now, 48);
  const slotEnd = addMinutes(slotStart, durationMinutes);
  const defaultExpiry = addHours(ctx.now, 24);
  const expiresAt = input.expiresAt ?? (defaultExpiry < slotStart ? defaultExpiry : slotStart);
  const serviceMode = input.serviceMode ?? "mobile";
  const partsIncluded = input.partsIncluded ?? true;
  const scope = input.scope ?? "Inspect and repair as described in the request.";
  const nowIso = ctx.now.toISOString();
  const id = newId();

  await ctx.db
    .insertInto("quotes")
    .values({
      id,
      request_id: input.requestId,
      mechanic_id: input.mechanicId,
      status: row.status,
      service_mode: serviceMode,
      parts_included: partsIncluded ? 1 : 0,
      currency: "USD",
      labor_cents: totals.laborCents,
      parts_cents: totals.partsCents,
      tax_cents: totals.taxCents,
      fee_cents: totals.feeCents,
      total_cents: totals.totalCents,
      slot_start_at: slotStart.toISOString(),
      slot_end_at: slotEnd.toISOString(),
      estimated_duration_minutes: durationMinutes,
      scope,
      exclusions: null,
      notes: null,
      expires_at: expiresAt.toISOString(),
      is_demo_fixture: row.isDemoFixture ? 1 : 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .execute();

  await ctx.db
    .insertInto("quote_items")
    .values(
      items.map((item, index) => ({
        id: newId(),
        quote_id: id,
        kind: item.kind,
        description: item.description ?? item.kind,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        amount_cents: item.quantity * item.unitPriceCents,
        sort_order: index,
      })),
    )
    .execute();

  return {
    id,
    requestId: input.requestId,
    mechanicId: input.mechanicId,
    serviceMode,
    partsIncluded,
    scope,
    items,
    totals,
    slotStartAt: slotStart.toISOString(),
    slotEndAt: slotEnd.toISOString(),
    estimatedDurationMinutes: durationMinutes,
    expiresAt: expiresAt.toISOString(),
  };
}

/** A submitted quote with items; totals come from src/server/pricing.ts. */
export async function createSubmittedQuote(ctx: AppContext, input: QuoteInput): Promise<TestQuote> {
  const quote = await insertQuote(ctx, input, { status: "submitted", isDemoFixture: false });
  if (input.markRequestQuoted ?? true) {
    await ctx.db
      .updateTable("repair_requests")
      .set({ status: "quoted", updated_at: ctx.now.toISOString() })
      .where("id", "=", input.requestId)
      .where("status", "=", "open")
      .execute();
  }
  return quote;
}

// ---------------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------------

export type BookingRowOptions = {
  /** Default "pending_payment"; other statuses are only accepted for demo fixtures. */
  status?: BookingStatus;
  isDemoFixture?: boolean;
  payoutStatus?: PayoutStatus;
  /** Replace the default snapshots, e.g. with the bookings module's own snapshot builder. */
  quoteSnapshotJson?: string;
  consentSnapshotJson?: string;
};

/** A stand-in for the snapshot selectQuote stores: the quote's terms, items and totals. */
export function defaultQuoteSnapshot(quote: TestQuote): Record<string, unknown> {
  return {
    quote: {
      id: quote.id,
      serviceMode: quote.serviceMode,
      partsIncluded: quote.partsIncluded,
      scope: quote.scope,
      slotStartAt: quote.slotStartAt,
      slotEndAt: quote.slotEndAt,
      estimatedDurationMinutes: quote.estimatedDurationMinutes,
      expiresAt: quote.expiresAt,
    },
    items: quote.items.map((item) => ({
      kind: item.kind,
      description: item.description ?? item.kind,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      amountCents: item.quantity * item.unitPriceCents,
    })),
    totals: quote.totals,
  };
}

/**
 * Column values for a booking that matches `quote` exactly, with money from pricing.ts.
 * Tests can alter fields before inserting to probe the database guards.
 */
export function bookingRowFor(
  ctx: AppContext,
  quote: TestQuote,
  customerId: string,
  options: BookingRowOptions = {},
): Insertable<Bookings> & { id: string; total_cents: number; labor_cents: number; parts_cents: number } {
  const money = computeBookingMoney(quote.totals);
  const status = options.status ?? "pending_payment";
  const fixture = options.isDemoFixture ?? false;
  const nowIso = ctx.now.toISOString();
  const started = status === "in_progress" || status === "completed" || status === "disputed";
  return {
    id: newId(),
    request_id: quote.requestId,
    quote_id: quote.id,
    customer_id: customerId,
    mechanic_id: quote.mechanicId,
    status,
    payment_state: fixture ? "demo_fixture_no_real_payment" : "stripe_not_connected",
    payout_status: options.payoutStatus ?? "not_eligible",
    service_mode: quote.serviceMode,
    slot_start_at: quote.slotStartAt,
    slot_end_at: quote.slotEndAt,
    currency: "USD",
    labor_cents: money.laborCents,
    parts_cents: money.partsCents,
    tax_cents: money.taxCents,
    fee_cents: money.feeCents,
    total_cents: money.totalCents,
    platform_fee_bps: money.platformFeeBps,
    platform_fee_cents: money.platformFeeCents,
    mechanic_payout_cents: money.mechanicPayoutCents,
    quote_snapshot_json: options.quoteSnapshotJson ?? JSON.stringify(defaultQuoteSnapshot(quote)),
    consent_snapshot_json:
      options.consentSnapshotJson ?? JSON.stringify(buildConsentSnapshot(BOOKING_CONSENTS, nowIso)),
    is_demo_fixture: fixture ? 1 : 0,
    created_at: nowIso,
    updated_at: nowIso,
    confirmed_at: fixture && status !== "pending_payment" ? nowIso : null,
    started_at: started ? nowIso : null,
    completed_at: status === "completed" || status === "disputed" ? nowIso : null,
    cancelled_at: status === "cancelled" ? nowIso : null,
  };
}

export type TestBooking = BookingMoney & {
  id: string;
  requestId: string;
  quoteId: string;
  customerId: string;
  mechanicId: string;
};

/** Inserts only the booking row (no quote or request status changes). */
export async function insertBooking(
  ctx: AppContext,
  input: { quote: TestQuote; customerId: string } & BookingRowOptions,
): Promise<TestBooking> {
  const row = bookingRowFor(ctx, input.quote, input.customerId, input);
  await ctx.db.insertInto("bookings").values(row).execute();
  return {
    id: row.id,
    requestId: input.quote.requestId,
    quoteId: input.quote.id,
    customerId: input.customerId,
    mechanicId: input.quote.mechanicId,
    ...computeBookingMoney(input.quote.totals),
  };
}

/**
 * What selecting a quote produces (without the domain command): a pending_payment booking
 * matching the quote, the quote selected, other submitted quotes declined, request reserved.
 */
export async function createPendingBooking(
  ctx: AppContext,
  input: { quote: TestQuote; customer: Viewer } & Pick<
    BookingRowOptions,
    "quoteSnapshotJson" | "consentSnapshotJson"
  >,
): Promise<TestBooking> {
  const { quote } = input;
  const booking = await insertBooking(ctx, {
    quote,
    customerId: input.customer.id,
    quoteSnapshotJson: input.quoteSnapshotJson,
    consentSnapshotJson: input.consentSnapshotJson,
  });
  const nowIso = ctx.now.toISOString();
  await ctx.db
    .updateTable("quotes")
    .set({ status: "selected", updated_at: nowIso })
    .where("id", "=", quote.id)
    .execute();
  await ctx.db
    .updateTable("quotes")
    .set({ status: "declined", updated_at: nowIso })
    .where("request_id", "=", quote.requestId)
    .where("status", "=", "submitted")
    .execute();
  await ctx.db
    .updateTable("repair_requests")
    .set({ status: "reserved", updated_at: nowIso })
    .where("id", "=", quote.requestId)
    .execute();
  return booking;
}

export type DemoBookingInput = {
  customer: Viewer;
  mechanic: Viewer;
  /** Default "confirmed". */
  status?: Exclude<BookingStatus, "pending_payment">;
  payoutStatus?: PayoutStatus;
  request?: RequestInput;
  items?: readonly QuoteItemInput[];
  /** Default ctx.now + 48 hours. */
  slotStart?: Date;
  serviceMode?: QuoteServiceMode;
  quoteSnapshotJson?: string;
  consentSnapshotJson?: string;
};

export type TestDemoBooking = TestBooking & { request: TestRequest; quote: TestQuote };

/**
 * A clearly flagged demo fixture (is_demo_fixture = 1 on request, quote and booking) inserted
 * directly in its final state, the way the seed creates post-booking examples. Real
 * bookings can never reach these states while payments are not connected.
 */
export async function createDemoFixtureBooking(
  ctx: AppContext,
  input: DemoBookingInput,
): Promise<TestDemoBooking> {
  const request = await insertRequest(ctx, input.customer, input.request ?? {}, {
    status: "booked",
    isDemoFixture: true,
  });
  const slotStart = input.slotStart ?? addHours(ctx.now, 48);
  const quote = await insertQuote(
    ctx,
    {
      requestId: request.id,
      mechanicId: input.mechanic.id,
      items: input.items,
      slotStart,
      expiresAt: slotStart,
      serviceMode: input.serviceMode,
    },
    { status: "selected", isDemoFixture: true },
  );
  const booking = await insertBooking(ctx, {
    quote,
    customerId: input.customer.id,
    status: input.status ?? "confirmed",
    isDemoFixture: true,
    payoutStatus: input.payoutStatus,
    quoteSnapshotJson: input.quoteSnapshotJson,
    consentSnapshotJson: input.consentSnapshotJson,
  });
  return { ...booking, request, quote };
}
