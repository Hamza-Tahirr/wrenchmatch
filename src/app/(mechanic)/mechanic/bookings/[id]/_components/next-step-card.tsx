import { CircleCheck, Compass, Hourglass, Play, Receipt, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { INVOICE_NOTES_MAX } from "@/lib/validation/quote";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { Panel } from "../../../_components/hud";
import { TAP } from "../../../_components/tap";
import { ToastConfirmDialog } from "../../../_components/toast-actions";
import { completeJobAction, issueInvoiceAction, startJobAction } from "../actions";
import { wasConfirmed } from "./booking-state";

function Notice({ tone, title, children }: { tone: "warning" | "danger"; title: string; children: ReactNode }) {
  return (
    <div
      role="note"
      className={
        tone === "danger"
          ? "flex gap-3 rounded-xl border border-danger-600/40 bg-danger-600/8 p-4"
          : "flex gap-3 rounded-xl border border-warning-600/40 bg-warning-600/8 p-4"
      }
    >
      <TriangleAlert aria-hidden="true" className={tone === "danger" ? "mt-0.5 size-5 shrink-0 text-danger-600" : "mt-0.5 size-5 shrink-0 text-warning-600"} />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <div className="text-sm text-fg-muted">{children}</div>
      </div>
    </div>
  );
}

/** The one thing to do next on a booking: start, complete or invoice, or why not. */
export function NextStepCard({ booking }: { booking: MyBookingDetail }) {
  const { actions } = booking;
  const hidden = { bookingId: booking.id };
  const vehicle = booking.request.vehicle.label;
  let body: ReactNode;
  if (actions.workBlockedReason && booking.status === "confirmed") {
    body = (
      <Notice tone="danger" title="You can't start this job">
        <p>{actions.workBlockedReason}</p>
      </Notice>
    );
  } else if (actions.canStart) {
    body = (
      <>
        <p className="text-sm text-fg-muted">When you arrive and begin, start the job so the customer knows work is under way.</p>
        <ToastConfirmDialog
          trigger="Start job"
          triggerVariant="primary"
          triggerIcon={<Play />}
          triggerClassName={`w-full ${TAP}`}
          title="Start this job?"
          description="The customer gets a notification that work has started."
          confirmLabel="Start job"
          pendingLabel="Starting…"
          action={startJobAction}
          hiddenFields={hidden}
          successToast={{ title: "Job started", description: `The customer was told work on the ${vehicle} is under way.` }}
        />
      </>
    );
  } else if (actions.canComplete) {
    body = (
      <>
        <p className="text-sm text-fg-muted">Finished the agreed work? Mark the job complete, then issue the final invoice.</p>
        {booking.pendingChangeOrderCount > 0 ? (
          <Notice tone="warning" title="A change order is waiting for the customer">
            <p>
              Customers can decide only while the job is open. Wait for their decision before completing, or withdraw the
              change order; don&rsquo;t do that extra work unless they approve it.
            </p>
          </Notice>
        ) : null}
        <ToastConfirmDialog
          trigger="Complete job"
          triggerVariant="primary"
          triggerIcon={<CircleCheck />}
          triggerClassName={`w-full ${TAP}`}
          title="Mark this job complete?"
          description="The customer gets a notification. You can then issue the final invoice."
          confirmLabel="Complete job"
          pendingLabel="Completing…"
          action={completeJobAction}
          hiddenFields={hidden}
          successToast={{ title: "Job marked complete", description: "Next: issue the final invoice." }}
        />
      </>
    );
  } else if (actions.canIssueInvoice) {
    body = (
      <>
        <p className="text-sm text-fg-muted">
          The invoice lists the accepted quote plus approved change orders. Amounts are calculated for you.
        </p>
        <ToastConfirmDialog
          trigger="Issue final invoice"
          triggerVariant="primary"
          triggerIcon={<Receipt />}
          triggerClassName={`w-full ${TAP}`}
          title="Issue the final invoice?"
          description="The invoice can't be changed after it's issued. The customer gets a notification."
          confirmLabel="Issue invoice"
          pendingLabel="Issuing…"
          action={issueInvoiceAction}
          hiddenFields={hidden}
          successToast={{ title: "Invoice issued", description: "The customer was notified. Nothing is charged online yet." }}
        >
          <Field label="Notes on the invoice" hint="For example, warranty details for the parts." optional>
            <Textarea name="notes" rows={3} maxLength={INVOICE_NOTES_MAX} />
          </Field>
        </ToastConfirmDialog>
      </>
    );
  } else if (actions.invoiceBlockedReason) {
    body = (
      <Notice tone="warning" title="Invoice on hold">
        <p>{actions.invoiceBlockedReason}</p>
      </Notice>
    );
  } else if (booking.status === "completed" && booking.invoice) {
    body = (
      <p className="flex items-start gap-2 text-sm text-fg">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
        Job complete and invoiced. Nothing else to do.
      </p>
    );
  } else if (booking.status === "pending_payment") {
    body = (
      <p className="flex items-start gap-2 text-sm text-fg-muted">
        <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-600" />
        Nothing to do yet. The reservation becomes a confirmed job once the customer pays, and online payments are coming
        soon.
      </p>
    );
  } else if (booking.status === "disputed") {
    body = <p className="text-sm text-fg-muted">An admin is reviewing a dispute on this booking. Use Get help to add details.</p>;
  } else {
    body = <p className="text-sm text-fg-muted">This {wasConfirmed(booking) ? "booking" : "reservation"} is closed.</p>;
  }
  return (
    <Panel id="next-step" title="Next step" icon={<Compass />} strong bodyClassName="space-y-4">
      {body}
      {actions.workBlockedReason && booking.status === "in_progress" ? (
        <Notice tone="warning" title="Your account can't take on new work">
          <p>{actions.workBlockedReason}</p>
        </Notice>
      ) : null}
    </Panel>
  );
}
