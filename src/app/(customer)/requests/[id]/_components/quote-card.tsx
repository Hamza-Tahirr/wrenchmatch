import { CalendarClock, ChevronDown, Clock, Truck, Warehouse } from "lucide-react";
import { Suspense } from "react";

import { MechanicGalleryStrip } from "@/components/media/mechanic-gallery-strip";
import { DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import type { QuoteComparisonItem } from "@/server/customer/quotes";

import { ExpiryCountdown } from "../../../_components/expiry-countdown";
import { Fact, FactList } from "../../../_components/facts";
import { MechanicFacts, MechanicIdentity, RecentReviews } from "../../../_components/mechanic-profile";
import { CountingMoney, PriceBreakdown } from "../../../_components/price-breakdown";
import { formatDuration, formatSlotRange } from "../../../_lib/display";
import { QuoteAction, QuoteBadges, type QuoteHighlights } from "./quote-parts";

export function quoteTerms(quote: QuoteComparisonItem) {
  return [
    { term: "What's included", description: <p className="whitespace-pre-line">{quote.scope}</p> },
    ...(quote.exclusions
      ? [{ term: "Not included", description: <p className="whitespace-pre-line">{quote.exclusions}</p> }]
      : []),
    ...(quote.notes ? [{ term: "Notes", description: <p className="whitespace-pre-line">{quote.notes}</p> }] : []),
  ];
}

/**
 * One quote: mechanic, total, slot, itemized price, terms and the mechanic's public profile.
 * Rendered inside QuoteFocusCard (the glass frame that also drives the map). A quote that can
 * be reserved ends with a bar (mechanic, total, Reserve) that sticks to the bottom of the
 * screen while the card is scrolled, so the action is always one tap away on a phone.
 */
export function QuoteCard({
  quote,
  highlights,
  bookingId,
  now,
}: {
  quote: QuoteComparisonItem;
  highlights: QuoteHighlights;
  bookingId: string | null;
  /** The server's "now" (UTC ISO) for the countdown's first render. */
  now: string;
}) {
  const inactive = !quote.isSelectable && quote.status !== "selected";
  const titleId = `quote-${quote.id}-title`;
  return (
    <>
      <h3 id={titleId} className="sr-only">
        Quote from {quote.mechanic.displayName}
      </h3>
      <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className={cn(inactive && "opacity-70 grayscale-[35%]")}>
          <MechanicIdentity mechanic={quote.mechanic} />
        </div>
        <QuoteBadges quote={quote} highlights={highlights} />
      </div>

      <div className={cn("space-y-5 px-5 py-5 sm:px-6", inactive && "opacity-75")}>
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-linear-to-br from-surface-2/80 via-surface-2/40 to-neon-violet/[0.06] p-4">
          <div>
            <p className="font-mono text-xs font-medium tracking-[0.18em] text-fg-subtle uppercase">Total</p>
            <p className="font-mono text-3xl font-semibold tracking-tight text-fg tabular text-glow sm:text-4xl">
              <CountingMoney cents={quote.totals.totalCents} currency={quote.currency} />
            </p>
            <p className="text-xs text-fg-subtle">Labor, parts, taxes and fees included</p>
          </div>
          {quote.status === "submitted" || quote.status === "expired" ? (
            <ExpiryCountdown expiresAt={quote.expiresAt} startedAt={quote.quotedAt} now={now} timeZone={quote.timeZone} />
          ) : null}
        </div>

        <FactList label="Time and place" className="flex-col items-start gap-y-2.5">
          <Fact icon={<CalendarClock />}>
            <span className="font-medium text-fg">{formatSlotRange(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}</span>
          </Fact>
          <Fact icon={<Clock />}>About {formatDuration(quote.estimatedDurationMinutes)} of work</Fact>
          <Fact icon={quote.serviceMode === "mobile" ? <Truck /> : <Warehouse />}>
            {quote.serviceModeLabel}
            {quote.serviceMode === "garage" ? " (the exact address is shared once a booking is confirmed)" : null}
          </Fact>
        </FactList>

        <Suspense fallback={null}>
          <MechanicGalleryStrip mechanicId={quote.mechanic.id} />
        </Suspense>

        <div className="grid gap-5 xl:grid-cols-2">
          <PriceBreakdown
            caption={`Price breakdown of ${quote.mechanic.displayName}'s quote`}
            lines={quote.lineItems}
            totals={quote.totals}
            currency={quote.currency}
            partsIncluded={quote.partsIncluded}
            platformFee={quote.platformFee}
          />
          <div className="space-y-4">
            <DescriptionList items={quoteTerms(quote)} />
            <details className="group rounded-2xl border border-line bg-surface-2/50">
              <summary className="flex min-h-11 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-fg/5">
                About {quote.mechanic.displayName}
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-3">
                <MechanicFacts mechanic={quote.mechanic} />
              </div>
            </details>
            <RecentReviews mechanic={quote.mechanic} />
          </div>
        </div>
      </div>

      {quote.isSelectable ? (
        <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-b-3xl border-t border-line bg-elevated/90 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-fg-muted">{quote.mechanic.displayName}</p>
            <p className="font-mono text-lg font-semibold text-fg tabular">
              <Money cents={quote.totals.totalCents} currency={quote.currency} />
              <span className="sr-only"> total</span>
            </p>
          </div>
          <div className="w-36 shrink-0 sm:w-48">
            <QuoteAction quote={quote} bookingId={bookingId} fullWidth />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <QuoteAction quote={quote} bookingId={bookingId} fullWidth />
        </div>
      )}
    </>
  );
}
