import "server-only";

import { randomInt } from "node:crypto";

import { BOOKING_STATUS_INFO, BOOKING_STATUSES, CHANGE_ORDER_STATUSES, type BookingStatus } from "@/lib/domain";
import {
  changeOrderCommandSchema,
  invoiceCommandSchema,
  type ChangeOrderCommand,
  type InvoiceCommand,
} from "@/lib/validation/quote";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { computeInvoiceTotals, type InvoiceTotals } from "@/server/pricing";

import { assertMechanic, loadMechanicState, oneOf } from "./access";
import {
  bookingTotals,
  loadBookingTerms,
  NEW_WORK_BLOCKED_MESSAGE,
  PENDING_CHANGE_ORDER_BLOCK,
  type InvoiceLineDto,
} from "./bookings";
import { vehicleLabel } from "./labels";
import {
  bookingCompletedMessage,
  bookingStartedMessage,
  changeOrderProposedMessage,
  changeOrderWithdrawnMessage,
  invoiceIssuedMessage,
  type BookingMessageInput,
} from "./messages";
import { parseCommand } from "./shared";

// What the booked mechanic does on a booking. Only seeded fixtures can be confirmed in
// this build (Stripe is not connected), so these commands act on fixtures in practice; a
// pending-payment reservation can't be started (and triggers enforce every transition).

const PAYMENT_PENDING_MESSAGE =
  "This reservation is still waiting for the customer's payment, and online payments are coming soon, so the job can't be worked on yet.";

const notFound = () => new DomainError("not_found", "That booking wasn't found.");

async function loadOwnBooking(trx: Tx, viewer: Viewer, bookingId: string) {
  const row = await trx
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("mechanic_profiles as p", "p.user_id", "b.mechanic_id")
    .select([
      "b.id",
      "b.status",
      "b.customer_id",
      "b.request_id",
      "b.quote_id",
      "b.payment_state",
      "b.payout_status",
      "b.is_demo_fixture",
      "b.labor_cents",
      "b.parts_cents",
      "b.tax_cents",
      "b.fee_cents",
      "b.total_cents",
      "b.platform_fee_bps",
      "b.quote_snapshot_json",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
      "p.display_name",
    ])
    .where("b.id", "=", bookingId)
    .where("b.mechanic_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound();
  return { ...row, bookingStatus: oneOf(BOOKING_STATUSES, row.status, "bookings.status") };
}

type OwnBooking = Awaited<ReturnType<typeof loadOwnBooking>>;

function messageInput(booking: OwnBooking): BookingMessageInput {
  return {
    bookingId: booking.id,
    mechanicName: booking.display_name,
    vehicle: vehicleLabel(booking.vehicle_year, booking.vehicle_make, booking.vehicle_model),
    categoryName: booking.category_name,
    isDemoFixture: booking.is_demo_fixture === 1,
  };
}

/** Rejects a status other than `allowed`, with the payment wording for pending reservations. */
function assertStatus(booking: OwnBooking, allowed: readonly BookingStatus[], action: string): void {
  if (allowed.includes(booking.bookingStatus)) return;
  if (booking.bookingStatus === "pending_payment") {
    throw new DomainError("payment_not_connected", PAYMENT_PENDING_MESSAGE);
  }
  const label = BOOKING_STATUS_INFO[booking.bookingStatus].label.toLowerCase();
  throw new DomainError("conflict", `This booking is ${label}, so you can't ${action}. Refresh to see the latest.`);
}

/**
 * Starting work or adding work needs an approved account: a suspended mechanic may still
 * finish an in-progress job and invoice it, but takes on nothing new.
 */
async function assertMayTakeOnWork(trx: Tx, viewer: Viewer): Promise<void> {
  const state = await loadMechanicState(trx, viewer.id);
  if (state?.status !== "approved") {
    throw new DomainError("mechanic_not_eligible", NEW_WORK_BLOCKED_MESSAGE, { reason: state?.status ?? "no_profile" });
  }
}

export type BookingTransitionResult = { bookingId: string; status: BookingStatus };

/** confirmed -> in_progress (started_at); needs an approved account. Notifies the customer; audited. */
export async function startJob(ctx: AppContext, viewer: Viewer, bookingId: string): Promise<BookingTransitionResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const booking = await loadOwnBooking(trx, viewer, bookingId);
    assertStatus(booking, ["confirmed"], "start the job");
    await assertMayTakeOnWork(trx, viewer);
    await trx
      .updateTable("bookings")
      .set({ status: "in_progress", started_at: nowIso, updated_at: nowIso })
      .where("id", "=", booking.id)
      .where("status", "=", "confirmed")
      .execute();
    await notify(trx, { userId: booking.customer_id, ...bookingStartedMessage(messageInput(booking)), at: ctx.now });
    await recordAudit(trx, {
      actor: viewer,
      action: "booking.start",
      entityType: "booking",
      entityId: booking.id,
      metadata: { from: "confirmed", to: "in_progress", isDemoFixture: booking.is_demo_fixture === 1 },
      at: ctx.now,
    });
    return { bookingId: booking.id, status: "in_progress" };
  });
}

