import "server-only";

import { sql, type Kysely } from "kysely";

import {
  JOB_MATCH_STATUSES,
  MATCH_REASON_INFO,
  MATCH_REASONS,
  MECHANIC_SERVICE_MODES,
  MECHANIC_STATUSES,
  REQUEST_STATUSES,
  type JobMatchStatus,
  type MatchReason,
  type MechanicServiceMode,
  type MechanicStatus,
} from "@/lib/domain";
import { requestListQuerySchema, requestRevealSchema, type RequestListFilter } from "@/lib/validation/admin";
import {
  SUPPORT_STATUSES,
  SUPPORT_TOPIC_INFO,
  SUPPORT_TOPICS,
  type SupportStatus,
  type SupportTopic,
} from "@/lib/validation/support";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { bookingItemsFrom, selectBookingItems, toBookingListItem, type AdminBookingListItem } from "./booking-items";
import { loadBookingRecords, type AdminBookingRecords } from "./booking-records";
import { effectiveRequestStatusSql } from "./effective-status";
import { parseAdminInput, parseRecordId } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { pageWindow, toPaged } from "./paging";
import { loadQuoteLineItems, quoteItemsFrom, selectQuoteItems, toQuoteDetail, type AdminQuoteDetail } from "./quote-items";
import {
  requestItemsFrom,
  rerunBlockedReason,
  selectRequestItems,
  toRequestListItem,
  type AdminRequestListItem,
} from "./request-items";
import { oneOf, parseConsentRecord, type AdminConsentRecord, type Paged, type PersonRef } from "./types";

// Repair requests for admins: coarse fields, media, quotes, booking and matching results.
// The customer's contact details, exact address and location notes stay hidden until an
// admin reveals them with a reason (revealRequestContact, audited).

const REQUEST_NOT_FOUND = "That repair request was not found.";

export type MatchReasonDetail = { code: MatchReason; label: string; explanation: string };

/** An approximate map point: a ZIP centroid, never an exact address. */
export type ApproxPoint = { lat: number; lng: number };

export type AdminMatchEvaluation = {
  mechanic: PersonRef;
  mechanicStatus: MechanicStatus;
  /** The mechanic's base ZIP centroid (approximate) and area label, for the diagnostics map. */
  base: ApproxPoint & { zip: string; area: string };
  serviceMode: MechanicServiceMode;
  /** How far the mechanic travels for mobile work (their radius ring on the map). */
  travelRadiusMiles: number;
  eligible: boolean;
  notified: boolean;
  /** Approximate miles between ZIP centroids. */
  distanceMiles: number | null;
  /** Every rule the mechanic failed (empty when eligible). */
  reasons: MatchReasonDetail[];
  evaluatedAt: string;
};

export type AdminJobMatch = {
  mechanic: PersonRef;
  /** 1 = notified first. */
  rank: number;
  status: JobMatchStatus;
  distanceMiles: number;
  notifiedAt: string;
  updatedAt: string;
};

export type AdminRequestMedia = {
  /** Show with /api/files/<fileId> (admins may view every request file). */
  fileId: string;
  kind: "photo" | "video";
  /** Sanitized photos only; videos are never shown to mechanics before a confirmed booking. */
  shareableBeforeBooking: boolean;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
};

export type AdminLinkedSupportRequest = {
  id: string;
  topic: SupportTopic;
  topicLabel: string;
  status: SupportStatus;
  createdAt: string;
};

/** The request's booking with its post-booking records (change orders, invoice, review). */
export type AdminRequestBooking = AdminBookingListItem & AdminBookingRecords;

export type AdminRequestDetail = AdminRequestListItem & {
  /** Status stored in the database (lags `status` until expiry is next applied). */
  storedStatus: AdminRequestListItem["status"];
  /** The request ZIP's centroid (approximate; the exact address stays private). */
  location: ApproxPoint;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  mileage: number;
  description: string;
  drivable: boolean;
  maxGarageDistanceMiles: number;
  categorySafetySensitive: boolean;
  categoryEnabled: boolean;
  /** Whether the request's ZIP is an enabled pilot ZIP now. */
  zipPilotEnabled: boolean;
  updatedAt: string;
  media: AdminRequestMedia[];
  quotes: AdminQuoteDetail[];
  booking: AdminRequestBooking | null;
  /** The last matching run: every mechanic evaluated, notified first, then eligible, then by distance. */
  evaluations: AdminMatchEvaluation[];
  jobMatches: AdminJobMatch[];
  /** The consent the customer accepted when submitting (text, version and time). */
  consent: AdminConsentRecord | null;
  supportRequests: AdminLinkedSupportRequest[];
  /** Why rerunMatching would be refused now, or null when it can run. */
  rerunBlockedReason: string | null;
};

