import { Check, FilePen, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatCents, formatDateTime } from "@/lib/format";
import { DECISION_NOTE_MAX_LENGTH } from "@/lib/validation/booking";
import type { ChangeOrderView, CustomerBookingDetail } from "@/server/customer/booking-views";

import { decideChangeOrderAction } from "../actions";

function DecisionNoteField({ hint }: { hint: string }) {
  return (
    <Field label="Note to the mechanic" name="note" optional hint={hint}>
      <Textarea rows={3} maxLength={DECISION_NOTE_MAX_LENGTH} />
    </Field>
  );
}

function ChangeOrderCard({ order, timeZone, mechanicName }: { order: ChangeOrderView; timeZone: string; mechanicName: string }) {
  const amount = formatCents(order.amountCents, order.currency);
  const decided = order.status === "approved" || order.status === "rejected";
  const titleId = `change-order-${order.id}-title`;
  return (
    <li
      aria-labelledby={titleId}
      className={cn(
        "glass-lite overflow-hidden rounded-3xl",
        order.canDecide && "glow-border shadow-[0_0_40px_-18px_var(--color-warning-500)]",
      )}
    >
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="font-display text-base font-semibold text-fg">
            {order.description}
          </h3>
          <p className="text-sm text-fg-muted">
            Proposed by {mechanicName} on {formatDateTime(order.createdAt, timeZone)}
          </p>
        </div>
        <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:px-6">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Why it&rsquo;s needed</p>
            <p className="mt-1 text-sm whitespace-pre-line text-fg">{order.reason}</p>
          </div>
          <p className="text-sm text-fg-muted">
            <span className="font-medium text-fg">Payment:</span> {order.paymentLabel}
          </p>
          {decided && order.decidedAt ? (
            <p className="rounded-2xl border border-line bg-surface-2/60 p-3 text-sm text-fg-muted">
              You {order.status === "approved" ? "approved" : "declined"} this on {formatDateTime(order.decidedAt, timeZone)}.
              {order.decisionNote ? ` Your note: "${order.decisionNote}"` : null}
              {order.status === "approved" ? " Online payments are coming soon, so nothing was charged." : null}
            </p>
          ) : null}
        </div>
        <dl className="h-fit divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-2/60 text-sm">
          {[
            { label: "Labor", cents: order.laborCents },
            { label: "Parts", cents: order.partsCents },
            { label: "Tax", cents: order.taxCents },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-fg-subtle">{row.label}</dt>
              <dd className="font-mono text-fg tabular">
                <Money cents={row.cents} currency={order.currency} />
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-linear-to-r from-neon-cyan/[0.08] to-neon-violet/[0.08] px-3 py-2.5">
            <dt className="font-semibold text-fg">Extra cost</dt>
            <dd className="font-mono text-base font-semibold text-fg tabular">
              <Money cents={order.amountCents} currency={order.currency} />
            </dd>
          </div>
        </dl>
      </div>
      {order.canDecide ? (
        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <ConfirmDialog
            trigger="Decline"
            triggerIcon={<X />}
            triggerVariant="secondary"
            tone="danger"
            title="Decline this extra work?"
            description={`${mechanicName} will be told not to do it: ${order.description} (${amount}).`}
            confirmLabel="Decline extra work"
            pendingLabel="Declining…"
            cancelLabel="Go back"
            successToast="Extra work declined"
            action={decideChangeOrderAction}
            hiddenFields={{ changeOrderId: order.id, decision: "reject" }}
          >
            <DecisionNoteField hint="Optional, for example what you'd prefer instead." />
          </ConfirmDialog>
          <ConfirmDialog
            trigger="Approve"
            triggerIcon={<Check />}
            triggerVariant="primary"
            title="Approve this extra work?"
            description={`You agree to ${amount} of extra work: ${order.description}. Online payments are coming soon, so nothing will be charged now.`}
            confirmLabel="Approve extra work"
            pendingLabel="Approving…"
            cancelLabel="Go back"
            successToast="Extra work approved"
            action={decideChangeOrderAction}
            hiddenFields={{ changeOrderId: order.id, decision: "approve" }}
          >
            <DecisionNoteField hint="Optional, for example a question or a time that suits you." />
          </ConfirmDialog>
        </div>
      ) : null}
    </li>
  );
}

/** Extra work the mechanic found: nothing extra happens without the customer's approval. */
export function ChangeOrders({ booking }: { booking: CustomerBookingDetail }) {
  // Orders waiting for a decision first; otherwise newest first, as the server sends them.
  const orders = [...booking.changeOrders].sort((a, b) => Number(b.canDecide) - Number(a.canDecide));
  const awaiting = orders.filter((order) => order.canDecide).length;
  return (
    <section id="change-orders" aria-labelledby="change-orders-title" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">Your approval</p>
          <h2 id="change-orders-title" className="font-display text-xl font-semibold tracking-tight text-fg">
            Change orders
          </h2>
          <p className="max-w-2xl text-sm text-pretty text-fg-muted">
            If the mechanic finds more work than the quote covers, they propose a change order. Nothing extra is done
            without your approval.
          </p>
        </div>
        {awaiting > 0 ? (
          <Badge tone="warning" icon={<FilePen />}>
            {awaiting} awaiting your decision
          </Badge>
        ) : null}
      </div>
      {orders.length === 0 ? (
        <EmptyState
          icon={<FilePen />}
          headingLevel={3}
          title="No change orders"
          body="If extra work comes up, it will appear here for you to approve or decline first."
        />
      ) : (
        <ul className="stagger-children space-y-4">
          {orders.map((order) => (
            <ChangeOrderCard key={order.id} order={order} timeZone={booking.timeZone} mechanicName={booking.mechanic.displayName} />
          ))}
        </ul>
      )}
    </section>
  );
}
