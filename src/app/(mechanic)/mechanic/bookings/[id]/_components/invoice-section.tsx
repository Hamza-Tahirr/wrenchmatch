import { Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { HudLabel, Panel } from "../../../_components/hud";
import { LineItems } from "../../../_components/line-items";
import { moneyRows } from "./booking-money";

/** The issued final invoice, or when it will be available. */
export function InvoiceSection({ booking }: { booking: MyBookingDetail }) {
  const invoice = booking.invoice;
  if (!invoice) {
    return (
      <Panel id="invoice" title="Final invoice" icon={<Receipt />} tone="violet">
        <p className="flex items-start gap-2.5 text-sm text-fg-muted">
          {booking.status === "completed"
            ? "Not issued yet. Use Issue final invoice in Next step."
            : "Issued after the job is complete: the accepted quote plus approved change orders."}
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      id="invoice"
      title={
        <>
          Invoice <span className="font-mono tracking-normal">{invoice.invoiceNumber}</span>
        </>
      }
      eyebrow={`Issued ${formatDateTime(invoice.issuedAt, booking.timeZone)}`}
      icon={<Receipt />}
      tone="violet"
      actions={<Badge tone="success">Issued</Badge>}
      bodyClassName="space-y-4"
    >
      <LineItems
        caption={`Invoice ${invoice.invoiceNumber} line items`}
        lines={invoice.lineItems}
        totals={invoice}
        extraRows={moneyRows(invoice.platformFeeBps, invoice.platformFeeCents, invoice.mechanicPayoutCents)}
      />
      <p className="text-sm text-fg-muted">
        {invoice.approvedChangeOrderCount > 0
          ? `Includes ${invoice.approvedChangeOrderCount} approved change order${invoice.approvedChangeOrderCount === 1 ? "" : "s"}. `
          : null}
        Nothing is charged online: online payments are coming soon.
      </p>
      {invoice.notes ? (
        <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-sm">
          <HudLabel tone="muted">Notes</HudLabel>
          <p className="mt-1 whitespace-pre-line text-fg">{invoice.notes}</p>
        </div>
      ) : null}
    </Panel>
  );
}
