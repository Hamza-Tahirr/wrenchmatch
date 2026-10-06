import "server-only";

import type { Kysely } from "kysely";

import {
  BOOKING_STATUSES,
  JOB_MATCH_STATUSES,
  PREFERRED_WINDOWS,
  QUOTE_SERVICE_MODE_INFO,
  QUOTE_SERVICE_MODES,
  QUOTE_STATUS_INFO,
  QUOTE_STATUSES,
  REQUEST_SERVICE_MODE_INFO,
  REQUEST_SERVICE_MODES,
  REQUEST_STATUSES,
  type BadgeTone,
  type BookingStatus,
  type JobMatchStatus,
  type PreferredWindow,
  type QuoteServiceMode,
  type QuoteStatus,
  type RequestServiceMode,
} from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import {
  DEFAULT_QUOTE_DURATION_MINUTES,
  DEFAULT_QUOTE_VALIDITY_HOURS,
  QUOTE_VALIDITY_OPTIONS,
  type QuoteFormValues,
  type QuoteValidityHours,
} from "@/lib/validation/quote";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { DomainError } from "@/server/errors";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { QUOTE_ITEM_KINDS, type QuoteItemKind } from "@/server/pricing";

import { assertMechanic, loadMechanicState, oneOf, type MechanicState } from "./access";
import { listBookingSummaries, type MyBookingSummary } from "./bookings";
import { insuranceCovers, jobEligibility, type JobEligibility } from "./eligibility";
import {
  availabilityInfo,
  excerpt,
  isRequestOpenForQuotes,
  jobAvailability,
  preferredTimeLabel,
  timeZoneName,
  vehicleLabel,
  type JobAvailability,
} from "./labels";
import { approxPoint, mapBase, type ApproxPoint, type MechanicMapBase } from "./map";
import { earliestAllowedStart, latestAllowedStart, suggestedStart, toLocalInput } from "./quote-rules";
import { allowedQuoteModes } from "./service-modes";

// The mechanic job board and job detail. Only coarse request fields are ever selected here:
// never the customer's contact details, exact address or video id (the privacy matrix in
// docs/ARCHITECTURE.md section 8). A request reserved by another mechanic, cancelled or
// expired reads "No longer available" without saying why or who.

export type JobCard = {
  requestId: string;
  matchStatus: JobMatchStatus;
  /** When this mechanic was notified (job_matches.notified_at). */
  matchedAt: string;
  categoryId: string;
  categoryName: string;
  safetySensitive: boolean;
  vehicle: { year: number; make: string; model: string; label: string };
  mileage: number;
  descriptionExcerpt: string;
  /** Coarse area, e.g. "Phoenix, AZ 85004". */
  areaLabel: string;
  /** Approximate miles between ZIP centroids (show with formatMiles). */
  distanceMiles: number;
  /** The request ZIP's centroid for maps: an approximate area, never the address. */
  approxPoint: ApproxPoint;
  preferredDate: string;
  preferredWindow: PreferredWindow;
  /** "Wed, Oct 7, 2026 · Morning (8 AM–12 PM)" */
  preferredTimeLabel: string;
  serviceMode: RequestServiceMode;
  serviceModeLabel: string;
  drivable: boolean;
  /** Photos the mechanic may open (sanitized, shared before booking). */
  photoCount: number;
  /** A video exists; it is available only after a confirmed booking. */
  hasVideo: boolean;
  timeZone: string;
  availability: JobAvailability;
  availabilityLabel: string;
  availabilityTone: BadgeTone;
  /** This mechanic's latest quote on the request, if any. */
  myQuote: { id: string; status: QuoteStatus; totalCents: number; expiresAt: string } | null;
  isDemoFixture: boolean;
};

export type MyQuoteSummary = {
  id: string;
  requestId: string;
  /** Effective status: a submitted quote past its expiry (or its request's) reads "expired". */
  status: QuoteStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  categoryName: string;
  vehicleLabel: string;
  areaLabel: string;
  /** The request ZIP's centroid for maps (approximate). */
  approxPoint: ApproxPoint;
  timeZone: string;
  serviceMode: QuoteServiceMode;
  serviceModeLabel: string;
  partsIncluded: boolean;
  currency: "USD";
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  slotStartAt: string;
  slotEndAt: string;
  estimatedDurationMinutes: number;
  expiresAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  /** The booking created when the customer selected this quote. */
  bookingId: string | null;
  canWithdraw: boolean;
  isDemoFixture: boolean;
};

