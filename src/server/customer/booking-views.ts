import "server-only";

import { sql, type Kysely } from "kysely";
import { z } from "zod";

import {
  BOOKING_STATUS_INFO,
  BOOKING_STATUSES,
  CHANGE_ORDER_STATUS_INFO,
  CHANGE_ORDER_STATUSES,
  PREFERRED_WINDOW_INFO,
  PREFERRED_WINDOWS,
  QUOTE_SERVICE_MODE_INFO,
  QUOTE_SERVICE_MODES,
  type BadgeTone,
  type BookingStatus,
  type ChangeOrderStatus,
  type QuoteServiceMode,
} from "@/lib/domain";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { getPaymentGateway } from "@/server/payments";
import { QUOTE_ITEM_KINDS } from "@/server/pricing";

import { notFound } from "./access";
import { loadMechanicsForCustomer, withViewablePhotos, type MechanicPublicProfile } from "./mechanic-public";
import { groupLineItems, verifyTotals, type QuoteLineGroups, type QuoteLineItem } from "./quotes";
import { oneOf, parseJson, requestTitle, vehicleLabel } from "./rows";
import { parseConsentRecord, parseQuoteSnapshot, type ConsentRecord, type ParsedQuoteSnapshot } from "./snapshots";

// Read models for the customer's reservations and (demo) bookings. Money comes only from
// the booking's own snapshot columns, the line items from its quote snapshot. Mechanic
// contact details are read only for confirmed / in-progress / completed / disputed
// bookings (only demo fixtures can be in those states while payments are not connected).
// Payout state is the mechanic's business and is never part of these DTOs.

/** Booking states in which the customer sees the mechanic's phone and email. */
export const CONTACT_VISIBLE_STATUSES = ["confirmed", "in_progress", "completed", "disputed"] as const;
/** Booking states in which change orders can be approved or declined. */
const CHANGE_ORDER_DECISION_STATUSES: readonly BookingStatus[] = ["confirmed", "in_progress"];

/** Payment copy while online payments are not connected (presentation mode: never "paid"). */
export const ONLINE_PAYMENTS_SOON_LABEL = "Online payments are coming soon";
export const ONLINE_PAYMENT_SOON_SHORT = "Online payment: coming soon";

export type BookingMoneyView = {
  currency: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  /** Provisional platform fee: basis points of labor (1000 = 10%). */
  platformFeeBps: number;
  /** Included in totalCents, not added on top. */
  platformFeeCents: number;
};

export type BookingPaymentView = {
  state: "stripe_not_connected" | "demo_fixture_no_real_payment";
  /** "Online payments are coming soon" (pending reservations) or "Online payment: coming soon" (bookings). */
  label: string;
  description: string;
  /** Always false in this build: no checkout, card input or pay button. */
  gatewayConnected: boolean;
};

export type CustomerBookingSummary = {
  id: string;
  requestId: string;
  quoteId: string;
  /** "Battery replacement · 2016 Honda Civic" */
  title: string;
  categoryName: string;
  vehicleLabel: string;
  status: BookingStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  /** A seeded booking (inserted confirmed/in progress/completed; no payment taken). Never labelled in the UI. */
  isDemoFixture: boolean;
  mechanicId: string;
  mechanicDisplayName: string;
  serviceMode: QuoteServiceMode;
  serviceModeLabel: string;
  slotStartAt: string;
  slotEndAt: string;
  /** The request's IANA time zone. */
  timeZone: string;
  totalCents: number;
  currency: string;
  /** When the reservation was made. */
  createdAt: string;
  pendingChangeOrderCount: number;
  hasInvoice: boolean;
  hasReview: boolean;
  /** Completed and not reviewed yet. */
  canReview: boolean;
  /** A pending reservation the customer may cancel. */
  canCancel: boolean;
};

export type ChangeOrderView = {
  id: string;
  description: string;
  reason: string;
  currency: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  amountCents: number;
  status: ChangeOrderStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  /** "Online payment: coming soon (nothing has been charged)": no change order moves money. */
  paymentLabel: string;
  isDemoFixture: boolean;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Proposed, on a confirmed or in-progress booking: approve / decline buttons. */
  canDecide: boolean;
};

export type InvoiceLineView = {
  kind: string | null;
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  amountCents: number;
};

export type InvoiceView = {
  id: string;
  invoiceNumber: string;
  currency: string;
  lineItems: InvoiceLineView[];
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  platformFeeBps: number;
  /** Included in totalCents. */
  platformFeeCents: number;
  approvedChangeOrderCount: number;
  notes: string | null;
  issuedAt: string;
  isDemoFixture: boolean;
};

