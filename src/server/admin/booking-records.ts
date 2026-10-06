import "server-only";

import { sql, type Kysely } from "kysely";

import { CHANGE_ORDER_STATUSES, type ChangeOrderStatus } from "@/lib/domain";
import type { DB } from "@/server/db/schema.generated";
import { parseInvoiceLines, type InvoiceLineDto } from "@/server/mechanic/bookings";

import { BOOKING_PAYMENT_STATES, type BookingPaymentState } from "./booking-items";
import { oneOf, parseConsentRecord, type AdminConsentRecord, type PersonRef } from "./types";

// What happened after a booking was made, for admins working a dispute or a cancellation:
// the booking consent, change orders with the customer's decisions, the invoice and the
// review. Demo fixtures only reach these states while payments are not connected.

export type AdminChangeOrder = {
  id: string;
  description: string;
  reason: string;
  status: ChangeOrderStatus;
  currency: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  amountCents: number;
  /** Approved change orders are never charged here: "stripe_not_connected" or a demo fixture. */
  paymentState: BookingPaymentState;
  proposedBy: PersonRef;
  proposedAt: string;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  decisionNote: string | null;
  isDemoFixture: boolean;
};

/** One invoice line: from the quote or from an approved change order. */
export type AdminInvoiceLine = InvoiceLineDto;

export type AdminInvoice = {
  id: string;
  invoiceNumber: string;
  currency: string;
  lineItems: AdminInvoiceLine[];
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
  issuedBy: PersonRef;
  issuedAt: string;
  isDemoFixture: boolean;
};

export type AdminBookingReview = {
  id: string;
  rating: number;
  comment: string | null;
  /** Demo-fixture reviews never count toward a mechanic's rating. */
  isDemoFixture: boolean;
  createdAt: string;
};

export type AdminBookingRecords = {
  /** What the customer accepted when reserving (exact text, version and time). */
  bookingConsent: AdminConsentRecord | null;
  /** Oldest first. */
  changeOrders: AdminChangeOrder[];
  invoice: AdminInvoice | null;
  review: AdminBookingReview | null;
};

const person = (id: string, displayName: string | null): PersonRef => ({ id, displayName: displayName ?? "Unknown user" });

async function loadChangeOrders(db: Kysely<DB>, bookingId: string): Promise<AdminChangeOrder[]> {
  const rows = await db
    .selectFrom("change_orders as co")
    .leftJoin("users as proposer", "proposer.id", "co.proposed_by")
    .leftJoin("users as decider", "decider.id", "co.decided_by")
    .select([
      "co.id",
      "co.description",
      "co.reason",
      "co.status",
      "co.currency",
      "co.labor_cents",
      "co.parts_cents",
      "co.tax_cents",
      "co.amount_cents",
      "co.payment_state",
      "co.proposed_by",
      "proposer.display_name as proposer_name",
      "co.created_at",
      "co.decided_by",
      "decider.display_name as decider_name",
      "co.decided_at",
      "co.decision_note",
      "co.is_demo_fixture",
    ])
    .where("co.booking_id", "=", bookingId)
    .orderBy("co.created_at")
    .orderBy(sql`co.rowid`)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    reason: row.reason,
    status: oneOf(CHANGE_ORDER_STATUSES, row.status, "change_orders.status"),
    currency: row.currency,
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    amountCents: row.amount_cents,
    paymentState: oneOf(BOOKING_PAYMENT_STATES, row.payment_state, "change_orders.payment_state"),
    proposedBy: person(row.proposed_by, row.proposer_name),
    proposedAt: row.created_at,
    decidedBy: row.decided_by === null ? null : person(row.decided_by, row.decider_name),
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    isDemoFixture: row.is_demo_fixture === 1,
  }));
}

async function loadInvoice(db: Kysely<DB>, bookingId: string): Promise<AdminInvoice | null> {
  const row = await db
    .selectFrom("invoices as i")
    .leftJoin("users as issuer", "issuer.id", "i.issued_by")
    .select([
      "i.id",
      "i.invoice_number",
      "i.currency",
      "i.line_items_json",
      "i.labor_cents",
      "i.parts_cents",
      "i.tax_cents",
      "i.fee_cents",
      "i.total_cents",
      "i.platform_fee_bps",
      "i.platform_fee_cents",
      "i.mechanic_payout_cents",
      "i.approved_change_order_count",
      "i.notes",
      "i.issued_by",
      "issuer.display_name as issuer_name",
      "i.issued_at",
      "i.is_demo_fixture",
    ])
    .where("i.booking_id", "=", bookingId)
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
    mechanicPayoutCents: row.mechanic_payout_cents,
    approvedChangeOrderCount: row.approved_change_order_count,
    notes: row.notes,
    issuedBy: person(row.issued_by, row.issuer_name),
    issuedAt: row.issued_at,
    isDemoFixture: row.is_demo_fixture === 1,
  };
}

/** The post-booking records of one booking (empty for a reservation still pending payment). */
export async function loadBookingRecords(db: Kysely<DB>, bookingId: string): Promise<AdminBookingRecords> {
  const [consentRow, changeOrders, invoice, review] = await Promise.all([
    db.selectFrom("bookings").select("consent_snapshot_json").where("id", "=", bookingId).executeTakeFirst(),
    loadChangeOrders(db, bookingId),
    loadInvoice(db, bookingId),
    db
      .selectFrom("reviews")
      .select(["id", "rating", "comment", "is_demo_fixture", "created_at"])
      .where("booking_id", "=", bookingId)
      .executeTakeFirst(),
  ]);
  return {
    bookingConsent: parseConsentRecord(consentRow?.consent_snapshot_json),
    changeOrders,
    invoice,
    review: review
      ? {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          isDemoFixture: review.is_demo_fixture === 1,
          createdAt: review.created_at,
        }
      : null,
  };
}
