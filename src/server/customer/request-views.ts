import "server-only";

import { sql, type Kysely } from "kysely";

import {
  BOOKING_STATUS_INFO,
  BOOKING_STATUSES,
  PREFERRED_WINDOW_INFO,
  PREFERRED_WINDOWS,
  REQUEST_SERVICE_MODE_INFO,
  REQUEST_SERVICE_MODES,
  REQUEST_STATUS_INFO,
  REQUEST_STATUSES,
  type BadgeTone,
  type BookingStatus,
  type PreferredWindow,
  type QuoteStatus,
  type RequestServiceMode,
  type RequestStatus,
  type StatusInfo,
} from "@/lib/domain";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";

import { notFound } from "./access";
import {
  buildQuoteComparison,
  loadQuoteRows,
  storedQuoteStatus,
  summarizeQuotes,
  type QuoteComparisonItem,
  type QuoteComparisonSummary,
  type StoredQuoteRow,
} from "./quotes";
import { buildRequestTimeline, type RequestTimelineEvent } from "./request-timeline";
import { groupBy, oneOf, requestTitle, vehicleLabel } from "./rows";
import { parseConsentRecord, type ConsentRecord } from "./snapshots";
import { effectiveQuoteStatus, effectiveRequestStatus, isRequestExpired } from "./status";

// Read models for the customer's own repair requests: the list on /quotes and the account
// page, and the detail page /requests/[id]. Every query is scoped to viewer.id.

export type RequestBookingSummary = {
  id: string;
  status: BookingStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  isDemoFixture: boolean;
  totalCents: number;
  currency: string;
  createdAt: string;
};

export type RequestSummary = {
  id: string;
  /** "Battery replacement · 2016 Honda Civic" */
  title: string;
  categoryId: string;
  categoryName: string;
  vehicle: { year: number; make: string; model: string; mileage: number; label: string };
  /** The first 140 characters of the description. */
  descriptionPreview: string;
  /** "Tempe, AZ 85281" */
  areaLabel: string;
  zip: string;
  /** IANA time zone of the request's ZIP; show its times in it. */
  timeZone: string;
  /** Effective status: expiry is applied even before it is stored. */
  status: RequestStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  isDemoFixture: boolean;
  /** The actual number of mechanics notified. */
  matchedCount: number;
  /** Quotes that are still open (submitted and unexpired). */
  liveQuoteCount: number;
  /** Quotes that expired before the customer chose one (effective status "expired"). */
  expiredQuoteCount: number;
  /** Every quote received, whatever its status. */
  quoteCount: number;
  lowestLiveQuoteCents: number | null;
  preferredDate: string;
  preferredWindow: PreferredWindow;
  /** "Morning (8 AM–12 PM)" */
  preferredWindowLabel: string;
  serviceMode: RequestServiceMode;
  serviceModeLabel: string;
  submittedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** The request's reservation or booking, if any. */
  booking: RequestBookingSummary | null;
};

export type RequestMediaItem = {
  fileId: string;
  kind: "photo" | "video";
  /** Serve with <img>/<video src={url}>; the file route re-checks access. */
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  /** Photos are shared with matched mechanics (metadata removed); videos only after a confirmed booking. */
  sharedBeforeBooking: boolean;
};

export type RequestContactDetails = {
  email: string;
  phone: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  locationNotes: string | null;
};

export type RequestDetail = RequestSummary & {
  /** The request ZIP's centroid, for maps: approximate, never the exact address. */
  approxLocation: { lat: number; lng: number };
  description: string;
  drivable: boolean;
  maxGarageDistanceMiles: number;
  /** The customer's own private details (never shown to mechanics before a confirmed booking). */
  contact: RequestContactDetails | null;
  /** The request consents with the exact text, version and time accepted. */
  consent: ConsentRecord | null;
  media: RequestMediaItem[];
  quotes: QuoteComparisonItem[];
  quoteSummary: QuoteComparisonSummary;
  timeline: RequestTimelineEvent[];
  /**
   * Matched mechanics who pressed "Interested" and have no live quote yet (counted while the
   * request is open or quoted; 0 afterwards). Never says who they are.
   */
  interestedCount: number;
  /** Open or quoted: the customer may cancel it. */
  canCancel: boolean;
  /** Open with nobody matched: show the honest "no mechanics yet, our team was alerted" state. */
  awaitingAdminFollowUp: boolean;
};

