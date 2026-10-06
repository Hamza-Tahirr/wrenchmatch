import "server-only";

import { sql, type Kysely } from "kysely";

import { MATCH_REASON_INFO, MATCH_REASONS, REQUEST_STATUSES, type MatchReason } from "@/lib/domain";
import { pluralize } from "@/lib/format";
import { todayInZone } from "@/lib/time";
import { recordIdSchema } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { loadMechanicCandidates, loadRequestForMatching, type MechanicCandidate } from "@/server/matching/load";
import { evaluateMechanic, selectMechanicsToNotify } from "@/server/matching/rules";
import { runMatching } from "@/server/matching/run";
import { notify } from "@/server/notifications/notify";

import { assertAdmin } from "./access";
import { effectiveRequestStatusSql } from "./effective-status";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { emailText } from "./messages";
import { loadEvaluationsFor, type AdminMatchEvaluation, type ApproxPoint } from "./requests";
import {
  requestItemsFrom,
  rerunBlockedReason,
  selectRequestItems,
  toRequestListItem,
  type AdminRequestListItem,
} from "./request-items";
import { oneOf, type PersonRef } from "./types";

// Matching diagnostics: requests waiting for quotes that reached fewer than
// MATCHING_FAILURE_THRESHOLD mechanics, why the others were left out, and what re-running
// matching would do now. rerunMatching notifies newly eligible mechanics.

/** Requests that notified fewer mechanics than this need admin attention. */
export const MATCHING_FAILURE_THRESHOLD = 2;

export type ReasonCount = {
  code: MatchReason;
  label: string;
  explanation: string;
  /** Mechanics whose last evaluation failed this rule (one mechanic can fail several). */
  count: number;
};

export type RerunPreview =
  /** What re-running matching now would do, evaluated against current data. */
  | { allowed: true; eligibleNow: number; wouldNotify: number }
  | { allowed: false; blockedReason: string };

export type MatchingFailure = {
  request: AdminRequestListItem;
  /** The request ZIP's centroid (approximate), for the diagnostics map. */
  location: ApproxPoint;
  /** How far the customer travels to a garage (the garage ring on the map). */
  maxGarageDistanceMiles: number;
  /** The last run's result for every mechanic evaluated (notified, eligible, then by distance). */
  evaluations: AdminMatchEvaluation[];
  /** From the last matching run. */
  evaluatedCount: number;
  eligibleCount: number;
  lastEvaluatedAt: string | null;
  /** Reasons the mechanics were left out in the last run, most common first. */
  reasons: ReasonCount[];
  rerun: RerunPreview;
};

export type MatchingFailuresReport = {
  threshold: number;
  maxMechanicsNotified: number;
  /** Oldest first: the longest-waiting customers come first. */
  requests: MatchingFailure[];
  /** Reasons across all listed requests, most common first. */
  reasons: ReasonCount[];
};

export type RerunMatchingResult = {
  requestId: string;
  /** Mechanics notified about the request in total, after this run (= matched count). */
  notifiedCount: number;
  /** Mechanics this run notified (0 when nobody new is eligible or the cap was reached). */
  newlyNotifiedCount: number;
  newlyNotified: PersonRef[];
  evaluatedCount: number;
  eligibleCount: number;
};

