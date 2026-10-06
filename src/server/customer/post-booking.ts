import "server-only";

import { BOOKING_STATUSES, CHANGE_ORDER_STATUSES, type BookingStatus, type ChangeOrderStatus } from "@/lib/domain";
import { formatCents } from "@/lib/format";
import { changeOrderDecisionSchema, reviewSchema, type ChangeOrderDecision } from "@/lib/validation/booking";
import { fieldErrorsFromZod } from "@/lib/validation/request";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";

import { assertCustomer, notFound } from "./access";
import { invalidFields } from "./form-errors";
import { changeOrderDecidedMechanicNotice, reviewReceivedMechanicNotice } from "./messages";
import { oneOf } from "./rows";

// After a booking is confirmed (seeded fixtures only while payments are not connected): the
// customer approves or declines extra work, and reviews a completed job once.

export type DecideChangeOrderParams = {
  changeOrderId: string;
  decision: ChangeOrderDecision;
  note?: string | null;
};

export type DecideChangeOrderResult = {
  changeOrderId: string;
  bookingId: string;
  status: Extract<ChangeOrderStatus, "approved" | "rejected">;
  /** Confirmation for the customer; says that payment for extra work is not connected. */
  message: string;
};

export type SubmitReviewParams = { bookingId: string; rating: number; comment?: string | null };
export type SubmitReviewResult = { reviewId: string; bookingId: string; isDemoFixture: boolean };

/** Booking states in which extra work can still be approved or declined. */
const DECIDABLE_BOOKING_STATUSES: readonly BookingStatus[] = ["confirmed", "in_progress"];

/**
 * Approves or declines a proposed change order on one of the customer's bookings, notifies
 * the mechanic and records an audit event. Approval records consent to the extra work; no
 * payment is taken because payments are not connected. Throws DomainError: not_found
 * (missing or someone else's), conflict (already decided, or the booking is no longer
 * active), invalid_input.
 */
export async function decideChangeOrder(
  ctx: AppContext,
  viewer: Viewer,
  input: DecideChangeOrderParams,
): Promise<DecideChangeOrderResult> {
  assertCustomer(viewer);
  const parsed = changeOrderDecisionSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const { changeOrderId, decision, note } = parsed.data;

  return writeTx(ctx.db, async (trx) => {
    const order = await trx
      .selectFrom("change_orders as o")
      .innerJoin("bookings as b", "b.id", "o.booking_id")
      .select([
        "o.id",
        "o.booking_id",
        "o.status",
        "o.description",
        "o.amount_cents",
        "o.currency",
        "o.is_demo_fixture",
        "b.status as booking_status",
        "b.mechanic_id",
        "b.customer_id",
      ])
      .where("o.id", "=", changeOrderId)
      .executeTakeFirst();
    if (!order || order.customer_id !== viewer.id) throw notFound("changeOrder");

    const status = oneOf(CHANGE_ORDER_STATUSES, order.status, "change_orders.status");
    if (status !== "proposed") {
      throw new DomainError("conflict", "This change order has already been decided. Refresh to see the latest.");
    }
    const bookingStatus = oneOf(BOOKING_STATUSES, order.booking_status, "bookings.status");
    if (!DECIDABLE_BOOKING_STATUSES.includes(bookingStatus)) {
      throw new DomainError("conflict", "This booking is no longer active, so its change orders can't be decided.");
    }

    const nowIso = ctx.now.toISOString();
    const newStatus = decision === "approve" ? "approved" : "rejected";
    await trx
      .updateTable("change_orders")
      .set({ status: newStatus, decided_by: viewer.id, decided_at: nowIso, decision_note: note, updated_at: nowIso })
      .where("id", "=", order.id)
      .execute();

    const amount = formatCents(order.amount_cents, order.currency);
    const approved = newStatus === "approved";
    const facts = {
      bookingId: order.booking_id,
      description: order.description,
      amountCents: order.amount_cents,
      currency: order.currency,
    };
    await notify(trx, { userId: order.mechanic_id, ...changeOrderDecidedMechanicNotice(facts, approved), at: ctx.now });
    await recordAudit(trx, {
      actor: viewer,
      action: approved ? "change_order.approve" : "change_order.reject",
      entityType: "change_order",
      entityId: order.id,
      reason: note,
      metadata: { bookingId: order.booking_id, amountCents: order.amount_cents, isDemoFixture: order.is_demo_fixture === 1 },
      at: ctx.now,
    });

    return {
      changeOrderId: order.id,
      bookingId: order.booking_id,
      status: newStatus,
      message: approved
        ? `You approved the extra work (${amount}). Online payments are coming soon, so nothing has been charged.`
        : "You declined the extra work. The mechanic has been told not to do it.",
    };
  });
}

/**
 * Leaves the one review allowed for a completed booking of the customer's. Reviews of demo
 * fixtures are flagged as fixtures too and never count toward ratings. Notifies the
 * mechanic and records an audit event. Throws DomainError: not_found, conflict (not
 * completed, or already reviewed), invalid_input.
 */
export async function submitReview(
  ctx: AppContext,
  viewer: Viewer,
  input: SubmitReviewParams,
): Promise<SubmitReviewResult> {
  assertCustomer(viewer);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const { bookingId, rating, comment } = parsed.data;

  return writeTx(ctx.db, async (trx) => {
    const booking = await trx
      .selectFrom("bookings")
      .select(["id", "status", "mechanic_id", "is_demo_fixture"])
      .where("id", "=", bookingId)
      .where("customer_id", "=", viewer.id)
      .executeTakeFirst();
    if (!booking) throw notFound("booking");
    if (booking.status !== "completed") {
      throw new DomainError("conflict", "You can leave a review once the work is completed.");
    }
    const existing = await trx.selectFrom("reviews").select("id").where("booking_id", "=", booking.id).executeTakeFirst();
    if (existing) throw new DomainError("conflict", "You've already reviewed this booking.");

    const reviewId = newId();
    const isDemoFixture = booking.is_demo_fixture === 1;
    await trx
      .insertInto("reviews")
      .values({
        id: reviewId,
        booking_id: booking.id,
        customer_id: viewer.id,
        mechanic_id: booking.mechanic_id,
        rating,
        comment,
        is_demo_fixture: booking.is_demo_fixture,
        created_at: ctx.now.toISOString(),
      })
      .execute();

    await notify(trx, {
      userId: booking.mechanic_id,
      ...reviewReceivedMechanicNotice(booking.id, rating, isDemoFixture),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "review.submit",
      entityType: "review",
      entityId: reviewId,
      metadata: { bookingId: booking.id, mechanicId: booking.mechanic_id, rating, isDemoFixture },
      at: ctx.now,
    });
    return { reviewId, bookingId: booking.id, isDemoFixture };
  });
}