/**
 * in_progress -> completed (completed_at). A seeded fixture's payout moves from "not eligible"
 * to "pending", as the payout would after completion; nothing is paid (the UI says payouts
 * start when online payments launch). Notifies the customer; audited.
 */
export async function completeJob(ctx: AppContext, viewer: Viewer, bookingId: string): Promise<BookingTransitionResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const booking = await loadOwnBooking(trx, viewer, bookingId);
    assertStatus(booking, ["in_progress"], "mark the job complete");
    const demoPayoutPending = booking.is_demo_fixture === 1 && booking.payout_status === "not_eligible";
    await trx
      .updateTable("bookings")
      .set({
        status: "completed",
        completed_at: nowIso,
        updated_at: nowIso,
        ...(demoPayoutPending ? { payout_status: "pending" } : {}),
      })
      .where("id", "=", booking.id)
      .where("status", "=", "in_progress")
      .execute();
    await notify(trx, { userId: booking.customer_id, ...bookingCompletedMessage(messageInput(booking)), at: ctx.now });
    await recordAudit(trx, {
      actor: viewer,
      action: "booking.complete",
      entityType: "booking",
      entityId: booking.id,
      metadata: {
        from: "in_progress",
        to: "completed",
        isDemoFixture: booking.is_demo_fixture === 1,
        demoPayoutStatus: demoPayoutPending ? "pending" : booking.payout_status,
      },
      at: ctx.now,
    });
    return { bookingId: booking.id, status: "completed" };
  });
}

export type ProposeChangeOrderInput = ChangeOrderCommand & { bookingId: string };

export type ProposeChangeOrderResult = { changeOrderId: string; bookingId: string; amountCents: number };

/**
 * Proposes extra work on a confirmed or in-progress booking (strict integer cents; the amount
 * is labor + parts + tax). The demo-fixture flag and payment state are copied from the
 * booking. The customer must approve it (customer module) before the work is done.
 */
export async function proposeChangeOrder(
  ctx: AppContext,
  viewer: Viewer,
  input: ProposeChangeOrderInput,
): Promise<ProposeChangeOrderResult> {
  assertMechanic(viewer);
  const { bookingId, ...terms } = input;
  const order = parseCommand(changeOrderCommandSchema, terms, "Some change-order details are missing or invalid.");
  const amountCents = order.laborCents + order.partsCents + order.taxCents;
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const booking = await loadOwnBooking(trx, viewer, bookingId);
    assertStatus(booking, ["confirmed", "in_progress"], "propose a change order");
    await assertMayTakeOnWork(trx, viewer);
    const changeOrderId = newId();
    await trx
      .insertInto("change_orders")
      .values({
        id: changeOrderId,
        booking_id: booking.id,
        proposed_by: viewer.id,
        description: order.description,
        reason: order.reason,
        currency: "USD",
        labor_cents: order.laborCents,
        parts_cents: order.partsCents,
        tax_cents: order.taxCents,
        amount_cents: amountCents,
        status: "proposed",
        payment_state: booking.payment_state,
        is_demo_fixture: booking.is_demo_fixture,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .execute();
    await notify(trx, {
      userId: booking.customer_id,
      ...changeOrderProposedMessage({ ...messageInput(booking), description: order.description, amountCents }),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "change_order.propose",
      entityType: "change_order",
      entityId: changeOrderId,
      metadata: {
        bookingId: booking.id,
        laborCents: order.laborCents,
        partsCents: order.partsCents,
        taxCents: order.taxCents,
        amountCents,
      },
      at: ctx.now,
    });
    return { changeOrderId, bookingId: booking.id, amountCents };
  });
}

