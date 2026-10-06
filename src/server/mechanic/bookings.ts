import "server-only";

import type { Kysely } from "kysely";
import { z } from "zod";

import {
  BOOKING_STATUS_INFO,
  BOOKING_STATUSES,
  CHANGE_ORDER_STATUS_INFO,
  CHANGE_ORDER_STATUSES,
  PAYOUT_STATUSES,
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
import { DomainError } from "@/server/errors";
import { QUOTE_ITEM_KINDS, type QuoteTotals } from "@/server/pricing";

import { assertMechanic, loadMechanicState, oneOf } from "./access";
import { preferredTimeLabel, vehicleLabel } from "./labels";
import { approxPoint, mapBase, type ApproxPoint, type MechanicMapBase } from "./map";
import { payoutOnboardingStatus, payoutView, paymentNotice, type PayoutOnboardingStatus, type PayoutView } from "./payouts";
import { readJobTerms, type JobLineItem, type JobTerms } from "./quote-snapshot";

// The mechanic's own bookings: pending-payment reservations (Stripe not connected, so they
// never confirm) and seeded fixtures (is_demo_fixture = 1), the only bookings that reach confirmed,
// in progress and completed in this build. Customer contact details, the exact address and
// the request's media are included only for the booking states in the privacy matrix.

/** Booking states in which the booked mechanic sees the customer's contact details and address. */
export const CONTACT_VISIBLE_STATUSES = ["confirmed", "in_progress", "completed", "disputed"] as const satisfies readonly BookingStatus[];

/**
 * Booking states in which the booked mechanic may open the request's photos and video. Equal
 * to BOOKED_MEDIA_STATUSES in src/server/storage/file-access.ts, so every listed id is viewable.
 */
export const MEDIA_VISIBLE_STATUSES = ["confirmed", "in_progress", "completed", "disputed"] as const satisfies readonly BookingStatus[];

const ACTIVE_ORDER: Readonly<Record<BookingStatus, number>> = {
  in_progress: 0,
  confirmed: 1,
  pending_payment: 2,
  disputed: 3,
  completed: 4,
  cancelled: 5,
};

export type MyBookingSummary = {
  id: string;
  requestId: string;
  status: BookingStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  /** Seeded fixture (is_demo_fixture = 1): confirmed without any payment. Internal flag, not a UI label. */
  isDemoFixture: boolean;
  /** The booked request is a seeded fixture. Internal flag, not a UI label. */
  requestIsDemoFixture: boolean;
  categoryName: string;
  vehicleLabel: string;
  /** Coarse area, e.g. "Phoenix, AZ 85004". */
  areaLabel: string;
  /** The request ZIP's centroid for maps (approximate, never the address). */
  approxPoint: ApproxPoint;
  /** The request's IANA zone; format slot times in it. */
  timeZone: string;
  serviceMode: QuoteServiceMode;
  serviceModeLabel: string;
  slotStartAt: string;
  slotEndAt: string;
  currency: "USD";
  totalCents: number;
  platformFeeCents: number;
  mechanicPayoutCents: number;
  payout: PayoutView;
  /** e.g. "Awaiting the customer's payment - online payments are coming soon. ..." */
  paymentNotice: string;
  pendingChangeOrderCount: number;
  hasInvoice: boolean;
  /**
   * The issued invoice's money (accepted quote plus approved change orders), when there is one.
   * Once a job is invoiced these are the amounts to show, so no page shows a stale quote payout.
   */
  invoiceTotals: { totalCents: number; mechanicPayoutCents: number } | null;
  createdAt: string;
};

export type BookingCustomerContact = {
  /** The customer's account name. */
  displayName: string;
  phone: string;
  email: string;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string;
    notes: string | null;
    /** One line, e.g. "123 Main St, Phoenix, AZ 85004" (or the area when no street was given). */
    label: string;
  };
};