function histogram(codes: readonly MatchReason[]): ReasonCount[] {
  const counts = new Map<MatchReason, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return MATCH_REASONS.filter((code) => counts.has(code))
    .map((code) => ({ code, ...MATCH_REASON_INFO[code], count: counts.get(code) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

type GateRow = { id: string; category_enabled: number; zip_enabled: number | null };

async function loadGates(db: Kysely<DB>, requestIds: readonly string[]): Promise<Map<string, GateRow>> {
  if (requestIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .leftJoin("pilot_zips as pz", "pz.zip", "r.zip")
    .select(["r.id", "c.enabled as category_enabled", "pz.enabled as zip_enabled"])
    .where("r.id", "in", requestIds)
    .execute();
  return new Map(rows.map((row) => [row.id, row]));
}

/** Eligible mechanics now and how many a re-run would add, without writing anything. */
async function previewRerun(
  db: Kysely<DB>,
  requestId: string,
  mechanics: readonly MechanicCandidate[],
  alreadyNotified: ReadonlySet<string>,
  now: Date,
): Promise<{ eligibleNow: number; wouldNotify: number }> {
  const request = await loadRequestForMatching(db, requestId);
  if (!request) return { eligibleNow: 0, wouldNotify: 0 };
  const matchRequest = {
    point: request.point,
    categoryId: request.categoryId,
    categorySafetySensitive: request.categorySafetySensitive,
    make: request.vehicleMake,
    serviceMode: request.serviceMode,
    maxGarageDistanceMiles: request.maxGarageDistanceMiles,
    preferredDate: request.preferredDate,
    preferredWindow: request.preferredWindow,
    todayLocal: todayInZone(now, request.timeZone),
  };
  const evaluations = mechanics.map((mechanic) => evaluateMechanic(matchRequest, mechanic));
  const fresh = evaluations.filter((evaluation) => !alreadyNotified.has(evaluation.mechanicId));
  const room = Math.max(0, MAX_MECHANICS_NOTIFIED - alreadyNotified.size);
  return {
    eligibleNow: evaluations.filter((evaluation) => evaluation.eligible).length,
    wouldNotify: selectMechanicsToNotify(fresh, room).length,
  };
}

/**
 * Open and quoted requests (as of now) that notified fewer than
 * MATCHING_FAILURE_THRESHOLD mechanics, oldest first, each with a histogram of the reasons
 * from its last matching run and a dry-run preview of rerunMatching, plus the reasons
 * across all of them. Nothing is written.
 */
export async function listMatchingFailures(ctx: AppContext, viewer: Viewer): Promise<MatchingFailuresReport> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const effective = effectiveRequestStatusSql("r", nowIso);

  const rows = await selectRequestItems(
    requestItemsFrom(ctx.db).where((eb) =>
      eb.and([eb(effective, "in", ["open", "quoted"]), eb("r.matched_count", "<", MATCHING_FAILURE_THRESHOLD)]),
    ),
    nowIso,
  )
    .select(["r.approx_lat", "r.approx_lng", "r.max_garage_distance_miles"])
    .orderBy("r.submitted_at")
    .orderBy(sql`r.rowid`)
    .execute();
  const requests = rows.map((row) => ({
    item: toRequestListItem(row),
    location: { lat: row.approx_lat, lng: row.approx_lng },
    maxGarageDistanceMiles: row.max_garage_distance_miles,
  }));
  const ids = requests.map(({ item }) => item.id);
  if (ids.length === 0) {
    return { threshold: MATCHING_FAILURE_THRESHOLD, maxMechanicsNotified: MAX_MECHANICS_NOTIFIED, requests: [], reasons: [] };
  }

  const [evaluationsBy, matchRows, gates, mechanics] = await Promise.all([
    loadEvaluationsFor(ctx.db, ids),
    ctx.db.selectFrom("job_matches").select(["request_id", "mechanic_id"]).where("request_id", "in", ids).execute(),
    loadGates(ctx.db, ids),
    loadMechanicCandidates(ctx.db),
  ]);
  const notifiedBy = Map.groupBy(matchRows, (row) => row.request_id);

  const allCodes: MatchReason[] = [];
  const failures: MatchingFailure[] = [];
  for (const { item: request, location, maxGarageDistanceMiles } of requests) {
    const evaluations = evaluationsBy.get(request.id) ?? [];
    const codes = evaluations.flatMap((evaluation) => evaluation.reasons.map((reason) => reason.code));
    allCodes.push(...codes);

    const gate = gates.get(request.id);
    const blockedReason = rerunBlockedReason({
      status: request.status,
      categoryName: request.categoryName,
      categoryEnabled: gate?.category_enabled === 1,
      zip: request.zip,
      zipEnabled: gate?.zip_enabled === 1,
    });
    const alreadyNotified = new Set((notifiedBy.get(request.id) ?? []).map((row) => row.mechanic_id));
    const rerun: RerunPreview = blockedReason
      ? { allowed: false, blockedReason }
      : { allowed: true, ...(await previewRerun(ctx.db, request.id, mechanics, alreadyNotified, ctx.now)) };

    failures.push({
      request,
      location,
      maxGarageDistanceMiles,
      evaluations,
      evaluatedCount: evaluations.length,
      eligibleCount: evaluations.filter((evaluation) => evaluation.eligible).length,
      lastEvaluatedAt: evaluations.reduce<string | null>(
        (latest, evaluation) => (latest === null || evaluation.evaluatedAt > latest ? evaluation.evaluatedAt : latest),
        null,
      ),
      reasons: histogram(codes),
      rerun,
    });
  }

  return {
    threshold: MATCHING_FAILURE_THRESHOLD,
    maxMechanicsNotified: MAX_MECHANICS_NOTIFIED,
    requests: failures,
    reasons: histogram(allCodes),
  };
}

/**
 * Re-runs matching for an open or quoted request: applies expiry, re-evaluates every
 * mechanic (refreshing the reasons admins see) and notifies newly eligible mechanics, closest
 * first, up to MAX_MECHANICS_NOTIFIED in total. Mechanics already notified are never
 * notified twice. When anyone new is notified, the customer is told the new total. Writes an
 * audit event either way.
 *
 * Throws DomainError: forbidden, invalid_input, not_found, conflict (the request is not
 * waiting for quotes, or its category or ZIP is disabled).
 */
export async function rerunMatching(ctx: AppContext, viewer: Viewer, requestId: string): Promise<RerunMatchingResult> {
  assertAdmin(viewer);
  const id = parseAdminInput(recordIdSchema, requestId);

  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const request = await trx
      .selectFrom("repair_requests as r")
      .innerJoin("service_categories as c", "c.id", "r.category_id")
      .innerJoin("users as cu", "cu.id", "r.customer_id")
      .leftJoin("pilot_zips as pz", "pz.zip", "r.zip")
      .select([
        "r.id",
        "r.status",
        "r.zip",
        "r.customer_id",
        "cu.display_name as customer_name",
        "c.name as category_name",
        "c.enabled as category_enabled",
        "pz.enabled as zip_enabled",
      ])
      .where("r.id", "=", id)
      .executeTakeFirst();
    if (!request) throw new DomainError("not_found", "That repair request was not found.");

    const status = oneOf(REQUEST_STATUSES, request.status, "repair_requests.status");
    const blockedReason = rerunBlockedReason({
      status,
      categoryName: request.category_name,
      categoryEnabled: request.category_enabled === 1,
      zip: request.zip,
      zipEnabled: request.zip_enabled === 1,
    });
    if (blockedReason) throw new DomainError("conflict", blockedReason, { requestId: id, status });

    const result = await runMatching(trx, { requestId: id, now: ctx.now, mode: "rematch" });
    const newlyNotified: PersonRef[] =
      result.newlyNotifiedMechanicIds.length === 0
        ? []
        : await trx
            .selectFrom("mechanic_profiles")
            .select(["user_id as id", "display_name as displayName"])
            .where("user_id", "in", result.newlyNotifiedMechanicIds)
            .execute();
    const order = new Map(result.newlyNotifiedMechanicIds.map((mechanicId, index) => [mechanicId, index]));
    newlyNotified.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    if (newlyNotified.length > 0) {
      const title = `${pluralize(newlyNotified.length, "more mechanic")} notified`;
      const body =
        `We notified ${pluralize(newlyNotified.length, "more mechanic")} about your ${request.category_name.toLowerCase()} request. ` +
        `${pluralize(result.notifiedCount, "mechanic has", "mechanics have")} been notified in total. You'll be told when a quote arrives.`;
      const linkPath = `/requests/${id}`;
      await notify(trx, {
        userId: request.customer_id,
        type: "request.rematched",
        title,
        body,
        linkPath,
        email: { subject: title, text: emailText(request.customer_name, [body], linkPath), template: "request_rematched" },
        at: ctx.now,
      });
    }

    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.matchingRerun,
      entityType: "request",
      entityId: id,
      metadata: {
        newlyNotifiedMechanicIds: result.newlyNotifiedMechanicIds,
        notifiedCount: result.notifiedCount,
        eligibleCount: result.eligibleCount,
        evaluatedCount: result.evaluatedCount,
      },
      at: ctx.now,
    });

    return {
      requestId: id,
      notifiedCount: result.notifiedCount,
      newlyNotifiedCount: newlyNotified.length,
      newlyNotified,
      evaluatedCount: result.evaluatedCount,
      eligibleCount: result.eligibleCount,
    };
  });
}
