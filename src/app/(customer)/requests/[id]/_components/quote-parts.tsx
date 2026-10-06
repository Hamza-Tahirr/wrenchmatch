import { ArrowRight, CalendarCheck, Clock3, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import type { QuoteComparisonItem } from "@/server/customer/quotes";

// Pieces shared by the quote cards and the side-by-side comparison table.

export type QuoteHighlights = { lowestPriceId: string | null; earliestSlotId: string | null };

/** Which selectable quotes are the cheapest and the earliest (only worth saying with 2+ to compare). */
export function quoteHighlights(quotes: readonly QuoteComparisonItem[]): QuoteHighlights {
  const selectable = quotes.filter((quote) => quote.isSelectable);
  if (selectable.length < 2) return { lowestPriceId: null, earliestSlotId: null };
  const lowest = selectable.reduce((best, quote) => (quote.totals.totalCents < best.totals.totalCents ? quote : best));
  const earliest = selectable.reduce((best, quote) => (quote.slotStartAt < best.slotStartAt ? quote : best));
  return { lowestPriceId: lowest.id, earliestSlotId: earliest.id };
}

/** Status (when it isn't the normal "submitted") and the comparison highlights. */
export function QuoteBadges({ quote, highlights }: { quote: QuoteComparisonItem; highlights: QuoteHighlights }) {
  const showStatus = quote.status !== "submitted";
  const lowest = highlights.lowestPriceId === quote.id;
  const earliest = highlights.earliestSlotId === quote.id;
  if (!showStatus && !lowest && !earliest) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showStatus ? <Badge tone={quote.statusTone}>{quote.statusLabel}</Badge> : null}
      {lowest ? (
        <Badge tone="success" icon={<TrendingDown />}>
          Lowest price
        </Badge>
      ) : null}
      {earliest ? (
        <Badge tone="info" icon={<Clock3 />}>
          Earliest slot
        </Badge>
      ) : null}
    </div>
  );
}

/** "Reserve" (opens the review-and-reserve page), "View reservation" for the reserved one, or why it can't be chosen. */
export function QuoteAction({
  quote,
  bookingId,
  fullWidth = false,
}: {
  quote: QuoteComparisonItem;
  bookingId: string | null;
  fullWidth?: boolean;
}) {
  if (quote.isSelectable) {
    return (
      <ButtonLink
        href={`/requests/${quote.requestId}/select/${quote.id}`}
        trailingIcon={<ArrowRight />}
        fullWidth={fullWidth}
        size="lg"
        aria-label={`Select ${quote.mechanic.displayName}'s quote to reserve`}
      >
        Reserve
      </ButtonLink>
    );
  }
  if (quote.status === "selected" && bookingId) {
    return (
      <ButtonLink
        href={`/bookings/${bookingId}`}
        variant="secondary"
        leadingIcon={<CalendarCheck />}
        fullWidth={fullWidth}
        aria-label={`View your reservation with ${quote.mechanic.displayName}`}
      >
        View reservation
      </ButtonLink>
    );
  }
  return <p className="text-sm text-pretty text-fg-subtle">{quote.unavailableReason ?? "This quote can't be selected."}</p>;
}