export type ChangeOrderDto = {
  id: string;
  status: ChangeOrderStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  description: string;
  reason: string;
  currency: "USD";
  laborCents: number;
  partsCents: number;
  taxCents: number;
  amountCents: number;
  /** "Nothing is charged online" wording for approved change orders. */
  paymentNote: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  isDemoFixture: boolean;
  /** The mechanic may withdraw it while the customer has not decided. */
  canWithdraw: boolean;
};

export type InvoiceLineDto = {
  source: "quote" | "change_order";
  changeOrderId: string | null;
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type InvoiceDto = {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  currency: "USD";
  lineItems: InvoiceLineDto[];
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  platformFeeBps: number;
  platformFeeCents: number;
  mechanicPayoutCents: number;
  approvedChangeOrderCount: number;
  notes: string | null;
  isDemoFixture: boolean;
};

export type BookingMoney = QuoteTotals & {
  currency: "USD";
  platformFeeBps: number;
  platformFeeCents: number;
  mechanicPayoutCents: number;
};

export type MyBookingDetail = MyBookingSummary & {
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  request: {
    id: string;
    categoryId: string;
    categoryName: string;
    vehicle: { year: number; make: string; model: string; label: string };
    mileage: number;
    description: string;
    areaLabel: string;
    drivable: boolean;
    preferredDate: string;
    preferredTimeLabel: string;
    isDemoFixture: boolean;
  };
  /** Scope, exclusions, notes and line items from the immutable quote snapshot. */
  job: JobTerms;
  money: BookingMoney;
  /** "At the customer's location" or "At your garage". */
  serviceLocation: string;
  /** The mechanic's own base ZIP centroid and travel radius for the map (null without a profile). */
  base: MechanicMapBase | null;
  /** Null unless the booking is confirmed, in progress, completed or disputed. */
  customer: BookingCustomerContact | null;
  /** Why contact details are hidden, when they are. */
  contactNotice: string | null;
  /** Request media ids for /api/files/<id>; empty unless confirmed, in progress, completed or disputed. */
  media: { photoFileIds: string[]; videoFileId: string | null };
  changeOrders: ChangeOrderDto[];
  invoice: InvoiceDto | null;
  payoutOnboarding: PayoutOnboardingStatus;
  actions: {
    canStart: boolean;
    canComplete: boolean;
    canProposeChangeOrder: boolean;
    canIssueInvoice: boolean;
    /** Why starting or adding work is blocked (the account isn't approved), when it is. */
    workBlockedReason: string | null;
    /** Why the invoice can't be issued yet, when the job is complete. */
    invoiceBlockedReason: string | null;
  };
};

export const NEW_WORK_BLOCKED_MESSAGE =
  "Your mechanic account isn't approved right now (for example, it's suspended), so you can't start work or add work to a booking. You can still finish a job in progress and invoice it. Contact support if you think this is a mistake.";

/**
 * Why a completed job can't be invoiced yet. Customers decide change orders only while the job
 * is confirmed or in progress, so after completion the mechanic withdraws a leftover proposal.
 */
export const PENDING_CHANGE_ORDER_BLOCK =
  "A change order is still marked as waiting for the customer, who can no longer decide on it now that the job is complete. Withdraw it before issuing the invoice (its work isn't billed).";

// ---------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------

function bookingQuery(db: Kysely<DB>) {
  return db
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "b.id",
      "b.request_id",
      "b.quote_id",
      "b.customer_id",
      "b.status",
      "b.payment_state",
      "b.payout_status",
      "b.service_mode",
      "b.slot_start_at",
      "b.slot_end_at",
      "b.labor_cents",
      "b.parts_cents",
      "b.tax_cents",
      "b.fee_cents",
      "b.total_cents",
      "b.platform_fee_bps",
      "b.platform_fee_cents",
      "b.mechanic_payout_cents",
      "b.quote_snapshot_json",
      "b.is_demo_fixture",
      "b.created_at",
      "b.confirmed_at",
      "b.started_at",
      "b.completed_at",
      "b.cancelled_at",
      "b.cancel_reason",
      "r.category_id",
      "c.name as category_name",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.mileage",
      "r.description",
      "r.area_label",
      "r.zip",
      "r.approx_lat",
      "r.approx_lng",
      "r.time_zone",
      "r.drivable",
      "r.preferred_date",
      "r.preferred_window",
      "r.is_demo_fixture as request_is_demo_fixture",
    ]);
}