export type JobBoard = {
  eligibility: JobEligibility;
  /** The mechanic's base ZIP centroid and travel radius for the map; null before applying. */
  base: MechanicMapBase | null;
  /** Matches not acted on yet (empty unless eligibility.canReceiveJobs). */
  newMatches: JobCard[];
  /** Matches marked interested or quoted (empty unless eligibility.canReceiveJobs). */
  interested: JobCard[];
  /** All of the mechanic's quotes, newest first (own records, shown in every status). */
  quotes: MyQuoteSummary[];
  /** Pending-payment reservations and seeded bookings (own records, shown in every status). */
  bookings: MyBookingSummary[];
};

/** Board order: jobs the mechanic can still act on, then reserved, booked and closed ones. */
const AVAILABLE_FIRST: Readonly<Record<JobAvailability, number>> = {
  open: 0,
  quoted_by_you: 0,
  selected_pending_payment: 1,
  booked_with_you: 2,
  unavailable: 3,
};

const notFound = () => new DomainError("not_found", "That job wasn't found.");

function effectiveQuoteStatus(
  status: QuoteStatus,
  expiresAt: string,
  requestOpen: boolean,
  requestStatus: string,
  nowIso: string,
): QuoteStatus {
  if (status !== "submitted") return status;
  // A submitted quote dies with its request (expiry or cancellation) or at its own expiry.
  if (expiresAt <= nowIso || (!requestOpen && requestStatus !== "reserved" && requestStatus !== "booked")) {
    return "expired";
  }
  return status;
}

