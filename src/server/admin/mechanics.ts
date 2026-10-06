import "server-only";

import { sql, type Kysely, type SqlBool } from "kysely";

import {
  DOCUMENT_KIND_INFO,
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  MECHANIC_SERVICE_MODES,
  MECHANIC_STATUSES,
  type DocumentKind,
  type DocumentStatus,
  type MechanicServiceMode,
  type MechanicStatus,
} from "@/lib/domain";
import { formatMinuteOfDay, todayInZone } from "@/lib/time";
import {
  INSURANCE_WARNING_DAYS,
  insuranceWindowSchema,
  mechanicListQuerySchema,
  type AdminMechanicStatus,
  type MechanicListFilter,
} from "@/lib/validation/admin";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { AUDIT_ROWID, auditEventsQuery, toAuditEventItem, type AuditEventItem } from "./audit-items";
import { parseAdminInput, parseRecordId } from "./input";
import { insuranceStanding, type InsuranceStanding } from "./insurance";
import { ADMIN_STATUS_TRANSITIONS, approvalBlockedReason } from "./mechanic-status";
import { oneOf, type PersonRef } from "./types";

// Mechanic applications and profiles for admin review. Public profile fields, the account
// email, documents (metadata only; files open through /api/files/<id>, which audits each
// admin view) and the review history. Legal name, phone, contact email, garage address
// and policy number come only from revealMechanicPrivate (audited).

export type AdminMechanicListItem = {
  id: string;
  displayName: string;
  /** The account's login email. */
  accountEmail: string;
  status: MechanicStatus;
  statusReason: string | null;
  serviceMode: MechanicServiceMode;
  baseZip: string;
  /** Approximate base area (ZIP centroid), e.g. "Tempe, AZ 85281". */
  baseArea: string;
  travelRadiusMiles: number;
  servicesCount: number;
  /** Safety-sensitive categories offered (brakes, suspension) that no admin has approved. */
  safetyApprovalsPending: number;
  documentsCount: number;
  pendingDocumentsCount: number;
  insurance: InsuranceStanding;
  acceptingJobs: boolean;
  isDemoAccount: boolean;
  /** Avatar: show with /api/files/<id>; null without a photo. */
  profilePhotoFileId: string | null;
  /** When the application was submitted; null while it is still a draft. */
  submittedAt: string | null;
  statusChangedAt: string | null;
};

export type AdminMechanicService = {
  categoryId: string;
  name: string;
  /** False when the category is disabled in Settings. */
  categoryEnabled: boolean;
  safetySensitive: boolean;
  /** Admin approval for safety-sensitive work (always false for other categories). */
  safetyApproved: boolean;
  safetyApprovedAt: string | null;
  safetyApprovedBy: PersonRef | null;
};

export type AdminMechanicAvailability = {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  weekdayLabel: string;
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
  /** e.g. "8:00 AM–6:00 PM" */
  label: string;
};

export type AdminMechanicDocument = {
  id: string;
  kind: DocumentKind;
  kindLabel: string;
  status: DocumentStatus;
  /** Show or download with /api/files/<fileId>; every admin view is written to the audit log. */
  fileId: string;
  /** The name the file was uploaded with, e.g. "insurance-2026.pdf". */
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  /** YYYY-MM-DD, e.g. an insurance certificate's end date. */
  expiresOn: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: PersonRef | null;
  uploadedAt: string;
};

export type AdminMechanicStats = {
  /** Requests the mechanic was notified about. */
  jobsMatched: number;
  /** Requests the mechanic sent at least one quote for. */
  jobsQuoted: number;
  quotesSent: number;
  /** Quotes a customer can still select now. */
  activeQuotes: number;
  bookings: number;
  /** Jobs past the reservation (only seeded bookings get there while online payments are not connected). */
  confirmedBookings: number;
  /** Reviews from real bookings (seeded sample reviews never count toward ratings). */
  genuineReviewCount: number;
  /** null with no genuine reviews (show "New"). */
  genuineAverageRating: number | null;
  /** Seeded sample reviews: shown to admins, never counted. */
  sampleReviewCount: number;
};