type BookingRow = Awaited<ReturnType<ReturnType<typeof bookingQuery>["executeTakeFirstOrThrow"]>>;

export function bookingTotals(row: Pick<BookingRow, "labor_cents" | "parts_cents" | "tax_cents" | "fee_cents" | "total_cents">): QuoteTotals {
  return {
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
  };
}

/** The booking's accepted terms: its snapshot, checked against the immutable quote rows. */
export async function loadBookingTerms(
  db: Kysely<DB>,
  booking: Pick<BookingRow, "quote_id" | "quote_snapshot_json" | "labor_cents" | "parts_cents" | "tax_cents" | "fee_cents" | "total_cents">,
): Promise<JobTerms> {
  const quote = await db
    .selectFrom("quotes")
    .select(["scope", "exclusions", "notes", "parts_included", "estimated_duration_minutes"])
    .where("id", "=", booking.quote_id)
    .executeTakeFirstOrThrow();
  const items = await db
    .selectFrom("quote_items")
    .select(["kind", "description", "quantity", "unit_price_cents", "amount_cents"])
    .where("quote_id", "=", booking.quote_id)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
  const fallback: JobTerms = {
    scope: quote.scope,
    exclusions: quote.exclusions,
    notes: quote.notes,
    partsIncluded: quote.parts_included === 1,
    estimatedDurationMinutes: quote.estimated_duration_minutes,
    items: items.map(
      (item): JobLineItem => ({
        kind: oneOf(QUOTE_ITEM_KINDS, item.kind, "quote_items.kind"),
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        amountCents: item.amount_cents,
      }),
    ),
  };
  return readJobTerms(booking.quote_snapshot_json, fallback, bookingTotals(booking));
}

type BookingExtras = {
  pendingChangeOrderCount: number;
  invoiceTotals: MyBookingSummary["invoiceTotals"];
};

const NO_EXTRAS: BookingExtras = { pendingChangeOrderCount: 0, invoiceTotals: null };

function toSummary(row: BookingRow, extras: BookingExtras): MyBookingSummary {
  const status = oneOf(BOOKING_STATUSES, row.status, "bookings.status");
  const serviceMode = oneOf(QUOTE_SERVICE_MODES, row.service_mode, "bookings.service_mode");
  const isDemoFixture = row.is_demo_fixture === 1;
  return {
    id: row.id,
    requestId: row.request_id,
    status,
    statusLabel: BOOKING_STATUS_INFO[status].label,
    statusTone: BOOKING_STATUS_INFO[status].tone,
    isDemoFixture,
    requestIsDemoFixture: row.request_is_demo_fixture === 1,
    categoryName: row.category_name,
    vehicleLabel: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    areaLabel: row.area_label,
    approxPoint: approxPoint(row.approx_lat, row.approx_lng),
    timeZone: row.time_zone,
    serviceMode,
    serviceModeLabel: QUOTE_SERVICE_MODE_INFO[serviceMode].label,
    slotStartAt: row.slot_start_at,
    slotEndAt: row.slot_end_at,
    currency: "USD",
    totalCents: row.total_cents,
    platformFeeCents: row.platform_fee_cents,
    mechanicPayoutCents: row.mechanic_payout_cents,
    payout: payoutView(oneOf(PAYOUT_STATUSES, row.payout_status, "bookings.payout_status"), isDemoFixture),
    paymentNotice: paymentNotice(status),
    pendingChangeOrderCount: extras.pendingChangeOrderCount,
    hasInvoice: extras.invoiceTotals !== null,
    invoiceTotals: extras.invoiceTotals,
    createdAt: row.created_at,
  };
}

