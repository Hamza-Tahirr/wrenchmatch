import "server-only";

import {
  BOOKING_STATUS_INFO,
  BOOKING_STATUSES,
  PAYOUT_STATUSES,
  type BookingStatus,
  type PayoutStatus,
} from "@/lib/domain";
import { demoBookingActionSchema, demoPayoutHoldSchema } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { notify } from "@/server/notifications/notify";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { emailText, sentence } from "./messages";
import { vehicleLabel } from "./request-items";
import { oneOf } from "./types";

// Admin interventions on bookings. Only seeded fixtures (is_demo_fixture = 1, inserted by the
// seed in post-booking states) can be changed: real reservations involve money, and
// refunds and payouts need online payments (Stripe), which are not connected in this build.
// User-facing copy never says "demo" (presentation mode, ARCHITECTURE section 11); it says
// plainly that no online payment was taken.

export const CANCELLABLE_DEMO_STATUSES: readonly BookingStatus[] = ["confirmed", "in_progress"];
export const DISPUTABLE_DEMO_STATUSES: readonly BookingStatus[] = ["confirmed", "in_progress", "completed"];

export const NOT_CONNECTED_MESSAGE =
  "Refunds and payouts are available once online payments launch. This booking has no online payment yet, so it can't be changed here.";

/** Email template names (kept free of internal wording: the admin outbox shows them). */
export const INTERVENTION_EMAIL_TEMPLATES = {
  cancelled: "booking_admin_cancelled",
  disputed: "booking_admin_disputed",
  payoutHeld: "booking_payout_held",
  payoutReleased: "booking_payout_released",
} as const;

/** Which interventions the admin UI can offer for a booking (the commands enforce the same rules). */
export type BookingInterventions = {
  cancel: boolean;
  markDisputed: boolean;
  holdPayout: boolean;
  releasePayout: boolean;
};

export function bookingInterventions(
  isDemoFixture: boolean,
  status: BookingStatus,
  payoutStatus: PayoutStatus,
): BookingInterventions {
  return {
    cancel: isDemoFixture && CANCELLABLE_DEMO_STATUSES.includes(status),
    markDisputed: isDemoFixture && DISPUTABLE_DEMO_STATUSES.includes(status),
    holdPayout: isDemoFixture && payoutStatus === "pending",
    releasePayout: isDemoFixture && payoutStatus === "held",
  };
}

export type DemoBookingActionInput = {
  bookingId: string;
  /** 3-500 characters; shown to the customer and the mechanic. */
  reason: string;
};

export type DemoPayoutHoldInput = {
  bookingId: string;
  /** true holds a pending payout; false releases a held one. */
  hold: boolean;
  /** 3-500 characters; shown to the mechanic. */
  reason: string;
};

export type InterventionResult = {
  bookingId: string;
  status: BookingStatus;
  payoutStatus: PayoutStatus;
};

type LoadedBooking = {
  id: string;
  requestId: string;
  quoteId: string;
  customerId: string;
  customerName: string;
  mechanicId: string;
  mechanicName: string;
  status: BookingStatus;
  payoutStatus: PayoutStatus;
  isDemoFixture: boolean;
  summary: string;
};

async function loadBooking(trx: Tx, bookingId: string): Promise<LoadedBooking> {
  const row = await trx
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("users as cu", "cu.id", "b.customer_id")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "b.mechanic_id")
    .select([
      "b.id",
      "b.request_id",
      "b.quote_id",
      "b.customer_id",
      "cu.display_name as customer_name",
      "b.mechanic_id",
      "mp.display_name as mechanic_name",
      "b.status",
      "b.payout_status",
      "b.is_demo_fixture",
      "c.name as category_name",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
    ])
    .where("b.id", "=", bookingId)
    .executeTakeFirst();
  if (!row) throw new DomainError("not_found", "That booking was not found.");
  return {
    id: row.id,
    requestId: row.request_id,
    quoteId: row.quote_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    mechanicId: row.mechanic_id,
    mechanicName: row.mechanic_name,
    status: oneOf(BOOKING_STATUSES, row.status, "bookings.status"),
    payoutStatus: oneOf(PAYOUT_STATUSES, row.payout_status, "bookings.payout_status"),
    isDemoFixture: row.is_demo_fixture === 1,
    summary: `${row.category_name} for a ${vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model)}`,
  };
}

function requireFixture(booking: LoadedBooking): void {
  if (!booking.isDemoFixture) {
    throw new DomainError("payment_not_connected", NOT_CONNECTED_MESSAGE, { bookingId: booking.id });
  }
}

function statusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_INFO[status].label.toLowerCase();
}

type Party = "customer" | "mechanic";

async function notifyParty(
  trx: Tx,
  booking: LoadedBooking,
  party: Party,
  message: { type: string; title: string; body: string; template: string },
  at: Date,
): Promise<void> {
  const userId = party === "customer" ? booking.customerId : booking.mechanicId;
  const displayName = party === "customer" ? booking.customerName : booking.mechanicName;
  const linkPath = party === "customer" ? `/bookings/${booking.id}` : `/mechanic/bookings/${booking.id}`;
  await notify(trx, {
    userId,
    type: message.type,
    title: message.title,
    body: message.body,
    linkPath,
    email: { subject: message.title, text: emailText(displayName, [message.body], linkPath), template: message.template },
    at,
  });
}

/**
 * Cancels a confirmed or in-progress demo booking with a reason. Its pending or held demo
 * payout becomes not eligible, proposed change orders are voided and its quote is declined
 * (as when a customer cancels a reservation), which frees the mechanic's slot. Both parties
 * are notified. No refund is involved: demo bookings carry no real payment. The request
 * keeps its "booked" status (the schema has no transition out of it); show the booking's.
 *
 * Throws DomainError: forbidden, invalid_input, not_found, payment_not_connected (a real
 * booking), conflict (status).
 */
export async function cancelDemoBooking(
  ctx: AppContext,
  viewer: Viewer,
  input: DemoBookingActionInput,
): Promise<InterventionResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(demoBookingActionSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const booking = await loadBooking(trx, data.bookingId);
    requireFixture(booking);
    if (!CANCELLABLE_DEMO_STATUSES.includes(booking.status)) {
      throw new DomainError(
        "conflict",
        `Only a confirmed or in-progress booking can be cancelled. This one is ${statusLabel(booking.status)}.`,
      );
    }

    const payoutStatus: PayoutStatus =
      booking.payoutStatus === "pending" || booking.payoutStatus === "held" ? "not_eligible" : booking.payoutStatus;
    await trx
      .updateTable("bookings")
      .set({ status: "cancelled", cancelled_at: nowIso, cancel_reason: data.reason, payout_status: payoutStatus, updated_at: nowIso })
      .where("id", "=", booking.id)
      .execute();
    const voided = await trx
      .updateTable("change_orders")
      .set({
        status: "void",
        decided_by: viewer.id,
        decided_at: nowIso,
        decision_note: "Voided because the booking was cancelled by an admin.",
        updated_at: nowIso,
      })
      .where("booking_id", "=", booking.id)
      .where("status", "=", "proposed")
      .executeTakeFirst();
    const declined = await trx
      .updateTable("quotes")
      .set({ status: "declined", updated_at: nowIso })
      .where("id", "=", booking.quoteId)
      .where("status", "=", "selected")
      .executeTakeFirst();

    const reason = sentence(data.reason);
    await notifyParty(trx, booking, "customer", {
      type: "booking.demo_cancelled",
      title: "Your booking was cancelled",
      body: `An admin cancelled your booking (${booking.summary}). Reason: ${reason} No online payment was taken, so there is nothing to refund.`,
      template: INTERVENTION_EMAIL_TEMPLATES.cancelled,
    }, ctx.now);
    await notifyParty(trx, booking, "mechanic", {
      type: "booking.demo_cancelled",
      title: "A booking was cancelled",
      body: `An admin cancelled the booking (${booking.summary}). Reason: ${reason} No payout is due for this booking.`,
      template: INTERVENTION_EMAIL_TEMPLATES.cancelled,
    }, ctx.now);
    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.demoBookingCancelled,
      entityType: "booking",
      entityId: booking.id,
      reason: data.reason,
      metadata: {
        requestId: booking.requestId,
        quoteId: booking.quoteId,
        from: booking.status,
        to: "cancelled",
        payoutFrom: booking.payoutStatus,
        payoutTo: payoutStatus,
        voidedChangeOrders: Number(voided.numUpdatedRows),
        quoteDeclined: Number(declined.numUpdatedRows) > 0,
      },
      at: ctx.now,
    });
    return { bookingId: booking.id, status: "cancelled", payoutStatus };
  });
}

