import "server-only";

import type { RequestStatus } from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import type { Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";

import { jobMatchedMessage } from "./job-matched-message";
import {
  loadMechanicCandidates,
  loadRequestForMatching,
  type MechanicCandidate,
  type RequestForMatching,
} from "./load";
import {
  evaluateMechanic,
  selectMechanicsToNotify,
  type MatchRequest,
  type MechanicEvaluation,
} from "./rules";

export type MatchingMode = "initial" | "rematch";

export type RunMatchingInput = {
  requestId: string;
  /** The caller's clock (ctx.now): evaluation and notification time, and "today" for insurance. */
  now: Date;
  /** "initial" when the request is submitted; "rematch" to top up later, e.g. after an approval. */
  mode: MatchingMode;
};

export type RunMatchingResult = {
  /** Mechanic profiles evaluated: every profile, whatever its status. */
  evaluatedCount: number;
  /** How many of them are eligible for the request now. */
  eligibleCount: number;
  /** Mechanics notified about the request in total, this run included (= matched_count). */
  notifiedCount: number;
  /** The mechanics this run notified, closest first. */
  newlyNotifiedMechanicIds: string[];
};

/** Request statuses each mode may notify mechanics about. */
const MATCHABLE_STATUSES: Readonly<Record<MatchingMode, readonly RequestStatus[]>> = {
  initial: ["draft", "open"],
  rematch: ["open", "quoted"],
};

// Rows per multi-row INSERT, far below SQLite's bound-parameter limit.
const INSERT_CHUNK_ROWS = 500;

async function insertInChunks<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_ROWS) {
    await insert(rows.slice(start, start + INSERT_CHUNK_ROWS));
  }
}

function assertMatchable(request: RequestForMatching, input: RunMatchingInput): void {
  if (!MATCHABLE_STATUSES[input.mode].includes(request.status)) {
    throw new DomainError(
      "conflict",
      "This request is no longer open, so no mechanics can be notified about it.",
      { requestId: request.id, status: request.status },
    );
  }
  if (request.expiresAt !== null && request.expiresAt <= input.now.toISOString()) {
    throw new DomainError(
      "conflict",
      "This request has expired, so no mechanics can be notified about it.",
      { requestId: request.id },
    );
  }
}

