import "server-only";

import type { Kysely } from "kysely";

import { QUOTE_SERVICE_MODES, QUOTE_STATUSES, type QuoteServiceMode, type QuoteStatus } from "@/lib/domain";
import type { DB } from "@/server/db/schema.generated";
import { QUOTE_ITEM_KINDS, type QuoteItemKind } from "@/server/pricing";

import { effectiveQuoteStatusSql } from "./effective-status";
import { vehicleLabel } from "./request-items";
import { oneOf, type PersonRef } from "./types";

// Quotes as the admin sees them: immutable terms and server-computed totals, with the
// status as of now (a submitted quote past its expiry shows as "expired").

export type AdminQuoteListItem = {
  id: string;
  requestId: string;
  /** Status as of now. */
  status: QuoteStatus;
  /** Status stored in the database (lags `status` until expiry is next applied). */
  storedStatus: QuoteStatus;
  mechanic: PersonRef;
  customer: PersonRef;
  categoryName: string;
  vehicle: string;
  areaLabel: string;
  /** The request's IANA zone; format the slot and expiry with it. */
  timeZone: string;
  serviceMode: QuoteServiceMode;
  partsIncluded: boolean;
  currency: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  slotStartAt: string;
  slotEndAt: string;
  estimatedDurationMinutes: number;
  expiresAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  isDemoFixture: boolean;
};

export type AdminQuoteLineItem = {
  id: string;
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

/** A quote on the request detail page: terms, notes and line items. */
export type AdminQuoteDetail = AdminQuoteListItem & {
  scope: string;
  exclusions: string | null;
  notes: string | null;
  items: AdminQuoteLineItem[];
};

/** quotes (q) with request (r), category (c), customer (cu) and mechanic profile (mp). */
export function quoteItemsFrom(db: Kysely<DB>) {
  return db
    .selectFrom("quotes as q")
    .innerJoin("repair_requests as r", "r.id", "q.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("users as cu", "cu.id", "r.customer_id")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "q.mechanic_id");
}

export type QuoteItemsFrom = ReturnType<typeof quoteItemsFrom>;

export function selectQuoteItems(from: QuoteItemsFrom, nowIso: string) {
  return from.select([
    "q.id",
    "q.request_id",
    "q.status",
    "q.mechanic_id",
    "mp.display_name as mechanic_name",
    "r.customer_id",
    "cu.display_name as customer_name",
    "c.name as category_name",
    "r.vehicle_year",
    "r.vehicle_make",
    "r.vehicle_model",
    "r.area_label",
    "r.time_zone",
    "q.service_mode",
    "q.parts_included",
    "q.currency",
    "q.labor_cents",
    "q.parts_cents",
    "q.tax_cents",
    "q.fee_cents",
    "q.total_cents",
    "q.slot_start_at",
    "q.slot_end_at",
    "q.estimated_duration_minutes",
    "q.expires_at",
    "q.created_at",
    "q.withdrawn_at",
    "q.is_demo_fixture",
    "q.scope",
    "q.exclusions",
    "q.notes",
    effectiveQuoteStatusSql("q", "r", nowIso).as("effective_status"),
  ]);
}

type QuoteItemRow = Awaited<ReturnType<ReturnType<typeof selectQuoteItems>["execute"]>>[number];

export function toQuoteListItem(row: QuoteItemRow): AdminQuoteListItem {
  return {
    id: row.id,
    requestId: row.request_id,
    status: oneOf(QUOTE_STATUSES, row.effective_status, "effective quote status"),
    storedStatus: oneOf(QUOTE_STATUSES, row.status, "quotes.status"),
    mechanic: { id: row.mechanic_id, displayName: row.mechanic_name },
    customer: { id: row.customer_id, displayName: row.customer_name },
    categoryName: row.category_name,
    vehicle: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    areaLabel: row.area_label,
    timeZone: row.time_zone,
    serviceMode: oneOf(QUOTE_SERVICE_MODES, row.service_mode, "quotes.service_mode"),
    partsIncluded: row.parts_included === 1,
    currency: row.currency,
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    slotStartAt: row.slot_start_at,
    slotEndAt: row.slot_end_at,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    withdrawnAt: row.withdrawn_at,
    isDemoFixture: row.is_demo_fixture === 1,
  };
}

export function toQuoteDetail(row: QuoteItemRow, items: AdminQuoteLineItem[]): AdminQuoteDetail {
  return { ...toQuoteListItem(row), scope: row.scope, exclusions: row.exclusions, notes: row.notes, items };
}

/** Line items of the given quotes, in their saved order, grouped by quote id. */
export async function loadQuoteLineItems(
  db: Kysely<DB>,
  quoteIds: readonly string[],
): Promise<Map<string, AdminQuoteLineItem[]>> {
  if (quoteIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("quote_items")
    .select(["id", "quote_id", "kind", "description", "quantity", "unit_price_cents", "amount_cents"])
    .where("quote_id", "in", quoteIds)
    .orderBy("quote_id")
    .orderBy("sort_order")
    .execute();
  const grouped = new Map<string, AdminQuoteLineItem[]>();
  for (const row of rows) {
    const items = grouped.get(row.quote_id) ?? [];
    items.push({
      id: row.id,
      kind: oneOf(QUOTE_ITEM_KINDS, row.kind, "quote_items.kind"),
      description: row.description,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      amountCents: row.amount_cents,
    });
    grouped.set(row.quote_id, items);
  }
  return grouped;
}