async function bookingExtras(db: Kysely<DB>, bookingIds: readonly string[]): Promise<Map<string, BookingExtras>> {
  const extras = new Map(bookingIds.map((id): [string, BookingExtras] => [id, { ...NO_EXTRAS }]));
  if (bookingIds.length === 0) return extras;
  const pending = await db
    .selectFrom("change_orders")
    .select(["booking_id", (eb) => eb.fn.countAll<number>().as("count")])
    .where("booking_id", "in", bookingIds)
    .where("status", "=", "proposed")
    .groupBy("booking_id")
    .execute();
  for (const row of pending) {
    const entry = extras.get(row.booking_id);
    if (entry) entry.pendingChangeOrderCount = Number(row.count);
  }
  const invoices = await db
    .selectFrom("invoices")
    .select(["booking_id", "total_cents", "mechanic_payout_cents"])
    .where("booking_id", "in", bookingIds)
    .execute();
  for (const row of invoices) {
    const entry = extras.get(row.booking_id);
    if (entry) entry.invoiceTotals = { totalCents: row.total_cents, mechanicPayoutCents: row.mechanic_payout_cents };
  }
  return extras;
}

/** Every booking of `mechanicId`: active ones first (soonest first), then finished ones (latest first). */
export async function listBookingSummaries(db: Kysely<DB>, mechanicId: string): Promise<MyBookingSummary[]> {
  const rows = await bookingQuery(db).where("b.mechanic_id", "=", mechanicId).execute();
  const extras = await bookingExtras(
    db,
    rows.map((row) => row.id),
  );
  const summaries = rows.map((row) => toSummary(row, extras.get(row.id) ?? NO_EXTRAS));
  return summaries.sort((a, b) => {
    const rank = ACTIVE_ORDER[a.status] - ACTIVE_ORDER[b.status];
    if (rank !== 0) return rank;
    const active = ACTIVE_ORDER[a.status] <= ACTIVE_ORDER.pending_payment;
    const bySlot = a.slotStartAt < b.slotStartAt ? -1 : a.slotStartAt > b.slotStartAt ? 1 : 0;
    return active ? bySlot : -bySlot;
  });
}

/** The signed-in mechanic's bookings (pending reservations and seeded fixtures). */
export async function listMyBookings(ctx: AppContext, viewer: Viewer): Promise<MyBookingSummary[]> {
  assertMechanic(viewer);
  return listBookingSummaries(ctx.db, viewer.id);
}

// ---------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------

const invoiceLineSchema = z.object({
  source: z.enum(["quote", "change_order"]).catch("quote"),
  changeOrderId: z.string().nullish(),
  kind: z.string().catch("other"),
  description: z.string().min(1),
  quantity: z.int().min(1).catch(1),
  unitPriceCents: z.int(),
  amountCents: z.int(),
});

/**
 * Parses invoices.line_items_json (the format issueInvoice writes). Lines from other writers
 * may use snake_case keys; a line that can't be read is skipped rather than hiding the rest.
 */
export function parseInvoiceLines(json: string): InvoiceLineDto[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const lines: InvoiceLineDto[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const amount = record.amountCents ?? record.amount_cents;
    const parsed = invoiceLineSchema.safeParse({
      source: record.source,
      changeOrderId: record.changeOrderId ?? record.change_order_id,
      kind: record.kind,
      description: record.description,
      quantity: record.quantity,
      unitPriceCents: record.unitPriceCents ?? record.unit_price_cents ?? amount,
      amountCents: amount,
    });
    if (parsed.success) lines.push({ ...parsed.data, changeOrderId: parsed.data.changeOrderId ?? null });
  }
  return lines;
}

export const CHANGE_ORDER_APPROVED_NOTE = "Approved. Nothing is charged online: online payments are coming soon.";

function changeOrderPaymentNote(status: ChangeOrderStatus): string {
  return status === "approved" ? CHANGE_ORDER_APPROVED_NOTE : "";
}

