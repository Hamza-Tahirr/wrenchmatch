import { ArrowRight, CalendarClock, FilePen, MapPin, Receipt, Wrench } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { pluralize } from "@/lib/format";
import type { MyBookingSummary } from "@/server/mechanic/bookings";

import { formatSlotRange } from "../../_lib/display";
import { FactChip, HudLabel } from "../../_components/hud";
import { LocateButton, SelectableCard } from "../../_components/selectable-card";
import { CARD_LINK, CARD_LAYER, TAP } from "../../_components/tap";

/** One of the mechanic's bookings: a pending reservation or a confirmed booking. */
export function BookingListItem({ booking }: { booking: MyBookingSummary }) {
  const href = `/mechanic/bookings/${booking.id}`;
  const title = `${booking.vehicleLabel} · ${booking.categoryName}`;
  const pending = booking.status === "pending_payment";
  const closed = booking.status === "cancelled";
  // Once invoiced, the invoice (with approved change orders) is the one figure to show.
  const invoiced = booking.invoiceTotals;
  return (
    <SelectableCard id={booking.id} className={closed ? "opacity-85" : undefined}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
            {booking.pendingChangeOrderCount > 0 ? (
              <Badge tone="warning" icon={<FilePen />}>
                {pluralize(booking.pendingChangeOrderCount, "change order")} awaiting customer
              </Badge>
            ) : null}
            {invoiced ? (
              <Badge tone="success" icon={<Receipt />}>
                Invoiced
              </Badge>
            ) : null}
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-fg">
            <Link href={href} className={CARD_LINK}>
              {title}
            </Link>
          </h3>
          <ul aria-label="Booking facts" className="flex flex-wrap gap-2">
            <FactChip icon={<CalendarClock />}>{formatSlotRange(booking.slotStartAt, booking.slotEndAt, booking.timeZone)}</FactChip>
            <FactChip icon={<Wrench />}>{booking.serviceModeLabel}</FactChip>
            <FactChip icon={<MapPin />}>{booking.areaLabel}</FactChip>
          </ul>
          <p className="text-sm text-fg-muted">{booking.paymentNotice}</p>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-4 rounded-xl border border-line bg-surface-2/50 px-4 py-3 sm:min-w-44 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0 sm:text-right">
          <div>
            <HudLabel tone="muted">{invoiced ? "Invoice total" : pending ? "Reserved total" : "Job total"}</HudLabel>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-fg tabular-nums">
              <Money cents={invoiced?.totalCents ?? booking.totalCents} />
            </p>
          </div>
          <p className="text-right text-xs text-fg-subtle">
            Your payout{" "}
            <Money cents={invoiced?.mechanicPayoutCents ?? booking.mechanicPayoutCents} className="font-mono text-fg-muted" />
            <span className="block font-medium text-fg-muted">{booking.payout.label}</span>
          </p>
        </div>
      </div>
      <div className={`${CARD_LAYER} flex items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-3 sm:justify-end sm:px-5`}>
        <LocateButton id={booking.id} label={title} />
        <ButtonLink
          href={href}
          variant="secondary"
          trailingIcon={<ArrowRight />}
          aria-label={`Open booking: ${title}`}
          className={`flex-1 sm:flex-none ${TAP}`}
        >
          Open booking
        </ButtonLink>
      </div>
    </SelectableCard>
  );
}
