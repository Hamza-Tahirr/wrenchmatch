import "server-only";

import type { Kysely } from "kysely";

import {
  QUOTE_SERVICE_MODE_INFO,
  QUOTE_SERVICE_MODES,
  QUOTE_STATUS_INFO,
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  type BadgeTone,
  type QuoteServiceMode,
  type QuoteStatus,
  type RequestStatus,
} from "@/lib/domain";
import { utcToZonedParts, todayInZone } from "@/lib/time";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { DomainError } from "@/server/errors";
import type { GeoPoint } from "@/server/matching/geo";
import {
  computeQuoteTotals,
  platformFeeCents,
  sameQuoteTotals,
  QUOTE_ITEM_KINDS,
  type QuoteItemKind,
  type QuoteTotals,
} from "@/server/pricing";
import { PLATFORM_FEE_BPS } from "@/server/config";

import { assertCustomer, notFound } from "./access";
import { bookingIneligibility } from "./eligibility";
import { loadMechanicsForCustomer, withViewablePhotos, type MechanicPublicProfile } from "./mechanic-public";
import { groupBy, oneOf } from "./rows";
import { effectiveQuoteStatus, effectiveRequestStatus, isRequestExpired } from "./status";

// Quote comparison for the customer who owns the request: itemized lines, stored totals
// cross-checked against pricing.ts, the provisional platform fee, the slot, terms and the
// mechanic's public profile. Mechanic contact details are never part of it.