/**
 * Marks a confirmed, in-progress or completed demo booking as disputed with a reason. A
 * pending demo payout is put on hold while the dispute is open (release it with
 * setDemoPayoutHold). Both parties are notified.
 *
 * Throws DomainError: forbidden, invalid_input, not_found, payment_not_connected (a real
 * booking), conflict (status).
 */
export async function markDemoBookingDisputed(
  ctx: AppContext,
  viewer: Viewer,
  input: DemoBookingActionInput,
): Promise<InterventionResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(demoBookingActionSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const booking = await loadBooking(trx, data.bookingId);
    requireFixture(booking);
    if (!DISPUTABLE_DEMO_STATUSES.includes(booking.status)) {
      throw new DomainError(
        "conflict",
        `Only a confirmed, in-progress or completed booking can be marked disputed. This one is ${statusLabel(booking.status)}.`,
      );
    }

    const payoutStatus: PayoutStatus = booking.payoutStatus === "pending" ? "held" : booking.payoutStatus;
    await trx
      .updateTable("bookings")
      .set({ status: "disputed", payout_status: payoutStatus, updated_at: nowIso })
      .where("id", "=", booking.id)
      .execute();

    const reason = sentence(data.reason);
    const held = payoutStatus === "held" && booking.payoutStatus !== "held" ? " The payout is on hold while it is reviewed." : "";
    for (const party of ["customer", "mechanic"] as const) {
      await notifyParty(trx, booking, party, {
        type: "booking.demo_disputed",
        title: "A booking is under dispute review",
        body: `An admin marked the booking (${booking.summary}) as disputed. Reason: ${reason}${party === "mechanic" ? held : ""} An admin will follow up through Help & support.`,
        template: INTERVENTION_EMAIL_TEMPLATES.disputed,
      }, ctx.now);
    }
    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.demoBookingDisputed,
      entityType: "booking",
      entityId: booking.id,
      reason: data.reason,
      metadata: {
        requestId: booking.requestId,
        from: booking.status,
        to: "disputed",
        payoutFrom: booking.payoutStatus,
        payoutTo: payoutStatus,
      },
      at: ctx.now,
    });
    return { bookingId: booking.id, status: "disputed", payoutStatus };
  });
}

/**
 * Holds a pending demo payout (hold: true) or releases a held one back to pending
 * (hold: false), with a reason. Only the mechanic is notified: the payout is theirs.
 *
 * Throws DomainError: forbidden, invalid_input, not_found, payment_not_connected (a real
 * booking), conflict (payout not in the required state).
 */
export async function setDemoPayoutHold(
  ctx: AppContext,
  viewer: Viewer,
  input: DemoPayoutHoldInput,
): Promise<InterventionResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(demoPayoutHoldSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const booking = await loadBooking(trx, data.bookingId);
    requireFixture(booking);
    const required: PayoutStatus = data.hold ? "pending" : "held";
    if (booking.payoutStatus !== required) {
      throw new DomainError(
        "conflict",
        data.hold
          ? "Only a pending payout can be put on hold. Refresh to see the latest."
          : "Only a held payout can be released. Refresh to see the latest.",
      );
    }

    const payoutStatus: PayoutStatus = data.hold ? "held" : "pending";
    await trx
      .updateTable("bookings")
      .set({ payout_status: payoutStatus, updated_at: nowIso })
      .where("id", "=", booking.id)
      .execute();

    const reason = sentence(data.reason);
    await notifyParty(trx, booking, "mechanic", data.hold
      ? {
          type: "booking.demo_payout_held",
          title: "A payout is on hold",
          body: `An admin put the payout for ${booking.summary} on hold. Reason: ${reason} No money moves until online payments launch.`,
          template: INTERVENTION_EMAIL_TEMPLATES.payoutHeld,
        }
      : {
          type: "booking.demo_payout_released",
          title: "A payout was released",
          body: `An admin released the payout for ${booking.summary}; it is pending again. Reason: ${reason} No money moves until online payments launch.`,
          template: INTERVENTION_EMAIL_TEMPLATES.payoutReleased,
        }, ctx.now);
    await recordAudit(trx, {
      actor: viewer,
      action: data.hold ? ADMIN_AUDIT_ACTIONS.demoPayoutHeld : ADMIN_AUDIT_ACTIONS.demoPayoutReleased,
      entityType: "booking",
      entityId: booking.id,
      reason: data.reason,
      metadata: { requestId: booking.requestId, payoutFrom: booking.payoutStatus, payoutTo: payoutStatus },
      at: ctx.now,
    });
    return { bookingId: booking.id, status: booking.status, payoutStatus };
  });
}