export type ReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  isDemoFixture: boolean;
  /** Demo-fixture reviews never count toward the mechanic's rating. */
  countsTowardRating: boolean;
};

export type MechanicContactView = {
  phone: string;
  email: string;
  /** Only for garage bookings. */
  garageAddress: { line1: string | null; city: string | null; state: string | null; zip: string | null } | null;
};

export type ContactVisibility = "visible" | "hidden_until_confirmed" | "hidden";

export type CustomerBookingDetail = CustomerBookingSummary & {
  money: BookingMoneyView;
  /** From the quote snapshot stored with the booking. */
  lineItems: QuoteLineGroups;
  terms: {
    scope: string;
    exclusions: string | null;
    notes: string | null;
    partsIncluded: boolean;
    estimatedDurationMinutes: number;
    quotedAt: string;
    quoteExpiresAt: string;
    /** When the server froze the price (the selection time). */
    snapshotTakenAt: string;
  };
  /** The booking consents accepted, with exact text, version and time. */
  consent: ConsentRecord | null;
  payment: BookingPaymentView;
  request: {
    id: string;
    areaLabel: string;
    /** The request ZIP's centroid, for maps (approximate; the exact address stays private). */
    approxLocation: { lat: number; lng: number };
    description: string;
    preferredDate: string;
    preferredWindowLabel: string;
    drivable: boolean;
  };
  /** Where the work happens. The customer's own address is theirs to see. */
  serviceLocation: {
    mode: QuoteServiceMode;
    label: string;
    customerAddress: {
      streetAddress: string | null;
      city: string | null;
      state: string | null;
      locationNotes: string | null;
    } | null;
  };
  mechanic: MechanicPublicProfile;
  /** "hidden_until_confirmed" for pending reservations: contact details unlock after a confirmed booking. */
  contactVisibility: ContactVisibility;
  mechanicContact: MechanicContactView | null;
  progress: {
    reservedAt: string;
    confirmedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
  };
  changeOrders: ChangeOrderView[];
  invoice: InvoiceView | null;
  review: ReviewView | null;
};

function bookingRows(db: Kysely<DB>) {
  return db
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("mechanic_profiles as m", "m.user_id", "b.mechanic_id")
    .select([
      "b.id",
      "b.request_id",
      "b.quote_id",
      "b.mechanic_id",
      "b.status",
      "b.payment_state",
      "b.service_mode",
      "b.slot_start_at",
      "b.slot_end_at",
      "b.currency",
      "b.labor_cents",
      "b.parts_cents",
      "b.tax_cents",
      "b.fee_cents",
      "b.total_cents",
      "b.platform_fee_bps",
      "b.platform_fee_cents",
      "b.quote_snapshot_json",
      "b.consent_snapshot_json",
      "b.is_demo_fixture",
      "b.created_at",
      "b.confirmed_at",
      "b.started_at",
      "b.completed_at",
      "b.cancelled_at",
      "b.cancel_reason",
      "r.time_zone",
      "r.area_label",
      "r.approx_lat",
      "r.approx_lng",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.description",
      "r.drivable",
      "r.preferred_date",
      "r.preferred_window",
      "c.name as category_name",
      "m.display_name as mechanic_display_name",
    ]);
}

type BookingRow = Awaited<ReturnType<ReturnType<typeof bookingRows>["executeTakeFirstOrThrow"]>>;

type BookingCounts = { pendingChangeOrders: number; hasInvoice: boolean; hasReview: boolean };

async function loadCounts(db: Kysely<DB>, bookingIds: readonly string[]): Promise<Map<string, BookingCounts>> {
  const counts = new Map<string, BookingCounts>(
    bookingIds.map((id) => [id, { pendingChangeOrders: 0, hasInvoice: false, hasReview: false }]),
  );
  if (bookingIds.length === 0) return counts;
  const proposed = await db
    .selectFrom("change_orders")
    .select((eb) => ["booking_id", eb.fn.countAll<number>().as("count")])
    .where("booking_id", "in", bookingIds)
    .where("status", "=", "proposed")
    .groupBy("booking_id")
    .execute();
  const invoices = await db.selectFrom("invoices").select("booking_id").where("booking_id", "in", bookingIds).execute();
  const reviews = await db.selectFrom("reviews").select("booking_id").where("booking_id", "in", bookingIds).execute();
  for (const row of proposed) {
    const entry = counts.get(row.booking_id);
    if (entry) entry.pendingChangeOrders = Number(row.count);
  }
  for (const row of invoices) {
    const entry = counts.get(row.booking_id);
    if (entry) entry.hasInvoice = true;
  }
  for (const row of reviews) {
    const entry = counts.get(row.booking_id);
    if (entry) entry.hasReview = true;
  }
  return counts;
}