const DESCRIPTION_PREVIEW_LENGTH = 140;

function requestRows(db: Kysely<DB>) {
  return db
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "r.id",
      "r.status",
      "r.zip",
      "r.area_label",
      "r.time_zone",
      "r.approx_lat",
      "r.approx_lng",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.mileage",
      "r.category_id",
      "c.name as category_name",
      "r.description",
      "r.drivable",
      "r.preferred_date",
      "r.preferred_window",
      "r.service_mode",
      "r.max_garage_distance_miles",
      "r.matched_count",
      "r.submitted_at",
      "r.expires_at",
      "r.is_demo_fixture",
      "r.created_at",
      "r.updated_at",
    ]);
}

type RequestRow = Awaited<ReturnType<ReturnType<typeof requestRows>["executeTakeFirstOrThrow"]>>;

type BookingRow = {
  id: string;
  request_id: string;
  status: string;
  is_demo_fixture: number;
  total_cents: number;
  currency: string;
  created_at: string;
};

async function loadBookingRows(db: Kysely<DB>, viewer: Viewer, requestIds: readonly string[]): Promise<BookingRow[]> {
  if (requestIds.length === 0) return [];
  return db
    .selectFrom("bookings")
    .select(["id", "request_id", "status", "is_demo_fixture", "total_cents", "currency", "created_at"])
    .where("request_id", "in", requestIds)
    .where("customer_id", "=", viewer.id)
    .execute();
}

function bookingSummary(row: BookingRow): RequestBookingSummary {
  const status = oneOf(BOOKING_STATUSES, row.status, "bookings.status");
  return {
    id: row.id,
    status,
    statusLabel: BOOKING_STATUS_INFO[status].label,
    statusTone: BOOKING_STATUS_INFO[status].tone,
    isDemoFixture: row.is_demo_fixture === 1,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: row.created_at,
  };
}

type EffectiveQuote = { row: StoredQuoteRow; status: QuoteStatus };

function effectiveState(row: RequestRow, quotes: readonly StoredQuoteRow[], nowIso: string) {
  const stored = { status: oneOf(REQUEST_STATUSES, row.status, "repair_requests.status"), expiresAt: row.expires_at };
  const expired = isRequestExpired(stored, nowIso);
  const effectiveQuotes: EffectiveQuote[] = quotes.map((quote) => ({
    row: quote,
    status: effectiveQuoteStatus({ status: storedQuoteStatus(quote), expiresAt: quote.expires_at }, expired, nowIso),
  }));
  const status = effectiveRequestStatus(
    stored,
    effectiveQuotes.map((quote) => quote.status),
    nowIso,
  );
  return { status, expired, effectiveQuotes };
}

/** An open request nobody was notified about isn't "waiting for quotes": say so honestly. */
function statusDisplay(status: RequestStatus, matchedCount: number): StatusInfo {
  if (status === "open" && matchedCount === 0) return { label: "No mechanics available yet", tone: "warning" };
  return REQUEST_STATUS_INFO[status];
}