/** Withdraws the mechanic's own change order while the customer has not decided (proposed -> void). */
export async function withdrawChangeOrder(
  ctx: AppContext,
  viewer: Viewer,
  changeOrderId: string,
): Promise<{ changeOrderId: string; bookingId: string; status: "void" }> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const order = await trx
      .selectFrom("change_orders as co")
      .innerJoin("bookings as b", "b.id", "co.booking_id")
      .select(["co.id", "co.booking_id", "co.status", "co.proposed_by", "co.description", "co.amount_cents"])
      .where("co.id", "=", changeOrderId)
      .where("b.mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!order) throw new DomainError("not_found", "That change order wasn't found.");
    const status = oneOf(CHANGE_ORDER_STATUSES, order.status, "change_orders.status");
    if (status !== "proposed" || order.proposed_by !== viewer.id) {
      throw new DomainError("conflict", "The customer has already decided on this change order, so it can't be withdrawn.");
    }
    await trx
      .updateTable("change_orders")
      .set({
        status: "void",
        decided_by: viewer.id,
        decided_at: nowIso,
        decision_note: "Withdrawn by the mechanic before the customer decided.",
        updated_at: nowIso,
      })
      .where("id", "=", order.id)
      .where("status", "=", "proposed")
      .execute();
    const booking = await loadOwnBooking(trx, viewer, order.booking_id);
    await notify(trx, {
      userId: booking.customer_id,
      ...changeOrderWithdrawnMessage({ ...messageInput(booking), description: order.description, amountCents: order.amount_cents }),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "change_order.withdraw",
      entityType: "change_order",
      entityId: order.id,
      metadata: { bookingId: order.booking_id },
      at: ctx.now,
    });
    return { changeOrderId: order.id, bookingId: order.booking_id, status: "void" };
  });
}

export type IssueInvoiceInput = { bookingId: string; notes?: InvoiceCommand["notes"] };

export type IssueInvoiceResult = InvoiceTotals & {
  invoiceId: string;
  invoiceNumber: string;
  bookingId: string;
  lineItems: InvoiceLineDto[];
};

// Unambiguous characters (no 0/O, 1/I/L) for invoice numbers such as INV-7KQ2MX.
const INVOICE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function uniqueInvoiceNumber(trx: Tx, prefix: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) code += INVOICE_ALPHABET[randomInt(INVOICE_ALPHABET.length)];
    const candidate = `${prefix}-${code}`;
    const taken = await trx.selectFrom("invoices").select("id").where("invoice_number", "=", candidate).executeTakeFirst();
    if (!taken) return candidate;
  }
  throw new Error("Could not generate a unique invoice number");
}

function sumByKind(lines: readonly InvoiceLineDto[], kind: string): number {
  return lines.filter((line) => line.kind === kind).reduce((sum, line) => sum + line.amountCents, 0);
}

/**
 * Issues the final invoice of a completed booking, once: the quote's accepted line items (from
 * the booking's snapshot) plus every APPROVED change order (rejected and void ones are left
 * out). Totals come from pricing.computeInvoiceTotals with the booking's fee rate, so the
 * platform fee applies to the combined labor. Not allowed while a change order awaits the
 * customer's decision. Invoices get numbers like INV-7KQ2MX (seeded fixtures keep their
 * is_demo_fixture flag on the row, not in the number). Notifies the customer.
 */