function toSummary(row: BookingRow, counts: BookingCounts | undefined): CustomerBookingSummary {
  const status = oneOf(BOOKING_STATUSES, row.status, "bookings.status");
  const serviceMode = oneOf(QUOTE_SERVICE_MODES, row.service_mode, "bookings.service_mode");
  const hasReview = counts?.hasReview ?? false;
  return {
    id: row.id,
    requestId: row.request_id,
    quoteId: row.quote_id,
    title: requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model),
    categoryName: row.category_name,
    vehicleLabel: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    status,
    statusLabel: BOOKING_STATUS_INFO[status].label,
    statusTone: BOOKING_STATUS_INFO[status].tone,
    isDemoFixture: row.is_demo_fixture === 1,
    mechanicId: row.mechanic_id,
    mechanicDisplayName: row.mechanic_display_name,
    serviceMode,
    serviceModeLabel: QUOTE_SERVICE_MODE_INFO[serviceMode].label,
    slotStartAt: row.slot_start_at,
    slotEndAt: row.slot_end_at,
    timeZone: row.time_zone,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: row.created_at,
    pendingChangeOrderCount: counts?.pendingChangeOrders ?? 0,
    hasInvoice: counts?.hasInvoice ?? false,
    hasReview,
    canReview: status === "completed" && !hasReview,
    canCancel: status === "pending_payment",
  };
}

/** The viewer's reservations and demo bookings, newest first (or just `bookingIds` of them). */
export async function loadBookingSummaries(
  ctx: AppContext,
  viewer: Viewer,
  options: { bookingIds?: readonly string[] } = {},
): Promise<CustomerBookingSummary[]> {
  if (options.bookingIds && options.bookingIds.length === 0) return [];
  let query = bookingRows(ctx.db).where("b.customer_id", "=", viewer.id);
  if (options.bookingIds) query = query.where("b.id", "in", options.bookingIds);
  const rows = await query.orderBy("b.created_at", "desc").orderBy(sql`b.rowid`, "desc").execute();
  const counts = await loadCounts(ctx.db, rows.map((row) => row.id));
  return rows.map((row) => toSummary(row, counts.get(row.id)));
}

function paymentView(state: string): BookingPaymentView {
  const gateway = getPaymentGateway().getStatus();
  if (state === "demo_fixture_no_real_payment") {
    return {
      state: "demo_fixture_no_real_payment",
      label: ONLINE_PAYMENT_SOON_SHORT,
      description: "Nothing has been charged online for this booking. Online payments are coming soon.",
      gatewayConnected: gateway.connected,
    };
  }
  return {
    state: "stripe_not_connected",
    label: ONLINE_PAYMENTS_SOON_LABEL,
    description:
      "You won't be charged now. No card details are collected, so this reservation stays pending until online payments launch.",
    gatewayConnected: gateway.connected,
  };
}

/** True when the items recompute (pricing.ts) to exactly the booking's stored money. */
function itemsMatchBooking(items: readonly QuoteLineItem[], row: BookingRow): boolean {
  return verifyTotals(
    {
      laborCents: row.labor_cents,
      partsCents: row.parts_cents,
      taxCents: row.tax_cents,
      feeCents: row.fee_cents,
      totalCents: row.total_cents,
    },
    items,
  );
}

/**
 * Line items from the booking's quote snapshot when they add up exactly to the booking's
 * money; otherwise (a smaller seeded snapshot, or one that doesn't add up) from the quote's
 * immutable items, which a trigger keeps equal to the booking's money.
 */
async function loadLineItems(db: Kysely<DB>, row: BookingRow, snapshot: ParsedQuoteSnapshot): Promise<QuoteLineItem[]> {
  if (snapshot.items) {
    const fromSnapshot = snapshot.items.map((item, index) => ({ id: `${row.quote_id}-${index}`, ...item }));
    if (itemsMatchBooking(fromSnapshot, row)) return fromSnapshot;
  }
  const items = await db
    .selectFrom("quote_items")
    .select(["id", "kind", "description", "quantity", "unit_price_cents", "amount_cents"])
    .where("quote_id", "=", row.quote_id)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
  return items.map((item) => ({
    id: item.id,
    kind: oneOf(QUOTE_ITEM_KINDS, item.kind, "quote_items.kind"),
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    amountCents: item.amount_cents,
  }));
}

