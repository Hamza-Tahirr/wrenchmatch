import "server-only";

import type { QuoteStatus, RequestStatus } from "@/lib/domain";

// Effective statuses for display. Reads never write, so expiry that expireStaleRecords has
// not stored yet is applied logically here with the same rules (src/server/expiry.ts):
// open/quoted requests past expires_at are expired together with their submitted quotes;
// submitted quotes past their own expires_at are expired; a quoted request left without a
// live quote is open again.

export type StoredRequestState = { status: RequestStatus; expiresAt: string | null };
export type StoredQuoteState = { status: QuoteStatus; expiresAt: string };

/** Timestamps are UTC ISO strings, which compare correctly as text. */
function reached(iso: string | null, nowIso: string): boolean {
  return iso !== null && iso <= nowIso;
}

export function isRequestExpired(request: StoredRequestState, nowIso: string): boolean {
  if (request.status === "expired") return true;
  return (request.status === "open" || request.status === "quoted") && reached(request.expiresAt, nowIso);
}

export function effectiveQuoteStatus(
  quote: StoredQuoteState,
  requestExpired: boolean,
  nowIso: string,
): QuoteStatus {
  if (quote.status === "submitted" && (requestExpired || reached(quote.expiresAt, nowIso))) return "expired";
  return quote.status;
}

/** `quoteStatuses` are the request's quotes' effective statuses. */
export function effectiveRequestStatus(
  request: StoredRequestState,
  quoteStatuses: readonly QuoteStatus[],
  nowIso: string,
): RequestStatus {
  if (isRequestExpired(request, nowIso)) return "expired";
  if (request.status === "open" || request.status === "quoted") {
    const live = quoteStatuses.some((status) => status === "submitted" || status === "selected");
    return live ? "quoted" : "open";
  }
  return request.status;
}