export type QuoteLineItem = {
  id: string;
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type QuoteLineGroups = {
  labor: QuoteLineItem[];
  parts: QuoteLineItem[];
  taxes: QuoteLineItem[];
  fees: QuoteLineItem[];
};

export type QuotePlatformFee = {
  /** Basis points of labor (1000 = the provisional 10%). */
  bps: number;
  cents: number;
  /** The fee is part of the quoted total, not added on top. */
  includedInTotal: true;
};

export type QuoteComparisonItem = {
  id: string;
  requestId: string;
  /** Effective status (expiry applied for display). */
  status: QuoteStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  isDemoFixture: boolean;
  serviceMode: QuoteServiceMode;
  serviceModeLabel: string;
  partsIncluded: boolean;
  currency: string;
  lineItems: QuoteLineGroups;
  /** As stored on the quote (integer cents). */
  totals: QuoteTotals;
  /** True when the line items recompute (pricing.ts) to exactly the stored totals. */
  totalsVerified: boolean;
  platformFee: QuotePlatformFee;
  slotStartAt: string;
  slotEndAt: string;
  /** The request's IANA time zone; show slot times in it. */
  timeZone: string;
  estimatedDurationMinutes: number;
  scope: string;
  exclusions: string | null;
  notes: string | null;
  quotedAt: string;
  expiresAt: string;
  withdrawnAt: string | null;
  /** Whether "Reserve" (selecting the quote) can succeed right now. */
  isSelectable: boolean;
  /** Why it can't, in words for the customer; null when selectable. */
  unavailableReason: string | null;
  mechanic: MechanicPublicProfile;
};

export type QuoteComparisonSummary = {
  /** Quotes that can be selected now. */
  selectableCount: number;
  lowestTotalCents: number | null;
  earliestSlotStartAt: string | null;
};

export type RequestQuotes = {
  requestId: string;
  requestStatus: RequestStatus;
  timeZone: string;
  /** Selectable quotes first (cheapest first), then the rest, newest first. */
  quotes: QuoteComparisonItem[];
  summary: QuoteComparisonSummary;
};

/** The quote columns this module reads (explicit list; quotes hold no private data). */
export type StoredQuoteRow = {
  id: string;
  request_id: string;
  mechanic_id: string;
  status: string;
  service_mode: string;
  parts_included: number;
  currency: string;
  labor_cents: number;
  parts_cents: number;
  tax_cents: number;
  fee_cents: number;
  total_cents: number;
  slot_start_at: string;
  slot_end_at: string;
  estimated_duration_minutes: number;
  scope: string;
  exclusions: string | null;
  notes: string | null;
  expires_at: string;
  withdrawn_at: string | null;
  is_demo_fixture: number;
  created_at: string;
};

/** The request facts the comparison needs. `status` must already be the effective status. */
export type QuoteRequestContext = {
  id: string;
  status: RequestStatus;
  expired: boolean;
  timeZone: string;
  point: GeoPoint;
};

export async function loadQuoteRows(db: Kysely<DB>, requestIds: readonly string[]): Promise<StoredQuoteRow[]> {
  if (requestIds.length === 0) return [];
  return db
    .selectFrom("quotes")
    .select([
      "id",
      "request_id",
      "mechanic_id",
      "status",
      "service_mode",
      "parts_included",
      "currency",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "fee_cents",
      "total_cents",
      "slot_start_at",
      "slot_end_at",
      "estimated_duration_minutes",
      "scope",
      "exclusions",
      "notes",
      "expires_at",
      "withdrawn_at",
      "is_demo_fixture",
      "created_at",
    ])
    .where("request_id", "in", requestIds)
    .orderBy("created_at")
    .execute();
}

export function storedQuoteStatus(row: Pick<StoredQuoteRow, "status">): QuoteStatus {
  return oneOf(QUOTE_STATUSES, row.status, "quotes.status");
}

export function storedTotals(
  row: Pick<StoredQuoteRow, "labor_cents" | "parts_cents" | "tax_cents" | "fee_cents" | "total_cents">,
): QuoteTotals {
  return {
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
  };
}

async function loadLineItems(db: Kysely<DB>, quoteIds: readonly string[]): Promise<Map<string, QuoteLineItem[]>> {
  if (quoteIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("quote_items")
    .select(["id", "quote_id", "kind", "description", "quantity", "unit_price_cents", "amount_cents"])
    .where("quote_id", "in", quoteIds)
    .orderBy("quote_id")
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
  const items = rows.map((row) => ({
    quoteId: row.quote_id,
    item: {
      id: row.id,
      kind: oneOf(QUOTE_ITEM_KINDS, row.kind, "quote_items.kind"),
      description: row.description,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      amountCents: row.amount_cents,
    },
  }));
  const grouped = groupBy(items, (entry) => entry.quoteId);
  return new Map([...grouped].map(([quoteId, entries]) => [quoteId, entries.map((entry) => entry.item)]));
}

export function groupLineItems(items: readonly QuoteLineItem[]): QuoteLineGroups {
  return {
    labor: items.filter((item) => item.kind === "labor"),
    parts: items.filter((item) => item.kind === "part"),
    taxes: items.filter((item) => item.kind === "tax"),
    fees: items.filter((item) => item.kind === "fee"),
  };
}

/** Recomputes the totals from the saved items and compares them with the stored ones. */
export function verifyTotals(stored: QuoteTotals, items: readonly QuoteLineItem[]): boolean {
  try {
    const recomputed = computeQuoteTotals(
      items.map((item) => ({ kind: item.kind, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
    );
    return (
      sameQuoteTotals(recomputed, stored) &&
      items.every((item) => item.amountCents === item.quantity * item.unitPriceCents)
    );
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

function declinedReason(requestStatus: RequestStatus): string {
  if (requestStatus === "reserved" || requestStatus === "booked") return "You reserved another quote for this request.";
  if (requestStatus === "cancelled") return "This request was cancelled.";
  return "This quote is no longer available.";
}

function requestClosedReason(requestStatus: RequestStatus): string | null {
  switch (requestStatus) {
    case "open":
    case "quoted":
      return null;
    case "reserved":
    case "booked":
      return "You've already reserved a quote for this request.";
    case "cancelled":
      return "This request was cancelled.";
    case "expired":
      return "This request has expired.";
    case "draft":
      return "This request hasn't been sent yet.";
  }
}

function unavailableReason(
  status: QuoteStatus,
  request: QuoteRequestContext,
  totalsVerified: boolean,
  mechanicBookable: boolean,
): string | null {
  switch (status) {
    case "selected":
      return "You reserved this quote.";
    case "withdrawn":
      return "The mechanic withdrew this quote.";
    case "expired":
      return "This quote has expired.";
    case "declined":
      return declinedReason(request.status);
    case "submitted":
      break;
  }
  const closed = requestClosedReason(request.status);
  if (closed) return closed;
  if (!totalsVerified) {
    return "This quote's prices don't add up, so it can't be reserved. Choose another quote or ask us for help.";
  }
  if (!mechanicBookable) return "This mechanic can't take new bookings right now.";
  return null;
}

function compareForDisplay(a: QuoteComparisonItem, b: QuoteComparisonItem): number {
  if (a.isSelectable !== b.isSelectable) return a.isSelectable ? -1 : 1;
  if (a.isSelectable) {
    if (a.totals.totalCents !== b.totals.totalCents) return a.totals.totalCents - b.totals.totalCents;
    return a.slotStartAt < b.slotStartAt ? -1 : a.slotStartAt > b.slotStartAt ? 1 : 0;
  }
  if ((a.status === "selected") !== (b.status === "selected")) return a.status === "selected" ? -1 : 1;
  return a.quotedAt > b.quotedAt ? -1 : a.quotedAt < b.quotedAt ? 1 : 0;
}

/**
 * Builds the comparison DTOs for quotes on one request. The caller has checked that the
 * viewer owns the request and passes its effective status. Read paths only (uses ctx.db).
 */
export async function buildQuoteComparison(
  ctx: AppContext,
  viewer: Viewer,
  request: QuoteRequestContext,
  rows: readonly StoredQuoteRow[],
): Promise<QuoteComparisonItem[]> {
  if (rows.length === 0) return [];
  const nowIso = ctx.now.toISOString();
  const itemsByQuote = await loadLineItems(ctx.db, rows.map((row) => row.id));
  const mechanics = await loadMechanicsForCustomer(ctx.db, rows.map((row) => row.mechanic_id), request.point, {
    viewerId: viewer.id,
  });
  const profiles = await withViewablePhotos(ctx, viewer, mechanics);
  const todayLocal = todayInZone(ctx.now, request.timeZone);

  const result: QuoteComparisonItem[] = [];
  for (const row of rows) {
    const mechanic = mechanics.get(row.mechanic_id);
    const profile = profiles.get(row.mechanic_id);
    if (!mechanic || !profile) throw new Error(`Mechanic ${row.mechanic_id} of quote ${row.id} was not loaded`);

    const status = effectiveQuoteStatus(
      { status: storedQuoteStatus(row), expiresAt: row.expires_at },
      request.expired,
      nowIso,
    );
    const items = itemsByQuote.get(row.id) ?? [];
    const totals = storedTotals(row);
    const totalsVerified = verifyTotals(totals, items);
    const slotDateLocal = utcToZonedParts(new Date(row.slot_start_at), request.timeZone).date;
    const bookable = bookingIneligibility(mechanic.bookingFacts, { todayLocal, slotDateLocal }) === null;
    const reason = unavailableReason(status, request, totalsVerified, bookable);
    const serviceMode = oneOf(QUOTE_SERVICE_MODES, row.service_mode, "quotes.service_mode");

    result.push({
      id: row.id,
      requestId: row.request_id,
      status,
      statusLabel: QUOTE_STATUS_INFO[status].label,
      statusTone: QUOTE_STATUS_INFO[status].tone,
      isDemoFixture: row.is_demo_fixture === 1,
      serviceMode,
      serviceModeLabel: QUOTE_SERVICE_MODE_INFO[serviceMode].label,
      partsIncluded: row.parts_included === 1,
      currency: row.currency,
      lineItems: groupLineItems(items),
      totals,
      totalsVerified,
      platformFee: { bps: PLATFORM_FEE_BPS, cents: platformFeeCents(row.labor_cents), includedInTotal: true },
      slotStartAt: row.slot_start_at,
      slotEndAt: row.slot_end_at,
      timeZone: request.timeZone,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      scope: row.scope,
      exclusions: row.exclusions,
      notes: row.notes,
      quotedAt: row.created_at,
      expiresAt: row.expires_at,
      withdrawnAt: row.withdrawn_at,
      isSelectable: reason === null,
      unavailableReason: reason,
      mechanic: profile,
    });
  }
  return result.sort(compareForDisplay);
}

export function summarizeQuotes(quotes: readonly QuoteComparisonItem[]): QuoteComparisonSummary {
  const selectable = quotes.filter((quote) => quote.isSelectable);
  return {
    selectableCount: selectable.length,
    lowestTotalCents: selectable.length > 0 ? Math.min(...selectable.map((quote) => quote.totals.totalCents)) : null,
    earliestSlotStartAt:
      selectable.length > 0 ? selectable.map((quote) => quote.slotStartAt).sort()[0] : null,
  };
}

/** Loads one of the viewer's requests with its quotes' effective statuses (not_found otherwise). */
export async function loadOwnRequestForQuotes(
  ctx: AppContext,
  viewer: Viewer,
  requestId: string,
): Promise<{ request: QuoteRequestContext; rows: StoredQuoteRow[] }> {
  const row = await ctx.db
    .selectFrom("repair_requests")
    .select(["id", "status", "expires_at", "time_zone", "approx_lat", "approx_lng"])
    .where("id", "=", requestId)
    .where("customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("request");

  const nowIso = ctx.now.toISOString();
  const stored = { status: oneOf(REQUEST_STATUSES, row.status, "repair_requests.status"), expiresAt: row.expires_at };
  const expired = isRequestExpired(stored, nowIso);
  const rows = await loadQuoteRows(ctx.db, [row.id]);
  const statuses = rows.map((quote) =>
    effectiveQuoteStatus({ status: storedQuoteStatus(quote), expiresAt: quote.expires_at }, expired, nowIso),
  );
  return {
    request: {
      id: row.id,
      status: effectiveRequestStatus(stored, statuses, nowIso),
      expired,
      timeZone: row.time_zone,
      point: { lat: row.approx_lat, lng: row.approx_lng },
    },
    rows,
  };
}

/** Every quote on one of the viewer's requests, ready to compare. Other people's requests: not_found. */
export async function listQuotesForMyRequest(
  ctx: AppContext,
  viewer: Viewer,
  requestId: string,
): Promise<RequestQuotes> {
  assertCustomer(viewer);
  const { request, rows } = await loadOwnRequestForQuotes(ctx, viewer, requestId);
  const quotes = await buildQuoteComparison(ctx, viewer, request, rows);
  return {
    requestId: request.id,
    requestStatus: request.status,
    timeZone: request.timeZone,
    quotes,
    summary: summarizeQuotes(quotes),
  };
}