function toSummary(
  row: RequestRow,
  effective: ReturnType<typeof effectiveState>,
  booking: BookingRow | undefined,
): RequestSummary {
  const display = statusDisplay(effective.status, row.matched_count);
  const preferredWindow = oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window");
  const serviceMode = oneOf(REQUEST_SERVICE_MODES, row.service_mode, "repair_requests.service_mode");
  const windowInfo = PREFERRED_WINDOW_INFO[preferredWindow];
  const live = effective.effectiveQuotes.filter((quote) => quote.status === "submitted");
  return {
    id: row.id,
    title: requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model),
    categoryId: row.category_id,
    categoryName: row.category_name,
    vehicle: {
      year: row.vehicle_year,
      make: row.vehicle_make,
      model: row.vehicle_model,
      mileage: row.mileage,
      label: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    },
    descriptionPreview:
      row.description.length > DESCRIPTION_PREVIEW_LENGTH
        ? `${row.description.slice(0, DESCRIPTION_PREVIEW_LENGTH - 1).trimEnd()}…`
        : row.description,
    areaLabel: row.area_label,
    zip: row.zip,
    timeZone: row.time_zone,
    status: effective.status,
    statusLabel: display.label,
    statusTone: display.tone,
    isDemoFixture: row.is_demo_fixture === 1,
    matchedCount: row.matched_count,
    liveQuoteCount: live.length,
    expiredQuoteCount: effective.effectiveQuotes.filter((quote) => quote.status === "expired").length,
    quoteCount: effective.effectiveQuotes.length,
    lowestLiveQuoteCents: live.length > 0 ? Math.min(...live.map((quote) => quote.row.total_cents)) : null,
    preferredDate: row.preferred_date,
    preferredWindow,
    preferredWindowLabel:
      preferredWindow === "flexible" ? windowInfo.hours : `${windowInfo.label} (${windowInfo.hours})`,
    serviceMode,
    serviceModeLabel: REQUEST_SERVICE_MODE_INFO[serviceMode].label,
    submittedAt: row.submitted_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    booking: booking ? bookingSummary(booking) : null,
  };
}

/** The viewer's requests (newest first), or just `requestIds` of them when given. */
export async function loadRequestSummaries(
  ctx: AppContext,
  viewer: Viewer,
  options: { requestIds?: readonly string[] } = {},
): Promise<RequestSummary[]> {
  if (options.requestIds && options.requestIds.length === 0) return [];
  let query = requestRows(ctx.db).where("r.customer_id", "=", viewer.id);
  if (options.requestIds) query = query.where("r.id", "in", options.requestIds);
  const rows = await query.orderBy("r.created_at", "desc").orderBy(sql`r.rowid`, "desc").execute();

  const ids = rows.map((row) => row.id);
  const quotesBy = groupBy(await loadQuoteRows(ctx.db, ids), (quote) => quote.request_id);
  const bookingsBy = new Map((await loadBookingRows(ctx.db, viewer, ids)).map((booking) => [booking.request_id, booking]));
  const nowIso = ctx.now.toISOString();
  return rows.map((row) =>
    toSummary(row, effectiveState(row, quotesBy.get(row.id) ?? [], nowIso), bookingsBy.get(row.id)),
  );
}

async function loadMedia(db: Kysely<DB>, requestId: string): Promise<RequestMediaItem[]> {
  const rows = await db
    .selectFrom("request_media as m")
    .innerJoin("files as f", "f.id", "m.file_id")
    .select(["m.file_id", "m.kind", "m.shareable_before_booking", "f.mime_type", "f.width", "f.height", "f.size_bytes"])
    .where("m.request_id", "=", requestId)
    .orderBy("m.kind")
    .orderBy("m.created_at")
    .orderBy(sql`m.rowid`)
    .execute();
  return rows.map((row) => ({
    fileId: row.file_id,
    kind: row.kind === "video" ? "video" : "photo",
    url: `/api/files/${row.file_id}`,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    sharedBeforeBooking: row.shareable_before_booking === 1,
  }));
}

async function loadMatchBatches(db: Kysely<DB>, requestId: string) {
  const rows = await db
    .selectFrom("job_matches")
    .select((eb) => ["notified_at", eb.fn.countAll<number>().as("count")])
    .where("request_id", "=", requestId)
    .groupBy("notified_at")
    .orderBy("notified_at")
    .execute();
  return rows.map((row) => ({ notifiedAt: row.notified_at, count: Number(row.count) }));
}

