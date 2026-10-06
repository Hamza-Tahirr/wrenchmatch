import { FileCheck2, Package } from "lucide-react";

import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { HudLabel, Panel } from "../../../_components/hud";
import { LineItems } from "../../../_components/line-items";
import { moneyRows } from "./booking-money";
import { wasConfirmed } from "./booking-state";

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <HudLabel tone="muted">{title}</HudLabel>
      <p className="mt-1 whitespace-pre-line text-fg">{text}</p>
    </div>
  );
}

/** The accepted quote: scope, line items, the platform fee and the mechanic's payout. */
export function JobTermsCard({ booking }: { booking: MyBookingDetail }) {
  const { job, money } = booking;
  // Never confirmed: a pending reservation, or one cancelled before payment.
  const reserved = !wasConfirmed(booking);
  return (
    <Panel
      id="job-terms"
      title={reserved ? "Reserved job and price" : "Agreed job and price"}
      description={
        reserved
          ? "From the quote the customer reserved. These terms can't change."
          : "From the quote the customer accepted. These terms can't change; extra work needs a change order."
      }
      icon={<FileCheck2 />}
      bodyClassName="space-y-6"
    >
      <div className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4 text-sm">
        <TextBlock title="Customer’s description" text={booking.request.description} />
        <TextBlock title="What the price covers" text={job.scope} />
        {job.exclusions ? <TextBlock title="Exclusions" text={job.exclusions} /> : null}
        {job.notes ? <TextBlock title="Notes" text={job.notes} /> : null}
        <p className="flex items-center gap-2 text-fg-muted">
          <Package aria-hidden="true" className="size-4 text-neon-cyan" />
          {job.partsIncluded ? "Parts included in the price" : "Labor only: parts not included"}
        </p>
      </div>
      {/* Once invoiced, the invoice (with approved change orders) carries the one payout figure. */}
      <LineItems
        caption="Agreed line items"
        lines={job.items}
        totals={money}
        extraRows={booking.invoice ? [] : moneyRows(money.platformFeeBps, money.platformFeeCents, money.mechanicPayoutCents)}
      />
      {booking.invoice ? (
        <p className="text-sm text-fg-muted">
          The platform fee and your payout are on the final invoice
          {booking.invoice.approvedChangeOrderCount > 0 ? ", which includes the approved change orders" : null}.
        </p>
      ) : null}
    </Panel>
  );
}
