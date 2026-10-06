import "server-only";

import { JOB_MATCH_STATUSES, REQUEST_STATUSES, type JobMatchStatus } from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";

import { assertMechanic, loadMechanicState, oneOf } from "./access";
import { jobEligibility } from "./eligibility";
import { isRequestOpenForQuotes } from "./labels";

// A mechanic's response to a matched job: Interested (notified or passed -> interested) or
// Pass (notified/interested -> passed). Both require this mechanic's job match; repeating an
// action is a no-op.

export type JobMatchResult = { requestId: string; matchStatus: JobMatchStatus };

const notFound = () => new DomainError("not_found", "That job wasn't found.");

/**
 * Marks a matched job as interesting. Requires an approved account and a request still open
 * for quotes. Already interested or quoted: returns the current status unchanged.
 */
export async function markInterested(ctx: AppContext, viewer: Viewer, requestId: string): Promise<JobMatchResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const match = await trx
      .selectFrom("job_matches as jm")
      .innerJoin("repair_requests as r", "r.id", "jm.request_id")
      .select(["jm.id", "jm.status", "r.status as request_status", "r.expires_at"])
      .where("jm.request_id", "=", requestId)
      .where("jm.mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!match) throw notFound();
    const state = await loadMechanicState(trx, viewer.id);
    if (!state || state.status !== "approved") {
      const eligibility = jobEligibility(state, state ? todayInZone(ctx.now, state.timeZone) : nowIso.slice(0, 10));
      throw new DomainError("mechanic_not_eligible", eligibility.message, { reason: eligibility.reason ?? null });
    }
    const status = oneOf(JOB_MATCH_STATUSES, match.status, "job_matches.status");
    if (status === "interested" || status === "quoted") return { requestId, matchStatus: status };
    const requestStatus = oneOf(REQUEST_STATUSES, match.request_status, "repair_requests.status");
    if (!isRequestOpenForQuotes(requestStatus, match.expires_at, nowIso)) {
      throw new DomainError("conflict", "This job is no longer available.");
    }
    await trx
      .updateTable("job_matches")
      .set({ status: "interested", updated_at: nowIso })
      .where("id", "=", match.id)
      .execute();
    return { requestId, matchStatus: "interested" };
  });
}

/**
 * Hides a matched job from the board (any account state). Not allowed while the mechanic has
 * an active (submitted or selected) quote on it: withdraw that first.
 */
export async function passJob(ctx: AppContext, viewer: Viewer, requestId: string): Promise<JobMatchResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const match = await trx
      .selectFrom("job_matches")
      .select(["id", "status"])
      .where("request_id", "=", requestId)
      .where("mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!match) throw notFound();
    if (match.status === "passed") return { requestId, matchStatus: "passed" };
    const activeQuote = await trx
      .selectFrom("quotes")
      .select("id")
      .where("request_id", "=", requestId)
      .where("mechanic_id", "=", viewer.id)
      .where("status", "in", ["submitted", "selected"])
      .executeTakeFirst();
    if (activeQuote) {
      throw new DomainError(
        "conflict",
        "You have an active quote on this job. Withdraw it first if you can't do the job.",
      );
    }
    await trx
      .updateTable("job_matches")
      .set({ status: "passed", updated_at: nowIso })
      .where("id", "=", match.id)
      .execute();
    return { requestId, matchStatus: "passed" };
  });
}
