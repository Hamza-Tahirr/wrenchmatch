import { Ban } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CANCEL_REASON_MAX_LENGTH } from "@/lib/validation/request";

import { cancelReservationAction } from "../actions";

/** "Cancel reservation" for a pending reservation, explaining what happens. */
export function CancelReservationDialog({ bookingId, mechanicName }: { bookingId: string; mechanicName: string }) {
  return (
    <ConfirmDialog
      trigger="Cancel reservation"
      triggerVariant="secondary"
      triggerIcon={<Ban />}
      tone="danger"
      title="Cancel this reservation?"
      description={`${mechanicName} will be told and their time slot is freed. Nothing was charged, so there's nothing to refund. This also closes the request: to choose another quote, send a new request.`}
      confirmLabel="Cancel reservation"
      pendingLabel="Cancelling…"
      cancelLabel="Keep reservation"
      action={cancelReservationAction}
      successToast="Reservation cancelled"
      hiddenFields={{ bookingId }}
    >
      <Field label="Reason" name="reason" optional hint="The mechanic and the WrenchMatch team can see this.">
        <Textarea rows={3} maxLength={CANCEL_REASON_MAX_LENGTH} />
      </Field>
    </ConfirmDialog>
  );
}