async function loadQuoteSummaries(
  db: Kysely<DB>,
  mechanicId: string,
  nowIso: string,
  requestId?: string,
): Promise<MyQuoteSummary[]> {
  let query = db
    .selectFrom("quotes as q")
    .innerJoin("repair_requests as r", "r.id", "q.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .leftJoin("bookings as b", "b.quote_id", "q.id")
    .select([
      "q.id",
      "q.request_id",
      "q.status",
      "q.service_mode",
      "q.parts_included",
      "q.labor_cents",
      "q.parts_cents",
      "q.tax_cents",
      "q.fee_cents",
      "q.total_cents",
      "q.slot_start_at",
      "q.slot_end_at",
      "q.estimated_duration_minutes",
      "q.expires_at",
      "q.created_at",
      "q.withdrawn_at",
      "q.is_demo_fixture",
      "r.status as request_status",
      "r.expires_at as request_expires_at",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.area_label",
      "r.approx_lat",
      "r.approx_lng",
      "r.time_zone",
      "c.name as category_name",
      "b.id as booking_id",
    ])
    .where("q.mechanic_id", "=", mechanicId)
    .orderBy("q.created_at", "desc")
    .orderBy("q.id")
    .limit(200);
  if (requestId !== undefined) query = query.where("q.request_id", "=", requestId);
  const rows = await query.execute();

  return rows.map((row) => {
    const requestStatus = oneOf(REQUEST_STATUSES, row.request_status, "repair_requests.status");
    const requestOpen = isRequestOpenForQuotes(requestStatus, row.request_expires_at, nowIso);
    const status = effectiveQuoteStatus(
      oneOf(QUOTE_STATUSES, row.status, "quotes.status"),
      row.expires_at,
      requestOpen,
      requestStatus,
      nowIso,
    );
    const serviceMode = oneOf(QUOTE_SERVICE_MODES, row.service_mode, "quotes.service_mode");
    return {
      id: row.id,
      requestId: row.request_id,
      status,
      // A cancelled reservation declines its quote too; say what happened instead of "Not selected".
      statusLabel: status === "declined" && row.booking_id ? "Reservation cancelled" : QUOTE_STATUS_INFO[status].label,
      statusTone: QUOTE_STATUS_INFO[status].tone,
      categoryName: row.category_name,
      vehicleLabel: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
      areaLabel: row.area_label,
      approxPoint: approxPoint(row.approx_lat, row.approx_lng),
      timeZone: row.time_zone,
      serviceMode,
      serviceModeLabel: QUOTE_SERVICE_MODE_INFO[serviceMode].label,
      partsIncluded: row.parts_included === 1,
      currency: "USD",
      laborCents: row.labor_cents,
      partsCents: row.parts_cents,
      taxCents: row.tax_cents,
      feeCents: row.fee_cents,
      totalCents: row.total_cents,
      slotStartAt: row.slot_start_at,
      slotEndAt: row.slot_end_at,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      withdrawnAt: row.withdrawn_at,
      bookingId: row.booking_id,
      canWithdraw: status === "submitted",
      isDemoFixture: row.is_demo_fixture === 1,
    };
  });
}

type MediaCounts = { photoCount: number; hasVideo: boolean };

async function loadMediaCounts(db: Kysely<DB>, requestIds: readonly string[]): Promise<Map<string, MediaCounts>> {
  const counts = new Map<string, MediaCounts>();
  if (requestIds.length === 0) return counts;
  const rows = await db
    .selectFrom("request_media")
    .select(["request_id", "kind", "shareable_before_booking"])
    .where("request_id", "in", requestIds)
    .execute();
  for (const row of rows) {
    const entry = counts.get(row.request_id) ?? { photoCount: 0, hasVideo: false };
    if (row.kind === "photo" && row.shareable_before_booking === 1) entry.photoCount += 1;
    if (row.kind === "video") entry.hasVideo = true;
    counts.set(row.request_id, entry);
  }
  return counts;
}

/** Status of the booking on each request that is with this mechanic. */
async function loadMyBookingStatuses(
  db: Kysely<DB>,
  mechanicId: string,
  requestIds: readonly string[],
): Promise<Map<string, BookingStatus>> {
  if (requestIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("bookings")
    .select(["request_id", "status"])
    .where("mechanic_id", "=", mechanicId)
    .where("request_id", "in", requestIds)
    .execute();
  return new Map(rows.map((row) => [row.request_id, oneOf(BOOKING_STATUSES, row.status, "bookings.status")]));
}

function distanceFrom(state: MechanicState, lat: number, lng: number): number {
  return roundMiles(haversineMiles({ lat, lng }, state.basePoint));
}

async function loadJobCards(
  db: Kysely<DB>,
  state: MechanicState,
  quotes: readonly MyQuoteSummary[],
  nowIso: string,
): Promise<JobCard[]> {
  const rows = await db
    .selectFrom("job_matches as jm")
    .innerJoin("repair_requests as r", "r.id", "jm.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "jm.status as match_status",
      "jm.notified_at",
      "r.id as request_id",
      "r.status as request_status",
      "r.expires_at",
      "r.category_id",
      "c.name as category_name",
      "c.safety_sensitive",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.mileage",
      "r.description",
      "r.area_label",
      "r.approx_lat",
      "r.approx_lng",
      "r.preferred_date",
      "r.preferred_window",
      "r.service_mode",
      "r.drivable",
      "r.time_zone",
      "r.is_demo_fixture",
    ])
    .where("jm.mechanic_id", "=", state.id)
    .where("jm.status", "in", ["notified", "interested", "quoted"])
    .orderBy("jm.notified_at", "desc")
    .orderBy("jm.id")
    .limit(200)
    .execute();

  const requestIds = rows.map((row) => row.request_id);
  const media = await loadMediaCounts(db, requestIds);
  const myBookings = await loadMyBookingStatuses(db, state.id, requestIds);
  // Quotes are newest first, so the first one per request is the latest.
  const latestQuote = new Map<string, MyQuoteSummary>();
  for (const quote of quotes) if (!latestQuote.has(quote.requestId)) latestQuote.set(quote.requestId, quote);

  const cards = rows.map((row): JobCard => {
    const quote = latestQuote.get(row.request_id) ?? null;
    const availability = jobAvailability({
      requestStatus: oneOf(REQUEST_STATUSES, row.request_status, "repair_requests.status"),
      requestExpiresAt: row.expires_at,
      nowIso,
      hasActiveQuote: quote?.status === "submitted",
      myBookingStatus: myBookings.get(row.request_id) ?? null,
    });
    const info = availabilityInfo(availability);
    const preferredWindow = oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window");
    const serviceMode = oneOf(REQUEST_SERVICE_MODES, row.service_mode, "repair_requests.service_mode");
    const counts = media.get(row.request_id) ?? { photoCount: 0, hasVideo: false };
    return {
      requestId: row.request_id,
      matchStatus: oneOf(JOB_MATCH_STATUSES, row.match_status, "job_matches.status"),
      matchedAt: row.notified_at,
      categoryId: row.category_id,
      categoryName: row.category_name,
      safetySensitive: row.safety_sensitive === 1,
      vehicle: {
        year: row.vehicle_year,
        make: row.vehicle_make,
        model: row.vehicle_model,
        label: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
      },
      mileage: row.mileage,
      descriptionExcerpt: excerpt(row.description),
      areaLabel: row.area_label,
      distanceMiles: distanceFrom(state, row.approx_lat, row.approx_lng),
      approxPoint: approxPoint(row.approx_lat, row.approx_lng),
      preferredDate: row.preferred_date,
      preferredWindow,
      preferredTimeLabel: preferredTimeLabel(row.preferred_date, preferredWindow),
      serviceMode,
      serviceModeLabel: REQUEST_SERVICE_MODE_INFO[serviceMode].label,
      drivable: row.drivable === 1,
      photoCount: counts.photoCount,
      hasVideo: counts.hasVideo,
      timeZone: row.time_zone,
      availability,
      availabilityLabel: info.label,
      availabilityTone: info.tone,
      myQuote: quote ? { id: quote.id, status: quote.status, totalCents: quote.totalCents, expiresAt: quote.expiresAt } : null,
      isDemoFixture: row.is_demo_fixture === 1,
    };
  });
  return cards.sort((a, b) => {
    const rank = AVAILABLE_FIRST[a.availability] - AVAILABLE_FIRST[b.availability];
    if (rank !== 0) return rank;
    return a.matchedAt < b.matchedAt ? 1 : a.matchedAt > b.matchedAt ? -1 : 0;
  });
}

/**
 * The signed-in mechanic's job board. New and interested job cards appear only while the
 * mechanic can receive jobs (approved, insured through today, accepting jobs); otherwise
 * `eligibility` explains why. Quotes and bookings are the mechanic's own records and are
 * always listed (a suspended mechanic still sees them, with coarse request labels only).
 */
export async function listMyJobs(ctx: AppContext, viewer: Viewer): Promise<JobBoard> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  const state = await loadMechanicState(ctx.db, viewer.id);
  if (!state) {
    return {
      eligibility: jobEligibility(null, nowIso.slice(0, 10)),
      base: null,
      newMatches: [],
      interested: [],
      quotes: [],
      bookings: [],
    };
  }
  const eligibility = jobEligibility(state, todayInZone(ctx.now, state.timeZone));
  const quotes = await loadQuoteSummaries(ctx.db, state.id, nowIso);
  const bookings = await listBookingSummaries(ctx.db, state.id);
  const cards = eligibility.canReceiveJobs ? await loadJobCards(ctx.db, state, quotes, nowIso) : [];
  return {
    eligibility,
    base: mapBase(state),
    newMatches: cards.filter((card) => card.matchStatus === "notified"),
    interested: cards.filter((card) => card.matchStatus !== "notified"),
    quotes,
    bookings,
  };
}