async function loadTerms(
  db: Kysely<DB>,
  row: BookingRow,
  snapshot: ParsedQuoteSnapshot,
): Promise<CustomerBookingDetail["terms"]> {
  const quote = await db
    .selectFrom("quotes")
    .select(["scope", "exclusions", "notes", "parts_included", "estimated_duration_minutes", "created_at", "expires_at"])
    .where("id", "=", row.quote_id)
    .executeTakeFirstOrThrow();
  const terms = snapshot.terms;
  return {
    scope: terms.scope ?? quote.scope,
    exclusions: terms.exclusions !== undefined ? terms.exclusions : quote.exclusions,
    notes: terms.notes !== undefined ? terms.notes : quote.notes,
    partsIncluded: terms.partsIncluded ?? quote.parts_included === 1,
    estimatedDurationMinutes: terms.estimatedDurationMinutes ?? quote.estimated_duration_minutes,
    quotedAt: terms.quotedAt ?? quote.created_at,
    quoteExpiresAt: terms.expiresAt ?? quote.expires_at,
    snapshotTakenAt: snapshot.computedAt ?? row.created_at,
  };
}

const invoiceLineSchema = z.object({
  kind: z.string().optional(),
  description: z.string(),
  quantity: z.number().int().optional(),
  unitPriceCents: z.number().int().optional(),
  amountCents: z.number().int(),
});

/** Invoice lines as issued; snake_case keys from other writers are accepted too. */
function parseInvoiceLines(json: string): InvoiceLineView[] {
  const value = parseJson(json);
  if (!Array.isArray(value)) return [];
  const lines: InvoiceLineView[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const parsed = invoiceLineSchema.safeParse({
      kind: record.kind,
      description: record.description,
      quantity: record.quantity,
      unitPriceCents: record.unitPriceCents ?? record.unit_price_cents,
      amountCents: record.amountCents ?? record.amount_cents,
    });
    if (!parsed.success) continue;
    lines.push({
      kind: parsed.data.kind ?? null,
      description: parsed.data.description,
      quantity: parsed.data.quantity ?? null,
      unitPriceCents: parsed.data.unitPriceCents ?? null,
      amountCents: parsed.data.amountCents,
    });
  }
  return lines;
}

async function loadChangeOrders(db: Kysely<DB>, bookingId: string, bookingStatus: BookingStatus): Promise<ChangeOrderView[]> {
  const rows = await db
    .selectFrom("change_orders")
    .select([
      "id",
      "description",
      "reason",
      "currency",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "amount_cents",
      "status",
      "is_demo_fixture",
      "created_at",
      "decided_at",
      "decision_note",
    ])
    .where("booking_id", "=", bookingId)
    .orderBy("created_at", "desc")
    .orderBy(sql`rowid`, "desc")
    .execute();
  return rows.map((row) => {
    const status = oneOf(CHANGE_ORDER_STATUSES, row.status, "change_orders.status");
    return {
      id: row.id,
      description: row.description,
      reason: row.reason,
      currency: row.currency,
      laborCents: row.labor_cents,
      partsCents: row.parts_cents,
      taxCents: row.tax_cents,
      amountCents: row.amount_cents,
      status,
      statusLabel: CHANGE_ORDER_STATUS_INFO[status].label,
      statusTone: CHANGE_ORDER_STATUS_INFO[status].tone,
      paymentLabel: `${ONLINE_PAYMENT_SOON_SHORT} (nothing has been charged)`,
      isDemoFixture: row.is_demo_fixture === 1,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
      canDecide: status === "proposed" && CHANGE_ORDER_DECISION_STATUSES.includes(bookingStatus),
    };
  });
}

async function loadInvoice(db: Kysely<DB>, bookingId: string): Promise<InvoiceView | null> {
  const row = await db
    .selectFrom("invoices")
    .select([
      "id",
      "invoice_number",
      "currency",
      "line_items_json",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "fee_cents",
      "total_cents",
      "platform_fee_bps",
      "platform_fee_cents",
      "approved_change_order_count",
      "notes",
      "issued_at",
      "is_demo_fixture",
    ])
    .where("booking_id", "=", bookingId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    currency: row.currency,
    lineItems: parseInvoiceLines(row.line_items_json),
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    platformFeeBps: row.platform_fee_bps,
    platformFeeCents: row.platform_fee_cents,
    approvedChangeOrderCount: row.approved_change_order_count,
    notes: row.notes,
    issuedAt: row.issued_at,
    isDemoFixture: row.is_demo_fixture === 1,
  };
}

