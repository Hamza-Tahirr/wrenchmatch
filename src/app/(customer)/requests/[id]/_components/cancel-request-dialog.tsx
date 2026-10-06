import { Ban } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { pluralize } from "@/lib/format";
import { CANCEL_REASON_MAX_LENGTH } from "@/lib/validation/request";

import { cancelRequestAction } from "../actions";

/** "Cancel request" with a confirmation that says what happens to the quotes and mechanics. */
export function CancelRequestDialog({
  requestId,
  liveQuoteCount,
  matchedCount,
  triggerVariant = "secondary",
}: {
  requestId: string;
  liveQuoteCount: number;
  matchedCount: number;
  triggerVariant?: "secondary" | "danger" | "ghost";
}) {
  const consequences = [
    liveQuoteCount > 0 ? `Your ${pluralize(liveQuoteCount, "open quote")} will be declined.` : null,
    matchedCount > 0 ? `We'll tell the ${pluralize(matchedCount, "mechanic")} we notified.` : null,
    "This can't be undone, but you can send a new request at any time.",
  ].filter(Boolean);

  return (
    <ConfirmDialog
      trigger="Cancel request"
      triggerVariant={triggerVariant}
      triggerIcon={<Ban />}
      tone="danger"
      title="Cancel this request?"
      description={consequences.join(" ")}
      confirmLabel="Cancel request"
      pendingLabel="Cancelling…"
      cancelLabel="Keep request"
      action={cancelRequestAction}
      successToast="Request cancelled"
      hiddenFields={{ requestId }}
    >
      <Field label="Reason" name="reason" optional hint="Only the WrenchMatch team sees this. It helps us improve matching.">
        <Textarea rows={3} maxLength={CANCEL_REASON_MAX_LENGTH} />
      </Field>
    </ConfirmDialog>
  );
}
