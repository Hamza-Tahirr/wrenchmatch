import { FilePen, FilePlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { formatDateTime } from "@/lib/format";
import type { ChangeOrderDto, MyBookingDetail } from "@/server/mechanic/bookings";

import { Panel } from "../../../_components/hud";
import { TAP } from "../../../_components/tap";
import { ToastConfirmDialog } from "../../../_components/toast-actions";
import { withdrawChangeOrderAction } from "../actions";
import { ChangeOrderForm } from "./change-order-form";

function ChangeOrderItem({ order, timeZone }: { order: ChangeOrderDto; timeZone: string }) {
  const waiting = order.status === "proposed";
  return (
    <li className={waiting ? "space-y-3 rounded-xl border border-warning-600/35 bg-warning-600/5 p-4" : "space-y-3 rounded-xl border border-line bg-surface-2/40 p-4"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
          <h3 className="text-sm font-medium whitespace-pre-line text-fg">{order.description}</h3>
          <p className="text-sm whitespace-pre-line text-fg-muted">
            <span className="font-medium text-fg">Reason:</span> {order.reason}
          </p>
        </div>
        <p className="shrink-0 font-mono text-xl font-semibold text-fg tabular sm:text-right">
          <Money cents={order.amountCents} />
        </p>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
        <div className="flex gap-1">
          <dt>Labor</dt>
          <dd className="font-mono text-fg-muted tabular">
            <Money cents={order.laborCents} />
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Parts</dt>
          <dd className="font-mono text-fg-muted tabular">
            <Money cents={order.partsCents} />
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Tax</dt>
          <dd className="font-mono text-fg-muted tabular">
            <Money cents={order.taxCents} />
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Proposed</dt>
          <dd className="text-fg-muted">{formatDateTime(order.createdAt, timeZone)}</dd>
        </div>
        {order.decidedAt ? (
          <div className="flex gap-1">
            <dt>Decided</dt>
            <dd className="text-fg-muted">{formatDateTime(order.decidedAt, timeZone)}</dd>
          </div>
        ) : null}
      </dl>
      {order.decisionNote ? <p className="text-sm text-fg-muted">Note: {order.decisionNote}</p> : null}
      {order.paymentNote ? <p className="text-sm text-fg-muted">{order.paymentNote}</p> : null}
      {order.canWithdraw ? (
        <ToastConfirmDialog
          trigger="Withdraw change order"
          tone="danger"
          triggerVariant="secondary"
          triggerSize="sm"
          triggerClassName={TAP}
          title="Withdraw this change order?"
          description="The customer no longer needs to decide on it. You can propose a new one if needed."
          confirmLabel="Withdraw"
          pendingLabel="Withdrawing…"
          action={withdrawChangeOrderAction}
          hiddenFields={{ changeOrderId: order.id }}
          successToast={{ title: "Change order withdrawn", description: "The customer no longer needs to decide on it." }}
        />
      ) : null}
    </li>
  );
}

/** Change orders on the booking, with the propose form (confirmed or in-progress bookings). */
export function ChangeOrdersSection({ booking }: { booking: MyBookingDetail }) {
  const canPropose = booking.actions.canProposeChangeOrder;
  // The ones waiting for the customer first, then the newest.
  const orders = [...booking.changeOrders].sort(
    (a, b) => Number(b.status === "proposed") - Number(a.status === "proposed") || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <Panel
      id="change-orders"
      title="Change orders"
      description="Extra work or cost needs the customer's approval before you do it."
      icon={<FilePen />}
      tone="warning"
      actions={
        canPropose ? (
          <Dialog
            trigger="Propose change order"
            triggerVariant="secondary"
            triggerIcon={<FilePlus />}
            triggerClassName={TAP}
            title="Propose a change order"
            description="Describe the extra work and its cost. The customer approves or declines it."
            size="lg"
          >
            <ChangeOrderForm bookingId={booking.id} />
          </Dialog>
        ) : null
      }
    >
      {orders.length > 0 ? (
        <ul className="stagger-children space-y-3">
          {orders.map((order) => (
            <ChangeOrderItem key={order.id} order={order} timeZone={booking.timeZone} />
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-2.5 text-sm text-fg-muted">
          <FilePen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          {canPropose
            ? "No change orders. If you find more work is needed, propose one and wait for the customer's approval."
            : "No change orders on this booking."}
        </p>
      )}
    </Panel>
  );
}