export type AdminMechanicDetail = {
  id: string;
  account: { email: string; createdAt: string; isDemoAccount: boolean; disabledAt: string | null };
  profile: {
    displayName: string;
    bio: string | null;
    yearsExperience: number;
    certifications: string | null;
    serviceMode: MechanicServiceMode;
    travelRadiusMiles: number;
    baseZip: string;
    baseArea: string;
    /** The base ZIP's approximate centroid (never an exact address), for the coverage map. */
    baseLocation: { lat: number; lng: number };
    /** IANA zone of the base ZIP; "today" for insurance is this zone's date. */
    timeZone: string;
    servicesAllMakes: boolean;
    acceptingJobs: boolean;
    /** Show with /api/files/<id>. */
    profilePhotoFileId: string | null;
    createdAt: string;
    updatedAt: string;
    submittedAt: string | null;
    approvedAt: string | null;
  };
  status: {
    current: MechanicStatus;
    reason: string | null;
    changedAt: string | null;
    changedBy: PersonRef | null;
    /** Statuses an admin can move the mechanic to now. */
    allowedTransitions: AdminMechanicStatus[];
    /** Why "approved" is not possible right now (insurance), or null. */
    approvalBlockedReason: string | null;
  };
  /** Provider and expiry; the policy number is shown only through revealMechanicPrivate. */
  insurance: InsuranceStanding & { policyNumberOnFile: boolean };
  services: AdminMechanicService[];
  /** Makes serviced; empty when profile.servicesAllMakes. */
  makes: string[];
  availability: AdminMechanicAvailability[];
  documents: AdminMechanicDocument[];
  /** Audit events about this mechanic (status, documents, safety approvals, reveals...) and by them, newest first (at most 50). */
  history: AuditEventItem[];
  stats: AdminMechanicStats;
  /** Whether legal name, phone, contact email (and garage address) are on file to reveal. */
  hasPrivateDetails: boolean;
};

export type InsuranceExpiringItem = {
  mechanicId: string;
  displayName: string;
  status: MechanicStatus;
  baseArea: string;
  /** state is "expired" or "expiring_soon". */
  insurance: InsuranceStanding;
};

const HISTORY_LIMIT = 50;
const MECHANIC_NOT_FOUND = "That mechanic application was not found.";
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Review queue order: under review, applied, approved, suspended, rejected. */
const STATUS_ORDER = sql`CASE p.status
  WHEN 'under_review' THEN 0 WHEN 'applied' THEN 1 WHEN 'approved' THEN 2
  WHEN 'suspended' THEN 3 ELSE 4 END`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function areaLabel(city: string, state: string, zip: string): string {
  return `${city}, ${state} ${zip}`;
}

function personRef(id: string | null, displayName: string | null): PersonRef | null {
  return id === null ? null : { id, displayName: displayName ?? "Unknown user" };
}

/**
 * Mechanic applications and profiles, review queue first (under review, applied, then
 * approved, suspended, rejected; oldest submission first within each). Filter by status
 * ("awaiting_review" = applied + under review) and by a search over display name and
 * account email.
 */
