import "server-only";

import type { Tx } from "@/server/db/tx";

export type ExpiryCounts = {
  /** open/quoted requests whose 7-day window ended */
  requestsExpired: number;
  /** submitted quotes that expired (their own expiry, or their request's) */
  quotesExpired: number;
  /** quoted requests left without a live quote, moved back to open */
  requestsReopened: number;
};

/**
 * Applies time-based transitions as of `now`. Call it at the start of every transaction
 * whose decisions depend on expiry (submitting or selecting quotes, listing open jobs...).
 *
 * 1. open/quoted requests with expires_at <= now become expired, with their submitted quotes;
 * 2. remaining submitted quotes with expires_at <= now become expired;
 * 3. quoted requests left with no submitted or selected quote go back to open.
 */
export async function expireStaleRecords(trx: Tx, now: Date): Promise<ExpiryCounts> {
  const nowIso = now.toISOString();

  const expiringRequests = trx
    .selectFrom("repair_requests")
    .select("id")
    .where("status", "in", ["open", "quoted"])
    .where("expires_at", "<=", nowIso);

  const quotesOfExpiredRequests = await trx
    .updateTable("quotes")
    .set({ status: "expired", updated_at: nowIso })
    .where("status", "=", "submitted")
    .where("request_id", "in", expiringRequests)
    .executeTakeFirst();

  const expiredRequests = await trx
    .updateTable("repair_requests")
    .set({ status: "expired", updated_at: nowIso })
    .where("status", "in", ["open", "quoted"])
    .where("expires_at", "<=", nowIso)
    .executeTakeFirst();

  const expiredQuotes = await trx
    .updateTable("quotes")
    .set({ status: "expired", updated_at: nowIso })
    .where("status", "=", "submitted")
    .where("expires_at", "<=", nowIso)
    .executeTakeFirst();

  const reopened = await trx
    .updateTable("repair_requests")
    .set({ status: "open", updated_at: nowIso })
    .where("status", "=", "quoted")
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("quotes")
            .select("quotes.id")
            .whereRef("quotes.request_id", "=", "repair_requests.id")
            .where("quotes.status", "in", ["submitted", "selected"]),
        ),
      ),
    )
    .executeTakeFirst();

  return {
    requestsExpired: Number(expiredRequests.numUpdatedRows),
    quotesExpired: Number(quotesOfExpiredRequests.numUpdatedRows) + Number(expiredQuotes.numUpdatedRows),
    requestsReopened: Number(reopened.numUpdatedRows),
  };
}