function toMatchRequest(request: RequestForMatching, now: Date): MatchRequest {
  return {
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
}

/** Replaces the request's evaluations with this run's, one row per mechanic profile. */
async function saveEvaluations(
  trx: Tx,
  requestId: string,
  evaluations: readonly MechanicEvaluation[],
  notifiedIds: ReadonlySet<string>,
  nowIso: string,
): Promise<void> {
  await trx.deleteFrom("match_evaluations").where("request_id", "=", requestId).execute();
  const rows = evaluations.map((evaluation) => ({
    request_id: requestId,
    mechanic_id: evaluation.mechanicId,
    eligible: evaluation.eligible ? 1 : 0,
    // The schema allows notified only when eligible; job_matches keeps who was told.
    notified: evaluation.eligible && notifiedIds.has(evaluation.mechanicId) ? 1 : 0,
    distance_miles: evaluation.distanceMiles,
    reasons_json: JSON.stringify(evaluation.reasons),
    evaluated_at: nowIso,
  }));
  await insertInChunks(rows, (chunk) => trx.insertInto("match_evaluations").values(chunk).execute());
}

async function insertJobMatches(
  trx: Tx,
  requestId: string,
  selected: readonly MechanicEvaluation[],
  firstRank: number,
  nowIso: string,
): Promise<void> {
  const rows = selected.map((evaluation, index) => ({
    id: newId(),
    request_id: requestId,
    mechanic_id: evaluation.mechanicId,
    distance_miles: evaluation.distanceMiles,
    rank: firstRank + index,
    status: "notified",
    notified_at: nowIso,
    updated_at: nowIso,
  }));
  await insertInChunks(rows, (chunk) => trx.insertInto("job_matches").values(chunk).execute());
}

/** Sets matched_count to the number of job_matches rows actually stored, and returns it. */
async function updateMatchedCount(trx: Tx, requestId: string, nowIso: string): Promise<number> {
  const { count } = await trx
    .selectFrom("job_matches")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("request_id", "=", requestId)
    .executeTakeFirstOrThrow();
  await trx
    .updateTable("repair_requests")
    .set({ matched_count: count, updated_at: nowIso })
    .where("id", "=", requestId)
    .execute();
  return count;
}

async function notifyMechanics(
  trx: Tx,
  request: RequestForMatching,
  selected: readonly MechanicEvaluation[],
  mechanics: readonly MechanicCandidate[],
  now: Date,
): Promise<void> {
  const byId = new Map(mechanics.map((mechanic) => [mechanic.id, mechanic]));
  for (const evaluation of selected) {
    const mechanic = byId.get(evaluation.mechanicId);
    if (!mechanic) throw new Error(`Matched mechanic ${evaluation.mechanicId} was not loaded`);
    const message = jobMatchedMessage({
      requestId: request.id,
      mechanicDisplayName: mechanic.displayName,
      city: request.city,
      state: request.state,
      categoryName: request.categoryName,
      vehicleYear: request.vehicleYear,
      vehicleMake: request.vehicleMake,
      vehicleModel: request.vehicleModel,
      serviceMode: request.serviceMode,
      preferredDate: request.preferredDate,
      preferredWindow: request.preferredWindow,
      distanceMiles: evaluation.distanceMiles,
    });
    await notify(trx, { userId: mechanic.id, ...message, at: now });
  }
}

/**
 * Matches a repair request to mechanics inside the caller's transaction (it never opens one):
 *
 * 1. evaluates every mechanic profile with rules.ts and replaces the request's
 *    match_evaluations, reasons included, so admins can see why anyone was left out;
 * 2. selects the closest eligible mechanics not yet notified until MAX_MECHANICS_NOTIFIED
 *    have been notified in total. "initial" refuses a request that already has job_matches;
 *    "rematch" keeps the existing job_matches and only adds to them;
 * 3. inserts their job_matches (rank continues the notification order), sets
 *    repair_requests.matched_count to the actual number of job_matches and notifies each
 *    new mechanic in-app and in the dev mailbox (no contact details).
 *
 * Only mechanics are notified here; the caller tells the customer the resulting count.
 * Throws DomainError not_found for an unknown request, and conflict when the request is
 * no longer open or has expired, or for a repeated "initial" run.
 */
export async function runMatching(trx: Tx, input: RunMatchingInput): Promise<RunMatchingResult> {
  const request = await loadRequestForMatching(trx, input.requestId);
  if (!request) throw new DomainError("not_found", "That repair request was not found.");
  assertMatchable(request, input);

  const existing = await trx
    .selectFrom("job_matches")
    .select(["mechanic_id", "rank"])
    .where("request_id", "=", request.id)
    .execute();
  if (input.mode === "initial" && existing.length > 0) {
    throw new DomainError("conflict", "Mechanics have already been notified about this request.", {
      requestId: request.id,
    });
  }

  const nowIso = input.now.toISOString();
  const matchRequest = toMatchRequest(request, input.now);
  const mechanics = await loadMechanicCandidates(trx);
  const evaluations = mechanics.map((mechanic) => evaluateMechanic(matchRequest, mechanic));

  const alreadyNotified = new Set(existing.map((row) => row.mechanic_id));
  const selected = selectMechanicsToNotify(
    evaluations.filter((evaluation) => !alreadyNotified.has(evaluation.mechanicId)),
    Math.max(0, MAX_MECHANICS_NOTIFIED - existing.length),
  );
  const notifiedIds = new Set([...alreadyNotified, ...selected.map((evaluation) => evaluation.mechanicId)]);
  const firstRank = existing.reduce((highest, row) => Math.max(highest, row.rank), 0) + 1;

  await saveEvaluations(trx, request.id, evaluations, notifiedIds, nowIso);
  await insertJobMatches(trx, request.id, selected, firstRank, nowIso);
  const notifiedCount = await updateMatchedCount(trx, request.id, nowIso);
  await notifyMechanics(trx, request, selected, mechanics, input.now);

  return {
    evaluatedCount: evaluations.length,
    eligibleCount: evaluations.filter((evaluation) => evaluation.eligible).length,
    notifiedCount,
    newlyNotifiedMechanicIds: selected.map((evaluation) => evaluation.mechanicId),
  };
}