export type RevealRequestContactInput = {
  requestId: string;
  /** Why the admin needs the details (3-500 characters); stored in the audit log. */
  reason: string;
};

export type RequestContactDetails = {
  requestId: string;
  contactEmail: string;
  contactPhone: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string;
  locationNotes: string | null;
  /** When this reveal was recorded (UTC ISO). */
  revealedAt: string;
};

/** Labels for stored reason codes (codes this build does not know are skipped). */
export function matchReasonDetails(reasonsJson: string): MatchReasonDetail[] {
  let codes: unknown;
  try {
    codes = JSON.parse(reasonsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(codes)) return [];
  return codes.flatMap((code: unknown) => {
    const known = MATCH_REASONS.find((reason) => reason === code);
    return known ? [{ code: known, ...MATCH_REASON_INFO[known] }] : [];
  });
}

/**
 * Repair requests, newest first: every submitted request by default (drafts only with
 * status "draft"), "active" for open and quoted, or one status; zeroMatchesOnly keeps the
 * requests no mechanic was notified about. Statuses are as of ctx.now.
 */
export async function listRequests(
  ctx: AppContext,
  viewer: Viewer,
  filters: { status?: RequestListFilter; zeroMatchesOnly?: boolean; page?: number } = {},
): Promise<Paged<AdminRequestListItem>> {
  assertAdmin(viewer);
  const { status, zeroMatchesOnly, page } = parseAdminInput(requestListQuerySchema, filters);
  const nowIso = ctx.now.toISOString();
  const effective = effectiveRequestStatusSql("r", nowIso);

  const filtered = requestItemsFrom(ctx.db).where((eb) => {
    const conditions = [];
    if (status === undefined) conditions.push(eb("r.status", "!=", "draft"));
    else if (status === "draft") conditions.push(eb("r.status", "=", "draft"));
    else if (status === "active") conditions.push(eb(effective, "in", ["open", "quoted"]));
    else conditions.push(eb(effective, "=", status));
    if (zeroMatchesOnly) conditions.push(eb("r.matched_count", "=", 0));
    return eb.and(conditions);
  });

  const { total } = await filtered
    .select((eb) => eb.fn.countAll<number>().as("total"))
    .executeTakeFirstOrThrow();
  const window = pageWindow(page, Number(total));
  const rows = await selectRequestItems(filtered, nowIso)
    .orderBy("r.created_at", "desc")
    .orderBy(sql`r.rowid`, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();
  return toPaged(rows.map(toRequestListItem), window, Number(total));
}

/**
 * The last matching run of each request: every mechanic evaluated, notified first, then
 * eligible, then by distance (with the mechanic's approximate base for the map).
 */
export async function loadEvaluationsFor(
  db: Kysely<DB>,
  requestIds: readonly string[],
): Promise<Map<string, AdminMatchEvaluation[]>> {
  if (requestIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("match_evaluations as e")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "e.mechanic_id")
    .innerJoin("zip_centroids as z", "z.zip", "mp.base_zip")
    .select([
      "e.request_id",
      "e.mechanic_id",
      "mp.display_name",
      "mp.status",
      "mp.base_zip",
      "mp.base_lat",
      "mp.base_lng",
      "mp.service_mode",
      "mp.travel_radius_miles",
      "z.city",
      "z.state",
      "e.eligible",
      "e.notified",
      "e.distance_miles",
      "e.reasons_json",
      "e.evaluated_at",
    ])
    .where("e.request_id", "in", requestIds)
    .orderBy("e.notified", "desc")
    .orderBy("e.eligible", "desc")
    .orderBy(sql`e.distance_miles IS NULL`)
    .orderBy("e.distance_miles")
    .orderBy("mp.display_name")
    .execute();
  const byRequest = new Map<string, AdminMatchEvaluation[]>();
  for (const row of rows) {
    const list = byRequest.get(row.request_id) ?? [];
    list.push(toEvaluation(row));
    byRequest.set(row.request_id, list);
  }
  return byRequest;
}

type EvaluationRow = {
  mechanic_id: string;
  display_name: string;
  status: string;
  base_zip: string;
  base_lat: number;
  base_lng: number;
  service_mode: string;
  travel_radius_miles: number;
  city: string;
  state: string;
  eligible: number;
  notified: number;
  distance_miles: number | null;
  reasons_json: string;
  evaluated_at: string;
};

function toEvaluation(row: EvaluationRow): AdminMatchEvaluation {
  return {
    mechanic: { id: row.mechanic_id, displayName: row.display_name },
    mechanicStatus: oneOf(MECHANIC_STATUSES, row.status, "mechanic_profiles.status"),
    base: { lat: row.base_lat, lng: row.base_lng, zip: row.base_zip, area: `${row.city}, ${row.state} ${row.base_zip}` },
    serviceMode: oneOf(MECHANIC_SERVICE_MODES, row.service_mode, "mechanic_profiles.service_mode"),
    travelRadiusMiles: row.travel_radius_miles,
    eligible: row.eligible === 1,
    notified: row.notified === 1,
    distanceMiles: row.distance_miles,
    reasons: matchReasonDetails(row.reasons_json),
    evaluatedAt: row.evaluated_at,
  };
}

async function loadJobMatches(db: Kysely<DB>, requestId: string): Promise<AdminJobMatch[]> {
  const rows = await db
    .selectFrom("job_matches as jm")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "jm.mechanic_id")
    .select(["jm.mechanic_id", "mp.display_name", "jm.rank", "jm.status", "jm.distance_miles", "jm.notified_at", "jm.updated_at"])
    .where("jm.request_id", "=", requestId)
    .orderBy("jm.rank")
    .execute();
  return rows.map((row) => ({
    mechanic: { id: row.mechanic_id, displayName: row.display_name },
    rank: row.rank,
    status: oneOf(JOB_MATCH_STATUSES, row.status, "job_matches.status"),
    distanceMiles: row.distance_miles,
    notifiedAt: row.notified_at,
    updatedAt: row.updated_at,
  }));
}

async function loadMedia(db: Kysely<DB>, requestId: string): Promise<AdminRequestMedia[]> {
  const rows = await db
    .selectFrom("request_media as m")
    .innerJoin("files as f", "f.id", "m.file_id")
    .select(["m.file_id", "m.kind", "m.shareable_before_booking", "f.mime_type", "f.size_bytes", "f.width", "f.height", "m.created_at"])
    .where("m.request_id", "=", requestId)
    .orderBy("m.kind")
    .orderBy("m.created_at")
    .orderBy(sql`m.rowid`)
    .execute();
  return rows.map((row) => ({
    fileId: row.file_id,
    kind: oneOf(["photo", "video"] as const, row.kind, "request_media.kind"),
    shareableBeforeBooking: row.shareable_before_booking === 1,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    uploadedAt: row.created_at,
  }));
}

async function loadQuotes(db: Kysely<DB>, requestId: string, nowIso: string): Promise<AdminQuoteDetail[]> {
  const rows = await selectQuoteItems(quoteItemsFrom(db).where("q.request_id", "=", requestId), nowIso)
    .orderBy("q.created_at")
    .orderBy(sql`q.rowid`)
    .execute();
  const items = await loadQuoteLineItems(db, rows.map((row) => row.id));
  return rows.map((row) => toQuoteDetail(row, items.get(row.id) ?? []));
}

async function loadSupportRequests(
  db: Kysely<DB>,
  requestId: string,
  bookingId: string | null,
): Promise<AdminLinkedSupportRequest[]> {
  const rows = await db
    .selectFrom("support_requests")
    .select(["id", "topic", "status", "created_at"])
    .where((eb) =>
      bookingId === null
        ? eb("request_id", "=", requestId)
        : eb.or([eb("request_id", "=", requestId), eb("booking_id", "=", bookingId)]),
    )
    .orderBy("created_at", "desc")
    .orderBy(sql`rowid`, "desc")
    .execute();
  return rows.map((row) => {
    const topic = oneOf(SUPPORT_TOPICS, row.topic, "support_requests.topic");
    return {
      id: row.id,
      topic,
      topicLabel: SUPPORT_TOPIC_INFO[topic].label,
      status: oneOf(SUPPORT_STATUSES, row.status, "support_requests.status"),
      createdAt: row.created_at,
    };
  });
}

/**
 * One request in full for admins: coarse fields, photos and video (file ids), every quote
 * with its line items, the booking with its consent, change orders, invoice and review (the
 * evidence for a dispute), the last matching run (each mechanic's result with reasons) and
 * the notified mechanics. Contact details and the exact address are not included (see
 * revealRequestContact). Throws DomainError("not_found"), also for a malformed id.
 */
export async function getRequest(ctx: AppContext, viewer: Viewer, requestId: string): Promise<AdminRequestDetail> {
  assertAdmin(viewer);
  const id = parseRecordId(requestId, REQUEST_NOT_FOUND);
  const nowIso = ctx.now.toISOString();

  const row = await selectRequestItems(requestItemsFrom(ctx.db).where("r.id", "=", id), nowIso)
    .select([
      "r.mileage",
      "r.description",
      "r.drivable",
      "r.max_garage_distance_miles",
      "r.updated_at",
      "r.approx_lat",
      "r.approx_lng",
      "c.safety_sensitive",
      "c.enabled as category_enabled",
      sql<number | null>`(SELECT enabled FROM pilot_zips WHERE pilot_zips.zip = r.zip)`.as("zip_enabled"),
    ])
    .executeTakeFirst();
  if (!row) throw new DomainError("not_found", REQUEST_NOT_FOUND);

  const bookingRow = await selectBookingItems(bookingItemsFrom(ctx.db).where("b.request_id", "=", id)).executeTakeFirst();
  const booking: AdminRequestBooking | null = bookingRow
    ? { ...toBookingListItem(bookingRow), ...(await loadBookingRecords(ctx.db, bookingRow.id)) }
    : null;
  const [media, quotes, evaluations, jobMatches, consentRow, supportRequests] = await Promise.all([
    loadMedia(ctx.db, id),
    loadQuotes(ctx.db, id, nowIso),
    loadEvaluationsFor(ctx.db, [id]).then((byRequest) => byRequest.get(id) ?? []),
    loadJobMatches(ctx.db, id),
    ctx.db.selectFrom("request_private").select("consent_snapshot_json").where("request_id", "=", id).executeTakeFirst(),
    loadSupportRequests(ctx.db, id, booking?.id ?? null),
  ]);

  const summary = toRequestListItem(row);
  const categoryEnabled = row.category_enabled === 1;
  const zipPilotEnabled = row.zip_enabled === 1;
  return {
    ...summary,
    storedStatus: oneOf(REQUEST_STATUSES, row.status, "repair_requests.status"),
    location: { lat: row.approx_lat, lng: row.approx_lng },
    vehicleYear: row.vehicle_year,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    mileage: row.mileage,
    description: row.description,
    drivable: row.drivable === 1,
    maxGarageDistanceMiles: row.max_garage_distance_miles,
    categorySafetySensitive: row.safety_sensitive === 1,
    categoryEnabled,
    zipPilotEnabled,
    updatedAt: row.updated_at,
    media,
    quotes,
    booking,
    evaluations,
    jobMatches,
    consent: parseConsentRecord(consentRow?.consent_snapshot_json),
    supportRequests,
    rerunBlockedReason: rerunBlockedReason({
      status: summary.status,
      categoryName: summary.categoryName,
      categoryEnabled,
      zip: summary.zip,
      zipEnabled: zipPilotEnabled,
    }),
  };
}

/**
 * The customer's contact email and phone, exact address and location notes for an admin
 * who gives a reason. Every reveal is written to the audit log as
 * "request.contact_revealed" with the reason, in the same transaction that reads the data.
 *
 * Throws DomainError: forbidden, invalid_input (reason), not_found.
 */
export async function revealRequestContact(
  ctx: AppContext,
  viewer: Viewer,
  input: RevealRequestContactInput,
): Promise<RequestContactDetails> {
  assertAdmin(viewer);
  const data = parseAdminInput(requestRevealSchema, input);

  return writeTx(ctx.db, async (trx) => {
    const row = await trx
      .selectFrom("request_private as p")
      .innerJoin("repair_requests as r", "r.id", "p.request_id")
      .select([
        "p.request_id",
        "p.contact_email",
        "p.contact_phone",
        "p.street_address",
        "p.address_city",
        "p.address_state",
        "p.location_notes",
        "r.zip",
        "r.customer_id",
      ])
      .where("p.request_id", "=", data.requestId)
      .executeTakeFirst();
    if (!row) throw new DomainError("not_found", REQUEST_NOT_FOUND);

    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.requestContactRevealed,
      entityType: "request",
      entityId: row.request_id,
      reason: data.reason,
      metadata: { customerId: row.customer_id, fields: ["contact_email", "contact_phone", "street_address", "location_notes"] },
      at: ctx.now,
    });

    return {
      requestId: row.request_id,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      streetAddress: row.street_address,
      city: row.address_city,
      state: row.address_state,
      zip: row.zip,
      locationNotes: row.location_notes,
      revealedAt: ctx.now.toISOString(),
    };
  });
}