async function loadChangeOrders(db: Kysely<DB>, bookingId: string, viewerId: string): Promise<ChangeOrderDto[]> {
  const rows = await db
    .selectFrom("change_orders")
    .select([
      "id",
      "status",
      "description",
      "reason",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "amount_cents",
      "proposed_by",
      "decided_at",
      "decision_note",
      "is_demo_fixture",
      "created_at",
    ])
    .where("booking_id", "=", bookingId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => {
    const status = oneOf(CHANGE_ORDER_STATUSES, row.status, "change_orders.status");
    const isDemoFixture = row.is_demo_fixture === 1;
    return {
      id: row.id,
      status,
      statusLabel: CHANGE_ORDER_STATUS_INFO[status].label,
      statusTone: CHANGE_ORDER_STATUS_INFO[status].tone,
      description: row.description,
      reason: row.reason,
      currency: "USD",
      laborCents: row.labor_cents,
      partsCents: row.parts_cents,
      taxCents: row.tax_cents,
      amountCents: row.amount_cents,
      paymentNote: changeOrderPaymentNote(status),
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
      isDemoFixture,
      canWithdraw: status === "proposed" && row.proposed_by === viewerId,
    };
  });
}

async function loadInvoice(db: Kysely<DB>, bookingId: string): Promise<InvoiceDto | null> {
  const row = await db
    .selectFrom("invoices")
    .select([
      "id",
      "invoice_number",
      "issued_at",
      "line_items_json",
      "labor_cents",
      "parts_cents",
      "tax_cents",
      "fee_cents",
      "total_cents",
      "platform_fee_bps",
      "platform_fee_cents",
      "mechanic_payout_cents",
      "approved_change_order_count",
      "notes",
      "is_demo_fixture",
    ])
    .where("booking_id", "=", bookingId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    issuedAt: row.issued_at,
    currency: "USD",
    lineItems: parseInvoiceLines(row.line_items_json),
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    platformFeeBps: row.platform_fee_bps,
    platformFeeCents: row.platform_fee_cents,
    mechanicPayoutCents: row.mechanic_payout_cents,
    approvedChangeOrderCount: row.approved_change_order_count,
    notes: row.notes,
    isDemoFixture: row.is_demo_fixture === 1,
  };
}

async function loadCustomerContact(db: Kysely<DB>, row: BookingRow): Promise<BookingCustomerContact | null> {
  const privateRow = await db
    .selectFrom("request_private")
    .select(["contact_email", "contact_phone", "street_address", "address_city", "address_state", "location_notes"])
    .where("request_id", "=", row.request_id)
    .executeTakeFirst();
  const customer = await db
    .selectFrom("users")
    .select("display_name")
    .where("id", "=", row.customer_id)
    .executeTakeFirst();
  if (!privateRow || !customer) return null;
  const cityState = [privateRow.address_city, privateRow.address_state].filter(Boolean).join(", ");
  const label = privateRow.street_address
    ? `${privateRow.street_address}, ${cityState ? `${cityState} ` : ""}${row.zip}`
    : `${row.area_label} (no street address given)`;
  return {
    displayName: customer.display_name,
    phone: privateRow.contact_phone,
    email: privateRow.contact_email,
    address: {
      street: privateRow.street_address,
      city: privateRow.address_city,
      state: privateRow.address_state,
      zip: row.zip,
      notes: privateRow.location_notes,
      label,
    },
  };
}

async function loadMedia(db: Kysely<DB>, requestId: string): Promise<{ photoFileIds: string[]; videoFileId: string | null }> {
  const rows = await db
    .selectFrom("request_media")
    .select(["file_id", "kind"])
    .where("request_id", "=", requestId)
    .orderBy("created_at")
    .orderBy("file_id")
    .execute();
  return {
    photoFileIds: rows.filter((media) => media.kind === "photo").map((media) => media.file_id),
    videoFileId: rows.find((media) => media.kind === "video")?.file_id ?? null,
  };
}