export async function listMechanics(
  ctx: AppContext,
  viewer: Viewer,
  filters: { status?: MechanicListFilter; query?: string } = {},
): Promise<AdminMechanicListItem[]> {
  assertAdmin(viewer);
  const { status, query } = parseAdminInput(mechanicListQuerySchema, filters);

  let builder = ctx.db
    .selectFrom("mechanic_profiles as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
    .select([
      "p.user_id",
      "p.display_name",
      "u.email",
      "u.is_demo_account",
      "p.status",
      "p.status_reason",
      "p.service_mode",
      "p.base_zip",
      "z.city",
      "z.state",
      "z.time_zone",
      "p.travel_radius_miles",
      "p.insurance_provider",
      "p.insurance_expires_on",
      "p.accepting_jobs",
      "p.profile_photo_file_id",
      "p.submitted_at",
      "p.status_changed_at",
      sql<number>`(SELECT count(*) FROM mechanic_services AS s WHERE s.mechanic_id = p.user_id)`.as("services_count"),
      sql<number>`(SELECT count(*) FROM mechanic_services AS s
        JOIN service_categories AS sc ON sc.id = s.category_id
        WHERE s.mechanic_id = p.user_id AND sc.safety_sensitive = 1 AND s.safety_approved = 0)`.as("safety_pending"),
      sql<number>`(SELECT count(*) FROM mechanic_documents AS d WHERE d.mechanic_id = p.user_id)`.as("documents_count"),
      sql<number>`(SELECT count(*) FROM mechanic_documents AS d
        WHERE d.mechanic_id = p.user_id AND d.status = 'pending')`.as("pending_documents"),
    ]);

  if (status === "awaiting_review") builder = builder.where("p.status", "in", ["applied", "under_review"]);
  else if (status) builder = builder.where("p.status", "=", status);
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    builder = builder.where(
      sql<SqlBool>`(p.display_name LIKE ${pattern} ESCAPE '\\' OR u.email LIKE ${pattern} ESCAPE '\\')`,
    );
  }

  const rows = await builder
    .orderBy(STATUS_ORDER)
    .orderBy(sql`p.submitted_at IS NULL`)
    .orderBy("p.submitted_at")
    .orderBy("p.display_name")
    .execute();

  return rows.map((row) => ({
    id: row.user_id,
    displayName: row.display_name,
    accountEmail: row.email,
    status: oneOf(MECHANIC_STATUSES, row.status, "mechanic_profiles.status"),
    statusReason: row.status_reason,
    serviceMode: oneOf(MECHANIC_SERVICE_MODES, row.service_mode, "mechanic_profiles.service_mode"),
    baseZip: row.base_zip,
    baseArea: areaLabel(row.city, row.state, row.base_zip),
    travelRadiusMiles: row.travel_radius_miles,
    servicesCount: Number(row.services_count),
    safetyApprovalsPending: Number(row.safety_pending),
    documentsCount: Number(row.documents_count),
    pendingDocumentsCount: Number(row.pending_documents),
    insurance: insuranceStanding({
      provider: row.insurance_provider,
      expiresOn: row.insurance_expires_on,
      today: todayInZone(ctx.now, row.time_zone),
    }),
    acceptingJobs: row.accepting_jobs === 1,
    isDemoAccount: row.is_demo_account === 1,
    profilePhotoFileId: row.profile_photo_file_id,
    submittedAt: row.submitted_at,
    statusChangedAt: row.status_changed_at,
  }));
}

