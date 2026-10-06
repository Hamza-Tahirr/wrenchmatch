import { Ban, CirclePause, CirclePlay, Gavel, Lock } from "lucide-react";

import { ADMIN_REASON_MAX_LENGTH } from "@/lib/validation/admin";
import type { AdminBookingListItem } from "@/server/admin/booking-items";

import { cancelBookingAction, markBookingDisputedAction, setPayoutHoldAction } from "../marketplace/actions";
import { ActionDialog, type ActionDialogField } from "./action-dialog";

/** Why a reservation that is waiting for payment can't be refunded or paid out here. */
export const PAYMENTS_NOT_LIVE = "Refunds and payouts are available once online payments launch.";

function reasonField(audience: string): ActionDialogField {
  return {
    name: "reason",
    label: `Reason (shown to ${audience})`,
    required: true,
    rows: 3,
    maxLength: ADMIN_REASON_MAX_LENGTH,
    hint: "At least 3 characters. Kept in the audit log.",
  };
}

/**
 * Admin actions on one booking: mark disputed, hold or release the payout, cancel. Only jobs
 * past the reservation can be changed (the domain commands enforce it); a reservation waiting
 * for payment says plainly why nothing can be done here yet.
 */
export function BookingInterventions({
  booking,
  summary,
}: {
  booking: AdminBookingListItem;
  /** e.g. "2012 Ford Escape SE · Minor engine / sensor work", for dialog titles. */
  summary: string;
}) {
  const { interventions } = booking;
  const none = !interventions.cancel && !interventions.markDisputed && !interventions.holdPayout && !interventions.releasePayout;
  if (none) {
    return (
      <p className="flex items-start gap-2 text-sm text-fg-subtle">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {booking.isDemoFixture ? "No admin action applies in this state." : PAYMENTS_NOT_LIVE}
      </p>
    );
  }
  const hidden = { bookingId: booking.id };
  return (
    <div className="flex flex-wrap gap-2">
      {interventions.markDisputed ? (
        <ActionDialog
          trigger="Mark disputed"
          triggerClassName="max-sm:flex-1"
          triggerIcon={<Gavel />}
          title="Mark this booking as disputed?"
          description={`${summary}. Both parties are notified. A pending payout is put on hold while the dispute is open.`}
          action={markBookingDisputedAction}
          hiddenFields={hidden}
          fields={[reasonField("the customer and the mechanic")]}
          confirmLabel="Mark disputed"
          pendingLabel="Saving…"
        />
      ) : null}
      {interventions.holdPayout ? (
        <ActionDialog
          trigger="Hold payout"
          triggerClassName="max-sm:flex-1"
          triggerIcon={<CirclePause />}
          title="Hold the payout?"
          description={`${summary}. The mechanic is notified. No money moves until online payments launch.`}
          action={setPayoutHoldAction}
          hiddenFields={{ ...hidden, hold: "true" }}
          fields={[reasonField("the mechanic")]}
          confirmLabel="Hold payout"
          pendingLabel="Holding…"
        />
      ) : null}
      {interventions.releasePayout ? (
        <ActionDialog
          trigger="Release payout"
          triggerClassName="max-sm:flex-1"
          triggerIcon={<CirclePlay />}
          title="Release the held payout?"
          description={`${summary}. The payout goes back to pending and the mechanic is notified.`}
          action={setPayoutHoldAction}
          hiddenFields={{ ...hidden, hold: "false" }}
          fields={[reasonField("the mechanic")]}
          confirmLabel="Release payout"
          pendingLabel="Releasing…"
        />
      ) : null}
      {interventions.cancel ? (
        <ActionDialog
          trigger="Cancel booking"
          triggerClassName="max-sm:flex-1"
          triggerIcon={<Ban />}
          title="Cancel this booking?"
          description={`${summary}. Both parties are notified, proposed change orders are voided and the mechanic's slot is freed. No online payment was taken, so there is nothing to refund.`}
          action={cancelBookingAction}
          hiddenFields={hidden}
          fields={[reasonField("the customer and the mechanic")]}
          confirmLabel="Cancel booking"
          pendingLabel="Cancelling…"
          tone="danger"
        />
      ) : null}
    </div>
  );
}