async function loadInterestedCount(db: Kysely<DB>, requestId: string): Promise<number> {
  const row = await db
    .selectFrom("job_matches")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("request_id", "=", requestId)
    .where("status", "=", "interested")
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function loadBookingProgress(db: Kysely<DB>, bookingId: string) {
  return db
    .selectFrom("bookings as b")
    .innerJoin("mechanic_profiles as m", "m.user_id", "b.mechanic_id")
    .select(["b.confirmed_at", "b.started_at", "b.completed_at", "b.cancelled_at", "m.display_name"])
    .where("b.id", "=", bookingId)
    .executeTakeFirstOrThrow();
}

/** One of the viewer's requests with everything the request page shows (not_found otherwise). */
export async function loadRequestDetail(ctx: AppContext, viewer: Viewer, requestId: string): Promise<RequestDetail> {
  const row = await requestRows(ctx.db)
    .where("r.id", "=", requestId)
    .where("r.customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("request");

  const nowIso = ctx.now.toISOString();
  const quoteRows = await loadQuoteRows(ctx.db, [row.id]);
  const effective = effectiveState(row, quoteRows, nowIso);
  const [bookingRow] = await loadBookingRows(ctx.db, viewer, [row.id]);
  const summary = toSummary(row, effective, bookingRow);

  const privateRow = await ctx.db
    .selectFrom("request_private")
    .select([
      "contact_email",
      "contact_phone",
      "street_address",
      "address_city",
      "address_state",
      "location_notes",
      "consent_snapshot_json",
    ])
    .where("request_id", "=", row.id)
    .executeTakeFirst();

  const quotes = await buildQuoteComparison(
    ctx,
    viewer,
    {
      id: row.id,
      status: effective.status,
      expired: effective.expired,
      timeZone: row.time_zone,
      point: { lat: row.approx_lat, lng: row.approx_lng },
    },
    quoteRows,
  );
  const progress = bookingRow ? await loadBookingProgress(ctx.db, bookingRow.id) : null;
  const acceptingQuotes = effective.status === "open" || effective.status === "quoted";
  const mechanicNames = new Map(quotes.map((quote) => [quote.id, quote.mechanic.displayName]));

  const timeline = buildRequestTimeline({
    status: effective.status,
    submittedAt: row.submitted_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    matchBatches: await loadMatchBatches(ctx.db, row.id),
    quotes: effective.effectiveQuotes.map(({ row: quote, status }) => ({
      id: quote.id,
      mechanicName: mechanicNames.get(quote.id) ?? "A mechanic",
      status,
      quotedAt: quote.created_at,
      withdrawnAt: quote.withdrawn_at,
      expiresAt: quote.expires_at,
      totalCents: quote.total_cents,
      currency: quote.currency,
    })),
    booking:
      bookingRow && progress
        ? {
            id: bookingRow.id,
            status: summary.booking?.status ?? "pending_payment",
            mechanicName: progress.display_name,
            isDemoFixture: bookingRow.is_demo_fixture === 1,
            createdAt: bookingRow.created_at,
            confirmedAt: progress.confirmed_at,
            startedAt: progress.started_at,
            completedAt: progress.completed_at,
            cancelledAt: progress.cancelled_at,
          }
        : null,
  });

  return {
    ...summary,
    approxLocation: { lat: row.approx_lat, lng: row.approx_lng },
    description: row.description,
    drivable: row.drivable === 1,
    maxGarageDistanceMiles: row.max_garage_distance_miles,
    contact: privateRow
      ? {
          email: privateRow.contact_email,
          phone: privateRow.contact_phone,
          streetAddress: privateRow.street_address,
          city: privateRow.address_city,
          state: privateRow.address_state,
          locationNotes: privateRow.location_notes,
        }
      : null,
    consent: parseConsentRecord(privateRow?.consent_snapshot_json ?? null),
    media: await loadMedia(ctx.db, row.id),
    quotes,
    quoteSummary: summarizeQuotes(quotes),
    timeline,
    interestedCount: acceptingQuotes ? await loadInterestedCount(ctx.db, row.id) : 0,
    canCancel: acceptingQuotes,
    awaitingAdminFollowUp: effective.status === "open" && row.matched_count === 0,
  };
}
