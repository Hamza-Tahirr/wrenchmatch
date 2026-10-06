import { ArrowRight, CalendarClock, Clock, MapPin, Wrench } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { formatDateTime } from "@/lib/format";
import type { MyBookingSummary } from "@/server/mechanic/bookings";
import type { MyQuoteSummary } from "@/server/mechanic/jobs";

import { formatDuration, formatSlotRange } from "../../_lib/display";
import { FactChip, HudLabel } from "../../_components/hud";
import { LocateButton, SelectableCard } from "../../_components/selectable-card";
import { CARD_LAYER, CARD_LINK, TAP } from "../../_components/tap";
import { ToastConfirmDialog } from "../../_components/toast-actions";
import { withdrawQuoteAction } from "../actions";

type LinkedBooking = Pick<MyBookingSummary, "status" | "statusLabel">;

function selectedLine(booking: LinkedBooking | null): string {
  if (!booking || booking.status === "pending_payment") {
    return "The customer reserved this quote - awaiting their payment (online payments are coming soon).";
  }
  if (booking.status === "cancelled") return "The customer selected this quote, but the reservation was cancelled.";
  return `Booked with you: ${booking.statusLabel.toLowerCase()}.`;
}

function statusLine(quote: MyQuoteSummary, booking: LinkedBooking | null): string {
  switch (quote.status) {
    case "submitted":
      return `Valid until ${formatDateTime(quote.expiresAt, quote.timeZone)}. Your offered time is held until then.`;
    case "selected":
      return selectedLine(booking);
    case "withdrawn":
      return quote.withdrawnAt ? `You withdrew it on ${formatDateTime(quote.withdrawnAt, quote.timeZone)}.` : "You withdrew it.";
    case "expired":
      return "Expired before the customer chose a quote. Its time slot is free again.";
    case "declined":
      // A cancelled reservation also declines its quote (and keeps the booking link).
      return quote.bookingId
        ? "The customer reserved this quote, then cancelled the reservation."
        : "The customer chose another quote or cancelled the request.";
  }
}

/** One of the mechanic's quotes, with withdraw while it is still open. */
export function QuoteListItem({ quote, booking }: { quote: MyQuoteSummary; booking: LinkedBooking | null }) {
  const href = quote.bookingId ? `/mechanic/bookings/${quote.bookingId}` : `/mechanic/jobs/${quote.requestId}`;
  const title = `${quote.vehicleLabel} · ${quote.categoryName}`;
  const active = quote.status === "submitted" || quote.status === "selected";
  return (
    <SelectableCard id={quote.id} className={active ? undefined : "opacity-85"}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={quote.statusTone}>{quote.statusLabel}</Badge>
            <HudLabel tone="muted">{quote.categoryName}</HudLabel>
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-fg">
            <Link href={href} className={CARD_LINK}>
              {title}
            </Link>
          </h3>
          <ul aria-label="Quote facts" className="flex flex-wrap gap-2">
            <FactChip icon={<CalendarClock />}>{formatSlotRange(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}</FactChip>
            <FactChip icon={<Clock />}>{formatDuration(quote.estimatedDurationMinutes)}</FactChip>
            <FactChip icon={<Wrench />}>{quote.serviceModeLabel}</FactChip>
            <FactChip icon={<MapPin />}>{quote.areaLabel}</FactChip>
          </ul>
          <p className="text-sm text-fg-muted">{statusLine(quote, booking)}</p>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-4 rounded-xl border border-line bg-surface-2/50 px-4 py-3 sm:min-w-40 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0 sm:text-right">
          <div>
            <HudLabel tone="muted">Quote total</HudLabel>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-fg tabular-nums">
              <Money cents={quote.totalCents} />
            </p>
          </div>
          <p className="text-right text-xs text-fg-subtle">{quote.partsIncluded ? "Parts included" : "Labor only"}</p>
        </div>
      </div>
      <div className={`${CARD_LAYER} flex flex-col-reverse gap-2 border-t border-line bg-surface-2/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5`}>
        {quote.canWithdraw ? (
          <ToastConfirmDialog
            trigger={
              <>
                Withdraw<span className="sr-only"> quote: {title}</span>
              </>
            }
            tone="danger"
            triggerVariant="secondary"
            triggerClassName={TAP}
            title="Withdraw this quote?"
            description="The customer can no longer select it, and its time slot is released. You can send a new quote while the request is open."
            confirmLabel="Withdraw quote"
            pendingLabel="Withdrawing…"
            action={withdrawQuoteAction}
            hiddenFields={{ quoteId: quote.id }}
            successToast={{ title: "Quote withdrawn", description: `${title}: its time slot is free again.` }}
          />
        ) : null}
        <div className="flex items-center gap-2 sm:contents">
          <LocateButton id={quote.id} label={title} />
          <ButtonLink
            href={href}
            variant="secondary"
            trailingIcon={<ArrowRight />}
            aria-label={`${quote.bookingId ? "View booking" : "View job"}: ${title}`}
            className={`flex-1 sm:flex-none ${TAP}`}
          >
            {quote.bookingId ? "View booking" : "View job"}
          </ButtonLink>
        </div>
      </div>
    </SelectableCard>
  );
}