async function loadReview(db: Kysely<DB>, bookingId: string): Promise<ReviewView | null> {
  const row = await db
    .selectFrom("reviews")
    .select(["id", "rating", "comment", "created_at", "is_demo_fixture"])
    .where("booking_id", "=", bookingId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    isDemoFixture: row.is_demo_fixture === 1,
    countsTowardRating: row.is_demo_fixture === 0,
  };
}

function contactVisibilityFor(status: BookingStatus): ContactVisibility {
  if ((CONTACT_VISIBLE_STATUSES as readonly BookingStatus[]).includes(status)) return "visible";
  return status === "pending_payment" ? "hidden_until_confirmed" : "hidden";
}

/** Reads mechanic_private only for bookings whose status reveals contact details. */
async function loadMechanicContact(
  db: Kysely<DB>,
  mechanicId: string,
  serviceMode: QuoteServiceMode,
): Promise<MechanicContactView | null> {
  const row = await db
    .selectFrom("mechanic_private")
    .select(["phone", "contact_email", "garage_address_line1", "garage_city", "garage_state", "garage_zip"])
    .where("user_id", "=", mechanicId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    phone: row.phone,
    email: row.contact_email,
    garageAddress:
      serviceMode === "garage"
        ? { line1: row.garage_address_line1, city: row.garage_city, state: row.garage_state, zip: row.garage_zip }
        : null,
  };
}

/** One of the viewer's bookings with everything the booking page shows (not_found otherwise). */
export async function loadBookingDetail(
  ctx: AppContext,
  viewer: Viewer,
  bookingId: string,
): Promise<CustomerBookingDetail> {
  const row = await bookingRows(ctx.db)
    .where("b.id", "=", bookingId)
    .where("b.customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("booking");

  const counts = await loadCounts(ctx.db, [row.id]);
  const summary = toSummary(row, counts.get(row.id));
  const mechanics = await loadMechanicsForCustomer(
    ctx.db,
    [row.mechanic_id],
    { lat: row.approx_lat, lng: row.approx_lng },
    { viewerId: viewer.id },
  );
  const mechanic = (await withViewablePhotos(ctx, viewer, mechanics)).get(row.mechanic_id);
  if (!mechanic) throw new Error(`Mechanic ${row.mechanic_id} of booking ${row.id} was not loaded`);

  const contactVisibility = contactVisibilityFor(summary.status);
  const snapshot = parseQuoteSnapshot(row.quote_snapshot_json);
  const ownAddress = await ctx.db
    .selectFrom("request_private")
    .select(["street_address", "address_city", "address_state", "location_notes"])
    .where("request_id", "=", row.request_id)
    .executeTakeFirst();
  const preferredWindow = oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window");
  const windowInfo = PREFERRED_WINDOW_INFO[preferredWindow];

  return {
    ...summary,
    money: {
      currency: row.currency,
      laborCents: row.labor_cents,
      partsCents: row.parts_cents,
      taxCents: row.tax_cents,
      feeCents: row.fee_cents,
      totalCents: row.total_cents,
      platformFeeBps: row.platform_fee_bps,
      platformFeeCents: row.platform_fee_cents,
    },
    lineItems: groupLineItems(await loadLineItems(ctx.db, row, snapshot)),
    terms: await loadTerms(ctx.db, row, snapshot),
    consent: parseConsentRecord(row.consent_snapshot_json),
    payment: paymentView(row.payment_state),
    request: {
      id: row.request_id,
      areaLabel: row.area_label,
      approxLocation: { lat: row.approx_lat, lng: row.approx_lng },
      description: row.description,
      preferredDate: row.preferred_date,
      preferredWindowLabel:
        preferredWindow === "flexible" ? windowInfo.hours : `${windowInfo.label} (${windowInfo.hours})`,
      drivable: row.drivable === 1,
    },
    serviceLocation: {
      mode: summary.serviceMode,
      label:
        summary.serviceMode === "mobile"
          ? "The mechanic comes to your location"
          : "At the mechanic's garage",
      customerAddress:
        summary.serviceMode === "mobile" && ownAddress
          ? {
              streetAddress: ownAddress.street_address,
              city: ownAddress.address_city,
              state: ownAddress.address_state,
              locationNotes: ownAddress.location_notes,
            }
          : null,
    },
    mechanic,
    contactVisibility,
    mechanicContact:
      contactVisibility === "visible"
        ? await loadMechanicContact(ctx.db, row.mechanic_id, summary.serviceMode)
        : null,
    progress: {
      reservedAt: row.created_at,
      confirmedAt: row.confirmed_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
    },
    changeOrders: await loadChangeOrders(ctx.db, row.id, summary.status),
    invoice: await loadInvoice(ctx.db, row.id),
    review: await loadReview(ctx.db, row.id),
  };
}