async function loadProfile(db: Kysely<DB>, mechanicId: string) {
  return db
    .selectFrom("mechanic_profiles as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
    .leftJoin("users as changer", "changer.id", "p.status_changed_by")
    .select([
      "p.user_id",
      "p.display_name",
      "p.bio",
      "p.years_experience",
      "p.certifications",
      "p.service_mode",
      "p.travel_radius_miles",
      "p.base_zip",
      "p.base_lat",
      "p.base_lng",
      "p.services_all_makes",
      "p.insurance_provider",
      "p.insurance_expires_on",
      "p.accepting_jobs",
      "p.profile_photo_file_id",
      "p.status",
      "p.status_reason",
      "p.status_changed_at",
      "p.status_changed_by",
      "p.approved_at",
      "p.submitted_at",
      "p.created_at",
      "p.updated_at",
      "changer.display_name as changer_name",
      "u.email",
      "u.created_at as account_created_at",
      "u.is_demo_account",
      "u.disabled_at",
      "z.city",
      "z.state",
      "z.time_zone",
    ])
    .where("p.user_id", "=", mechanicId)
    .executeTakeFirst();
}

async function loadServices(db: Kysely<DB>, mechanicId: string): Promise<AdminMechanicService[]> {
  const rows = await db
    .selectFrom("mechanic_services as s")
    .innerJoin("service_categories as c", "c.id", "s.category_id")
    .leftJoin("users as approver", "approver.id", "s.safety_approved_by")
    .select([
      "s.category_id",
      "c.name",
      "c.enabled",
      "c.safety_sensitive",
      "s.safety_approved",
      "s.safety_approved_at",
      "s.safety_approved_by",
      "approver.display_name as approver_name",
    ])
    .where("s.mechanic_id", "=", mechanicId)
    .orderBy("c.sort_order")
    .execute();
  return rows.map((row) => {
    const safetySensitive = row.safety_sensitive === 1;
    const safetyApproved = safetySensitive && row.safety_approved === 1;
    return {
      categoryId: row.category_id,
      name: row.name,
      categoryEnabled: row.enabled === 1,
      safetySensitive,
      safetyApproved,
      safetyApprovedAt: safetyApproved ? row.safety_approved_at : null,
      safetyApprovedBy: safetyApproved ? personRef(row.safety_approved_by, row.approver_name) : null,
    };
  });
}

async function loadAvailability(db: Kysely<DB>, mechanicId: string): Promise<AdminMechanicAvailability[]> {
  const rows = await db
    .selectFrom("mechanic_availability")
    .select(["weekday", "start_minute", "end_minute"])
    .where("mechanic_id", "=", mechanicId)
    .orderBy("weekday")
    .orderBy("start_minute")
    .execute();
  return rows.map((row) => ({
    weekday: row.weekday,
    weekdayLabel: WEEKDAY_LABELS[row.weekday] ?? `Day ${row.weekday}`,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    label: `${formatMinuteOfDay(row.start_minute)}–${formatMinuteOfDay(row.end_minute)}`,
  }));
}

async function loadDocuments(db: Kysely<DB>, mechanicId: string): Promise<AdminMechanicDocument[]> {
  const rows = await db
    .selectFrom("mechanic_documents as d")
    .innerJoin("files as f", "f.id", "d.file_id")
    .leftJoin("users as reviewer", "reviewer.id", "d.reviewed_by")
    .select([
      "d.id",
      "d.kind",
      "d.status",
      "d.file_id",
      "f.original_name",
      "f.mime_type",
      "f.size_bytes",
      "d.expires_on",
      "d.review_note",
      "d.reviewed_at",
      "d.reviewed_by",
      "reviewer.display_name as reviewer_name",
      "d.created_at",
    ])
    .where("d.mechanic_id", "=", mechanicId)
    .orderBy("d.created_at", "desc")
    .orderBy(sql`d.rowid`, "desc")
    .execute();
  return rows.map((row) => {
    const kind = oneOf(DOCUMENT_KINDS, row.kind, "mechanic_documents.kind");
    return {
      id: row.id,
      kind,
      kindLabel: DOCUMENT_KIND_INFO[kind].label,
      status: oneOf(DOCUMENT_STATUSES, row.status, "mechanic_documents.status"),
      fileId: row.file_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      expiresOn: row.expires_on,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      reviewedBy: personRef(row.reviewed_by, row.reviewer_name),
      uploadedAt: row.created_at,
    };
  });
}

/**
 * Events about the mechanic (their account, profile and documents, or naming them in
 * metadata, e.g. a quote selected or a review left) and events the mechanic performed.
 */
async function loadHistory(db: Kysely<DB>, mechanicId: string): Promise<AuditEventItem[]> {
  const rows = await auditEventsQuery(db)
    .where((eb) =>
      eb.or([
        eb.and([eb("a.entity_type", "in", ["mechanic", "user"]), eb("a.entity_id", "=", mechanicId)]),
        eb.and([
          eb("a.entity_type", "=", "mechanic_document"),
          eb("a.entity_id", "in", eb.selectFrom("mechanic_documents").select("id").where("mechanic_id", "=", mechanicId)),
        ]),
        eb(sql<string>`json_extract(a.metadata_json, '$.mechanicId')`, "=", mechanicId),
        eb("a.actor_user_id", "=", mechanicId),
      ]),
    )
    .orderBy("a.created_at", "desc")
    .orderBy(AUDIT_ROWID, "desc")
    .limit(HISTORY_LIMIT)
    .execute();
  return rows.map(toAuditEventItem);
}

async function loadStats(db: Kysely<DB>, mechanicId: string, nowIso: string): Promise<AdminMechanicStats> {
  const row = await db
    .selectNoFrom([
      sql<number>`(SELECT count(*) FROM job_matches WHERE mechanic_id = ${mechanicId})`.as("matched"),
      sql<number>`(SELECT count(DISTINCT request_id) FROM quotes WHERE mechanic_id = ${mechanicId})`.as("quoted"),
      sql<number>`(SELECT count(*) FROM quotes WHERE mechanic_id = ${mechanicId})`.as("quotes"),
      sql<number>`(SELECT count(*) FROM quotes AS q JOIN repair_requests AS r ON r.id = q.request_id
        WHERE q.mechanic_id = ${mechanicId} AND q.status = 'submitted' AND q.expires_at > ${nowIso}
          AND NOT (r.status IN ('open', 'quoted') AND r.expires_at <= ${nowIso}))`.as("active_quotes"),
      sql<number>`(SELECT count(*) FROM bookings WHERE mechanic_id = ${mechanicId})`.as("bookings"),
      sql<number>`(SELECT count(*) FROM bookings WHERE mechanic_id = ${mechanicId} AND is_demo_fixture = 1)`.as(
        "confirmed_bookings",
      ),
      sql<number>`(SELECT count(*) FROM reviews WHERE mechanic_id = ${mechanicId} AND is_demo_fixture = 0)`.as(
        "genuine_reviews",
      ),
      sql<number | null>`(SELECT avg(rating) FROM reviews WHERE mechanic_id = ${mechanicId} AND is_demo_fixture = 0)`.as(
        "genuine_rating",
      ),
      sql<number>`(SELECT count(*) FROM reviews WHERE mechanic_id = ${mechanicId} AND is_demo_fixture = 1)`.as(
        "sample_reviews",
      ),
    ])
    .executeTakeFirstOrThrow();
  return {
    jobsMatched: Number(row.matched),
    jobsQuoted: Number(row.quoted),
    quotesSent: Number(row.quotes),
    activeQuotes: Number(row.active_quotes),
    bookings: Number(row.bookings),
    confirmedBookings: Number(row.confirmed_bookings),
    genuineReviewCount: Number(row.genuine_reviews),
    genuineAverageRating: row.genuine_rating === null ? null : Math.round(Number(row.genuine_rating) * 10) / 10,
    sampleReviewCount: Number(row.sample_reviews),
  };
}

/**
 * Everything an admin needs to review one mechanic: public profile, account, status with
 * the moves allowed now, insurance standing, services with safety approvals, makes,
 * availability, documents, review history and activity. Throws DomainError("not_found").
 */
export async function getMechanic(ctx: AppContext, viewer: Viewer, mechanicId: string): Promise<AdminMechanicDetail> {
  assertAdmin(viewer);
  const id = parseRecordId(mechanicId, MECHANIC_NOT_FOUND);
  const profile = await loadProfile(ctx.db, id);
  if (!profile) throw new DomainError("not_found", MECHANIC_NOT_FOUND);

  const nowIso = ctx.now.toISOString();
  const [services, makes, availability, documents, history, stats, privateRow] = await Promise.all([
    loadServices(ctx.db, id),
    ctx.db.selectFrom("mechanic_makes").select("make").where("mechanic_id", "=", id).orderBy("make").execute(),
    loadAvailability(ctx.db, id),
    loadDocuments(ctx.db, id),
    loadHistory(ctx.db, id),
    loadStats(ctx.db, id, nowIso),
    ctx.db
      .selectFrom("mechanic_private")
      .select(sql<number>`insurance_policy_number IS NOT NULL`.as("has_policy_number"))
      .where("user_id", "=", id)
      .executeTakeFirst(),
  ]);

  const status = oneOf(MECHANIC_STATUSES, profile.status, "mechanic_profiles.status");
  const insurance = insuranceStanding({
    provider: profile.insurance_provider,
    expiresOn: profile.insurance_expires_on,
    today: todayInZone(ctx.now, profile.time_zone),
  });
  const allowedTransitions = [...ADMIN_STATUS_TRANSITIONS[status]];
  const servicesAllMakes = profile.services_all_makes === 1;

  return {
    id: profile.user_id,
    account: {
      email: profile.email,
      createdAt: profile.account_created_at,
      isDemoAccount: profile.is_demo_account === 1,
      disabledAt: profile.disabled_at,
    },
    profile: {
      displayName: profile.display_name,
      bio: profile.bio,
      yearsExperience: profile.years_experience,
      certifications: profile.certifications,
      serviceMode: oneOf(MECHANIC_SERVICE_MODES, profile.service_mode, "mechanic_profiles.service_mode"),
      travelRadiusMiles: profile.travel_radius_miles,
      baseZip: profile.base_zip,
      baseArea: areaLabel(profile.city, profile.state, profile.base_zip),
      baseLocation: { lat: profile.base_lat, lng: profile.base_lng },
      timeZone: profile.time_zone,
      servicesAllMakes,
      acceptingJobs: profile.accepting_jobs === 1,
      profilePhotoFileId: profile.profile_photo_file_id,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      submittedAt: profile.submitted_at,
      approvedAt: profile.approved_at,
    },
    status: {
      current: status,
      reason: profile.status_reason,
      changedAt: profile.status_changed_at,
      changedBy: personRef(profile.status_changed_by, profile.changer_name),
      allowedTransitions,
      approvalBlockedReason: allowedTransitions.includes("approved") ? approvalBlockedReason(insurance) : null,
    },
    insurance: { ...insurance, policyNumberOnFile: privateRow?.has_policy_number === 1 },
    services,
    makes: servicesAllMakes ? [] : makes.map((row) => row.make),
    availability,
    documents,
    history,
    stats,
    hasPrivateDetails: privateRow !== undefined,
  };
}

/** Insurance standing of every mechanic who is not rejected, for the dashboard and the expiry list. */
export async function loadInsuranceStandings(
  db: Kysely<DB>,
  now: Date,
  warningDays: number,
): Promise<InsuranceExpiringItem[]> {
  const rows = await db
    .selectFrom("mechanic_profiles as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
    .select([
      "p.user_id",
      "p.display_name",
      "p.status",
      "p.base_zip",
      "p.insurance_provider",
      "p.insurance_expires_on",
      "z.city",
      "z.state",
      "z.time_zone",
    ])
    .where("p.status", "!=", "rejected")
    .orderBy("p.insurance_expires_on")
    .orderBy("p.display_name")
    .execute();
  return rows.map((row) => ({
    mechanicId: row.user_id,
    displayName: row.display_name,
    status: oneOf(MECHANIC_STATUSES, row.status, "mechanic_profiles.status"),
    baseArea: areaLabel(row.city, row.state, row.base_zip),
    insurance: insuranceStanding({
      provider: row.insurance_provider,
      expiresOn: row.insurance_expires_on,
      today: todayInZone(now, row.time_zone),
      warningDays,
    }),
  }));
}

/**
 * Mechanics (not rejected) whose recorded insurance has expired or expires within
 * `withinDays` days of their local today, soonest first. Missing insurance is not listed
 * (see each mechanic's insurance standing).
 */
export async function listInsuranceExpiring(
  ctx: AppContext,
  viewer: Viewer,
  withinDays: number = INSURANCE_WARNING_DAYS,
): Promise<InsuranceExpiringItem[]> {
  assertAdmin(viewer);
  const days = parseAdminInput(insuranceWindowSchema, withinDays);
  const standings = await loadInsuranceStandings(ctx.db, ctx.now, days);
  return standings.filter((item) => item.insurance.state === "expired" || item.insurance.state === "expiring_soon");
}