// ---------------------------------------------------------------------------------
// Job detail
// ---------------------------------------------------------------------------------

export type MyQuoteLine = {
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type MyQuoteDetail = MyQuoteSummary & {
  scope: string;
  exclusions: string | null;
  notes: string | null;
  /** Labor first, then parts, taxes and fees (the order they were entered). */
  items: MyQuoteLine[];
};

export type QuoteFormDefaults = {
  /** The request's IANA zone: the datetime-local input is read in this zone. */
  timeZone: string;
  /** e.g. "MST" */
  timeZoneLabel: string;
  /** min/max for the datetime-local input. */
  earliestStartLocal: string;
  latestStartLocal: string;
  validityOptions: ReadonlyArray<{ hours: QuoteValidityHours; label: string }>;
  allowedServiceModes: Array<{ value: QuoteServiceMode; label: string; description: string }>;
  /** The quote can't stay valid past the request's own expiry. */
  requestExpiresAt: string | null;
  /** The offered time must fall on or before this date (null when no insurance is on file). */
  insuranceExpiresOn: string | null;
  /** Initial form values (suggested start, default duration and validity, one blank part row). */
  values: QuoteFormValues;
};

export type JobDetail = {
  requestId: string;
  matchStatus: JobMatchStatus;
  matchedAt: string;
  category: {
    id: string;
    name: string;
    shortDescription: string;
    /** e.g. "A code read is not a full diagnosis..." */
    customerNotice: string | null;
    safetySensitive: boolean;
  };
  vehicle: { year: number; make: string; model: string; label: string };
  mileage: number;
  description: string;
  areaLabel: string;
  distanceMiles: number;
  /** The request ZIP's centroid for the map: an approximate area, never the address. */
  approxPoint: ApproxPoint;
  /** The mechanic's own base ZIP centroid and travel radius, for the distance on the map. */
  base: MechanicMapBase;
  preferredDate: string;
  preferredWindow: PreferredWindow;
  preferredTimeLabel: string;
  serviceMode: RequestServiceMode;
  serviceModeLabel: string;
  /** How far the customer will drive to a garage. */
  maxGarageDistanceMiles: number;
  drivable: boolean;
  timeZone: string;
  submittedAt: string | null;
  expiresAt: string | null;
  /** Sanitized photos shared before booking: show with /api/files/<fileId>. */
  photos: Array<{ fileId: string }>;
  hasVideo: boolean;
  /** "Video attached - available after a confirmed booking" when there is one. */
  videoNotice: string | null;
  availability: JobAvailability;
  availabilityLabel: string;
  availabilityTone: BadgeTone;
  isDemoFixture: boolean;
  /** The active quote, else the latest one; null when the mechanic has not quoted. */
  myQuote: MyQuoteDetail | null;
  /** Every quote this mechanic sent on the request, newest first. */
  quoteHistory: MyQuoteDetail[];
  /** The booking with this mechanic, when the customer selected their quote. */
  myBookingId: string | null;
  actions: {
    canMarkInterested: boolean;
    canPass: boolean;
    canQuote: boolean;
    /** Why a quote can't be sent now (shown instead of the form). */
    quoteBlockedReason: string | null;
    /** The quote that can be withdrawn, if any. */
    withdrawableQuoteId: string | null;
  };
  /** Present only when canQuote. */
  quoteForm: QuoteFormDefaults | null;
};

export const VIDEO_NOTICE = "Video attached - available after a confirmed booking.";

async function loadQuoteDetails(db: Kysely<DB>, mechanicId: string, requestId: string, nowIso: string): Promise<MyQuoteDetail[]> {
  const summaries = await loadQuoteSummaries(db, mechanicId, nowIso, requestId);
  if (summaries.length === 0) return [];
  const ids = summaries.map((quote) => quote.id);
  const terms = await db
    .selectFrom("quotes")
    .select(["id", "scope", "exclusions", "notes"])
    .where("id", "in", ids)
    .execute();
  const items = await db
    .selectFrom("quote_items")
    .select(["quote_id", "kind", "description", "quantity", "unit_price_cents", "amount_cents"])
    .where("quote_id", "in", ids)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
  const termsById = new Map(terms.map((row) => [row.id, row]));
  const itemsByQuote = Map.groupBy(items, (item) => item.quote_id);
  return summaries.map((summary) => {
    const term = termsById.get(summary.id);
    return {
      ...summary,
      scope: term?.scope ?? "",
      exclusions: term?.exclusions ?? null,
      notes: term?.notes ?? null,
      items: (itemsByQuote.get(summary.id) ?? []).map((item) => ({
        kind: oneOf(QUOTE_ITEM_KINDS, item.kind, "quote_items.kind"),
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        amountCents: item.amount_cents,
      })),
    };
  });
}

type QuoteBlockInput = {
  state: MechanicState;
  matchStatus: JobMatchStatus;
  availability: JobAvailability;
  todayLocal: string;
  preferredDate: string;
  categoryName: string;
  safetySensitive: boolean;
  safetyApproved: boolean;
  allowedModes: readonly QuoteServiceMode[];
  distanceMiles: number;
};

/** Why this mechanic can't quote this job now, or null when they can. */
function quoteBlockedReason(input: QuoteBlockInput): string | null {
  switch (input.availability) {
    case "quoted_by_you":
      return "You already have an active quote on this job. Withdraw it if you want to send a different one.";
    case "selected_pending_payment":
      return "The customer selected your quote. The booking is waiting for the customer's payment, and online payments are coming soon.";
    case "booked_with_you":
      return "This job is booked with you.";
    case "unavailable":
      return "This job is no longer available.";
    case "open":
      break;
  }
  if (input.matchStatus === "passed") return "You passed on this job. Mark yourself interested to send a quote.";
  if (!input.state.acceptingJobs) {
    return "You've paused new jobs. Turn on Accepting jobs on your profile to send quotes.";
  }
  if (!insuranceCovers(input.state, input.todayLocal, input.preferredDate)) {
    return "Your insurance doesn't cover the customer's preferred date. Update your insurance on your profile to quote.";
  }
  if (input.safetySensitive && !input.safetyApproved) {
    return `${input.categoryName} is safety-critical work. An admin must approve you for it before you can quote.`;
  }
  if (input.allowedModes.length === 0) {
    return `Your current service modes and travel radius don't cover this job (about ${Math.round(input.distanceMiles)} mi away). Update your profile to quote it.`;
  }
  return null;
}

function emptyQuoteValues(startLocal: string, serviceMode: QuoteServiceMode | null): QuoteFormValues {
  return {
    laborPrice: "",
    partsIncluded: "",
    parts: [{ description: "", quantity: "1", unitPrice: "" }],
    taxes: [],
    fees: [],
    earliestStart: startLocal,
    durationMinutes: String(DEFAULT_QUOTE_DURATION_MINUTES),
    serviceMode: serviceMode ?? "",
    scope: "",
    exclusions: "",
    notes: "",
    validityHours: String(DEFAULT_QUOTE_VALIDITY_HOURS),
  };
}

/**
 * One matched job with the coarse request details, shareable photos and this mechanic's
 * quotes, plus the quote form's defaults. Requires a job match for this mechanic (otherwise
 * DomainError "not_found") and an approved account: a matched mechanic who is not approved
 * (applied, rejected or suspended) gets DomainError "mechanic_not_eligible" with the reason
 * and no request details.
 */
export async function getJobDetail(ctx: AppContext, viewer: Viewer, requestId: string): Promise<JobDetail> {
  assertMechanic(viewer);
  const match = await ctx.db
    .selectFrom("job_matches")
    .select(["status", "notified_at"])
    .where("request_id", "=", requestId)
    .where("mechanic_id", "=", viewer.id)
    .executeTakeFirst();
  if (!match) throw notFound();
  const state = await loadMechanicState(ctx.db, viewer.id);
  if (!state) throw notFound();
  if (state.status !== "approved") {
    const eligibility = jobEligibility(state, todayInZone(ctx.now, state.timeZone));
    throw new DomainError("mechanic_not_eligible", eligibility.message, { reason: eligibility.reason ?? null });
  }

  const request = await ctx.db
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "r.id",
      "r.status",
      "r.expires_at",
      "r.submitted_at",
      "r.category_id",
      "c.name as category_name",
      "c.short_description",
      "c.customer_notice",
      "c.safety_sensitive",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.mileage",
      "r.description",
      "r.area_label",
      "r.approx_lat",
      "r.approx_lng",
      "r.preferred_date",
      "r.preferred_window",
      "r.service_mode",
      "r.max_garage_distance_miles",
      "r.drivable",
      "r.time_zone",
      "r.is_demo_fixture",
    ])
    .where("r.id", "=", requestId)
    .executeTakeFirst();
  if (!request) throw notFound();

  const nowIso = ctx.now.toISOString();
  const media = await ctx.db
    .selectFrom("request_media")
    .select(["file_id", "kind", "shareable_before_booking"])
    .where("request_id", "=", requestId)
    .orderBy("created_at")
    .orderBy("file_id")
    .execute();
  const quoteHistory = await loadQuoteDetails(ctx.db, viewer.id, requestId, nowIso);
  const activeQuote = quoteHistory.find((quote) => quote.status === "submitted" || quote.status === "selected");
  const myBooking = await ctx.db
    .selectFrom("bookings")
    .select(["id", "status"])
    .where("request_id", "=", requestId)
    .where("mechanic_id", "=", viewer.id)
    .executeTakeFirst();
  const myBookingStatus = myBooking ? oneOf(BOOKING_STATUSES, myBooking.status, "bookings.status") : null;
  const safety = await ctx.db
    .selectFrom("mechanic_services")
    .select("safety_approved")
    .where("mechanic_id", "=", viewer.id)
    .where("category_id", "=", request.category_id)
    .executeTakeFirst();

  const matchStatus = oneOf(JOB_MATCH_STATUSES, match.status, "job_matches.status");
  const requestStatus = oneOf(REQUEST_STATUSES, request.status, "repair_requests.status");
  const availability = jobAvailability({
    requestStatus,
    requestExpiresAt: request.expires_at,
    nowIso,
    hasActiveQuote: quoteHistory.some((quote) => quote.status === "submitted"),
    myBookingStatus,
  });
  const info = availabilityInfo(availability);
  const preferredWindow = oneOf(PREFERRED_WINDOWS, request.preferred_window, "repair_requests.preferred_window");
  const serviceMode = oneOf(REQUEST_SERVICE_MODES, request.service_mode, "repair_requests.service_mode");
  const distanceMiles = distanceFrom(state, request.approx_lat, request.approx_lng);
  const allowedModes = allowedQuoteModes({
    requestMode: serviceMode,
    maxGarageDistanceMiles: request.max_garage_distance_miles,
    mechanicMode: state.serviceMode,
    travelRadiusMiles: state.travelRadiusMiles,
    distanceMiles,
  });
  const todayLocal = todayInZone(ctx.now, request.time_zone);
  const blockedReason = quoteBlockedReason({
    state,
    matchStatus,
    availability,
    todayLocal,
    preferredDate: request.preferred_date,
    categoryName: request.category_name,
    safetySensitive: request.safety_sensitive === 1,
    safetyApproved: safety?.safety_approved === 1,
    allowedModes,
    distanceMiles,
  });
  const requestOpen = availability !== "unavailable" && availability !== "booked_with_you";
  const hasVideo = media.some((entry) => entry.kind === "video");

  let quoteForm: QuoteFormDefaults | null = null;
  if (blockedReason === null) {
    const suggested = suggestedStart(request.preferred_date, preferredWindow, request.time_zone, ctx.now);
    quoteForm = {
      timeZone: request.time_zone,
      timeZoneLabel: timeZoneName(suggested, request.time_zone),
      earliestStartLocal: toLocalInput(earliestAllowedStart(ctx.now), request.time_zone),
      latestStartLocal: toLocalInput(latestAllowedStart(ctx.now), request.time_zone),
      validityOptions: QUOTE_VALIDITY_OPTIONS,
      allowedServiceModes: allowedModes.map((mode) => ({ value: mode, ...QUOTE_SERVICE_MODE_INFO[mode] })),
      requestExpiresAt: request.expires_at,
      insuranceExpiresOn: state.insuranceExpiresOn,
      values: emptyQuoteValues(toLocalInput(suggested, request.time_zone), allowedModes.length === 1 ? allowedModes[0] : null),
    };
  }

  return {
    requestId: request.id,
    matchStatus,
    matchedAt: match.notified_at,
    category: {
      id: request.category_id,
      name: request.category_name,
      shortDescription: request.short_description,
      customerNotice: request.customer_notice,
      safetySensitive: request.safety_sensitive === 1,
    },
    vehicle: {
      year: request.vehicle_year,
      make: request.vehicle_make,
      model: request.vehicle_model,
      label: vehicleLabel(request.vehicle_year, request.vehicle_make, request.vehicle_model),
    },
    mileage: request.mileage,
    description: request.description,
    areaLabel: request.area_label,
    distanceMiles,
    approxPoint: approxPoint(request.approx_lat, request.approx_lng),
    base: mapBase(state),
    preferredDate: request.preferred_date,
    preferredWindow,
    preferredTimeLabel: preferredTimeLabel(request.preferred_date, preferredWindow),
    serviceMode,
    serviceModeLabel: REQUEST_SERVICE_MODE_INFO[serviceMode].label,
    maxGarageDistanceMiles: request.max_garage_distance_miles,
    drivable: request.drivable === 1,
    timeZone: request.time_zone,
    submittedAt: request.submitted_at,
    expiresAt: request.expires_at,
    photos: media
      .filter((entry) => entry.kind === "photo" && entry.shareable_before_booking === 1)
      .map((entry) => ({ fileId: entry.file_id })),
    hasVideo,
    videoNotice: hasVideo ? VIDEO_NOTICE : null,
    availability,
    availabilityLabel: info.label,
    availabilityTone: info.tone,
    isDemoFixture: request.is_demo_fixture === 1,
    myQuote: activeQuote ?? quoteHistory[0] ?? null,
    quoteHistory,
    myBookingId: myBooking?.id ?? null,
    actions: {
      canMarkInterested: requestOpen && (matchStatus === "notified" || matchStatus === "passed") && !activeQuote,
      canPass: requestOpen && matchStatus !== "passed" && !activeQuote,
      canQuote: blockedReason === null,
      quoteBlockedReason: blockedReason,
      withdrawableQuoteId: quoteHistory.find((quote) => quote.canWithdraw)?.id ?? null,
    },
    quoteForm,
  };
}