function contactNoticeFor(status: BookingStatus): string | null {
  if ((CONTACT_VISIBLE_STATUSES as readonly BookingStatus[]).includes(status)) return null;
  if (status === "pending_payment") {
    return "Awaiting the customer's payment - online payments are coming soon. The customer's phone, email and exact address are shared only after a confirmed booking.";
  }
  return "This booking was cancelled, so the customer's contact details are no longer shown.";
}

/**
 * One of the signed-in mechanic's bookings. Another mechanic's booking (or a missing id)
 * throws DomainError("not_found").
 */
export async function getMyBooking(ctx: AppContext, viewer: Viewer, bookingId: string): Promise<MyBookingDetail> {
  assertMechanic(viewer);
  const row = await bookingQuery(ctx.db)
    .where("b.id", "=", bookingId)
    .where("b.mechanic_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw new DomainError("not_found", "That booking wasn't found.");

  const extras = (await bookingExtras(ctx.db, [row.id])).get(row.id) ?? NO_EXTRAS;
  const summary = toSummary(row, extras);
  const status = summary.status;
  const contactVisible = (CONTACT_VISIBLE_STATUSES as readonly BookingStatus[]).includes(status);
  const mediaVisible = (MEDIA_VISIBLE_STATUSES as readonly BookingStatus[]).includes(status);
  const mechanicState = await loadMechanicState(ctx.db, viewer.id);
  const mechanicApproved = mechanicState?.status === "approved";
  const [job, changeOrders, invoice, customer, media] = await Promise.all([
    loadBookingTerms(ctx.db, row),
    loadChangeOrders(ctx.db, row.id, viewer.id),
    loadInvoice(ctx.db, row.id),
    contactVisible ? loadCustomerContact(ctx.db, row) : Promise.resolve(null),
    mediaVisible ? loadMedia(ctx.db, row.request_id) : Promise.resolve({ photoFileIds: [], videoFileId: null }),
  ]);
  const pendingChangeOrders = changeOrders.filter((order) => order.status === "proposed").length;
  const preferredWindow = oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window");

  return {
    ...summary,
    confirmedAt: row.confirmed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    request: {
      id: row.request_id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      vehicle: {
        year: row.vehicle_year,
        make: row.vehicle_make,
        model: row.vehicle_model,
        label: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
      },
      mileage: row.mileage,
      description: row.description,
      areaLabel: row.area_label,
      drivable: row.drivable === 1,
      preferredDate: row.preferred_date,
      preferredTimeLabel: preferredTimeLabel(row.preferred_date, preferredWindow),
      isDemoFixture: row.request_is_demo_fixture === 1,
    },
    job,
    money: {
      ...bookingTotals(row),
      currency: "USD",
      platformFeeBps: row.platform_fee_bps,
      platformFeeCents: row.platform_fee_cents,
      mechanicPayoutCents: row.mechanic_payout_cents,
    },
    serviceLocation: summary.serviceMode === "mobile" ? "At the customer's location" : "At your garage",
    base: mechanicState ? mapBase(mechanicState) : null,
    customer,
    contactNotice: contactNoticeFor(status),
    media,
    changeOrders,
    invoice,
    payoutOnboarding: payoutOnboardingStatus(),
    actions: {
      canStart: status === "confirmed" && mechanicApproved,
      canComplete: status === "in_progress",
      canProposeChangeOrder: (status === "confirmed" || status === "in_progress") && mechanicApproved,
      canIssueInvoice: status === "completed" && invoice === null && pendingChangeOrders === 0,
      workBlockedReason:
        (status === "confirmed" || status === "in_progress") && !mechanicApproved ? NEW_WORK_BLOCKED_MESSAGE : null,
      invoiceBlockedReason:
        status === "completed" && invoice === null && pendingChangeOrders > 0 ? PENDING_CHANGE_ORDER_BLOCK : null,
    },
  };
}
