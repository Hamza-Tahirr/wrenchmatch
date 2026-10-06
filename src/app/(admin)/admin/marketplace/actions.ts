"use server";

import {
  demoBookingActionSchema,
  demoPayoutHoldSchema,
  type AdminActionState,
} from "@/lib/validation/admin";
import { cancelDemoBooking, markDemoBookingDisputed, setDemoPayoutHold } from "@/server/admin/interventions";

import { runAdminAction } from "../_lib/run-action";

// Admin actions on bookings (marketplace and request pages). Only jobs past the reservation
// can be changed; the domain commands refuse a reservation that is waiting for payment with
// an honest message (refunds and payouts need online payments, which are not live yet).

const marketplacePath = () => "/admin/marketplace";

export async function cancelBookingAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: demoBookingActionSchema,
    path: marketplacePath,
    run: (ctx, viewer, data) => cancelDemoBooking(ctx, viewer, data),
    success: () =>
      "Booking cancelled. The customer and the mechanic were notified; no online payment was taken, so there is nothing to refund.",
  });
}

export async function markBookingDisputedAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: demoBookingActionSchema,
    path: marketplacePath,
    run: (ctx, viewer, data) => markDemoBookingDisputed(ctx, viewer, data),
    success: (result) =>
      `Booking marked disputed and both parties were notified.${result.payoutStatus === "held" ? " The payout is on hold." : ""}`,
  });
}

export async function setPayoutHoldAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: demoPayoutHoldSchema,
    path: marketplacePath,
    run: (ctx, viewer, data) => setDemoPayoutHold(ctx, viewer, data),
    success: (result) =>
      result.payoutStatus === "held"
        ? "Payout put on hold. The mechanic was notified."
        : "Payout released: it is pending again. The mechanic was notified.",
  });
}
