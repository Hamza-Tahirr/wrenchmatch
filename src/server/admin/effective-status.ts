import "server-only";

import { sql, type RawBuilder } from "kysely";

// Statuses as of `now` for read-only admin views, without waiting for expireStaleRecords
// (src/server/expiry.ts) to persist the time-based transitions. The rules are the same,
// and tests check that both agree:
//   * an open/quoted request whose expires_at has passed is expired;
//   * a quoted request left without a live quote (submitted and unexpired, or selected) is open;
//   * a submitted quote whose expires_at has passed, or whose request expired, is expired.

const ref = (alias: string, column: string) => sql.ref(`${alias}.${column}`);

/** The request's status as of `nowIso`; `alias` names repair_requests in the surrounding query. */
export function effectiveRequestStatusSql(alias: string, nowIso: string): RawBuilder<string> {
  return sql<string>`(CASE
    WHEN ${ref(alias, "status")} IN ('open', 'quoted') AND ${ref(alias, "expires_at")} <= ${nowIso} THEN 'expired'
    WHEN ${ref(alias, "status")} = 'quoted' AND NOT EXISTS (
      SELECT 1 FROM quotes AS live_quote
      WHERE live_quote.request_id = ${ref(alias, "id")}
        AND (live_quote.status = 'selected'
          OR (live_quote.status = 'submitted' AND live_quote.expires_at > ${nowIso}))
    ) THEN 'open'
    ELSE ${ref(alias, "status")}
  END)`;
}

/**
 * The quote's status as of `nowIso`. `quoteAlias` names quotes and `requestAlias` its
 * repair_requests row (joined) in the surrounding query.
 */
export function effectiveQuoteStatusSql(quoteAlias: string, requestAlias: string, nowIso: string): RawBuilder<string> {
  return sql<string>`(CASE
    WHEN ${ref(quoteAlias, "status")} = 'submitted' AND (
      ${ref(quoteAlias, "expires_at")} <= ${nowIso}
      OR (${ref(requestAlias, "status")} IN ('open', 'quoted') AND ${ref(requestAlias, "expires_at")} <= ${nowIso})
    ) THEN 'expired'
    ELSE ${ref(quoteAlias, "status")}
  END)`;
}

/** Live quotes on a request (effectively "submitted" now); `alias` names repair_requests. */
export function activeQuoteCountSql(alias: string, nowIso: string): RawBuilder<number> {
  return sql<number>`(SELECT count(*) FROM quotes AS active_quote
    WHERE active_quote.request_id = ${ref(alias, "id")}
      AND active_quote.status = 'submitted'
      AND active_quote.expires_at > ${nowIso}
      AND NOT (${ref(alias, "status")} IN ('open', 'quoted') AND ${ref(alias, "expires_at")} <= ${nowIso}))`;
}