export async function issueInvoice(ctx: AppContext, viewer: Viewer, input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  assertMechanic(viewer);
  const command = parseCommand(invoiceCommandSchema, { notes: input.notes ?? null });
  const { bookingId } = input;
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const booking = await loadOwnBooking(trx, viewer, bookingId);
    assertStatus(booking, ["completed"], "issue the invoice yet");
    const existing = await trx.selectFrom("invoices").select("id").where("booking_id", "=", booking.id).executeTakeFirst();
    if (existing) throw new DomainError("conflict", "An invoice has already been issued for this booking.");

    const orders = await trx
      .selectFrom("change_orders")
      .select(["id", "status", "description", "labor_cents", "parts_cents", "tax_cents"])
      .where("booking_id", "=", booking.id)
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    if (orders.some((order) => order.status === "proposed")) {
      throw new DomainError("conflict", PENDING_CHANGE_ORDER_BLOCK);
    }
    const approved = orders.filter((order) => order.status === "approved");
    const totals = computeInvoiceTotals(
      bookingTotals(booking),
      approved.map((order) => ({ laborCents: order.labor_cents, partsCents: order.parts_cents, taxCents: order.tax_cents })),
      booking.platform_fee_bps,
    );

    const terms = await loadBookingTerms(trx, booking);
    const lineItems: InvoiceLineDto[] = [
      ...terms.items.map(
        (item): InvoiceLineDto => ({
          source: "quote",
          changeOrderId: null,
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          amountCents: item.amountCents,
        }),
      ),
      ...approved.flatMap((order) =>
        (
          [
            ["labor", "labor", order.labor_cents],
            ["part", "parts", order.parts_cents],
            ["tax", "tax", order.tax_cents],
          ] as const
        )
          .filter(([, , amount]) => amount > 0)
          .map(
            ([kind, noun, amount]): InvoiceLineDto => ({
              source: "change_order",
              changeOrderId: order.id,
              kind,
              description: `Change order: ${order.description.slice(0, 150)} (${noun})`,
              quantity: 1,
              unitPriceCents: amount,
              amountCents: amount,
            }),
          ),
      ),
    ];
    // The lines must add up to the totals pricing.ts computed (a guard against bad snapshots).
    if (
      sumByKind(lineItems, "labor") !== totals.laborCents ||
      sumByKind(lineItems, "part") !== totals.partsCents ||
      sumByKind(lineItems, "tax") !== totals.taxCents ||
      sumByKind(lineItems, "fee") !== totals.feeCents
    ) {
      throw new Error(`Invoice lines for booking ${booking.id} do not match its totals`);
    }

    const invoiceNumber = await uniqueInvoiceNumber(trx, "INV");
    const invoiceId = newId();
    await trx
      .insertInto("invoices")
      .values({
        id: invoiceId,
        booking_id: booking.id,
        invoice_number: invoiceNumber,
        currency: "USD",
        line_items_json: JSON.stringify(lineItems),
        labor_cents: totals.laborCents,
        parts_cents: totals.partsCents,
        tax_cents: totals.taxCents,
        fee_cents: totals.feeCents,
        total_cents: totals.totalCents,
        platform_fee_bps: totals.platformFeeBps,
        platform_fee_cents: totals.platformFeeCents,
        mechanic_payout_cents: totals.mechanicPayoutCents,
        approved_change_order_count: totals.approvedChangeOrderCount,
        notes: command.notes,
        issued_by: viewer.id,
        issued_at: nowIso,
        is_demo_fixture: booking.is_demo_fixture,
      })
      .execute();
    await notify(trx, {
      userId: booking.customer_id,
      ...invoiceIssuedMessage({ ...messageInput(booking), invoiceNumber, totalCents: totals.totalCents }),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "invoice.issue",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: {
        bookingId: booking.id,
        invoiceNumber,
        totalCents: totals.totalCents,
        platformFeeCents: totals.platformFeeCents,
        approvedChangeOrderIds: approved.map((order) => order.id),
      },
      at: ctx.now,
    });
    return { ...totals, invoiceId, invoiceNumber, bookingId: booking.id, lineItems };
  });
}
