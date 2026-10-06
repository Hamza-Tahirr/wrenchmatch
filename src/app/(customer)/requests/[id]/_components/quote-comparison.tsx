import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatCents, pluralize } from "@/lib/format";
import type { QuoteComparisonItem } from "@/server/customer/quotes";

import { ExpiryCountdown } from "../../../_components/expiry-countdown";
import { MechanicFacts, MechanicIdentity, RecentReviews } from "../../../_components/mechanic-profile";
import { CountingMoney, LineList, PartsBadge } from "../../../_components/price-breakdown";
import { formatBps, formatDuration, formatSlotRange } from "../../../_lib/display";
import { QuoteAction, QuoteBadges, type QuoteHighlights } from "./quote-parts";

// The tablet and desktop comparison: one column per quote, one row per detail, so prices,
// slots and terms line up side by side. Phones get one QuoteCard per quote instead.

function inactive(quote: QuoteComparisonItem): boolean {
  return !quote.isSelectable && quote.status !== "selected";
}

function Row({
  label,
  quotes,
  cell,
  emphasis = false,
}: {
  label: string;
  quotes: readonly QuoteComparisonItem[];
  cell: (quote: QuoteComparisonItem) => ReactNode;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 w-36 border-r border-line bg-surface px-4 py-3 text-left align-top font-mono text-xs font-medium tracking-[0.16em] text-brand-700 uppercase",
          emphasis && "py-4",
        )}
      >
        {label}
      </th>
      {quotes.map((quote) => (
        <td
          key={quote.id}
          className={cn(
            "px-4 py-3 align-top text-sm break-words text-fg-muted",
            emphasis && "py-4",
            inactive(quote) && "bg-surface-2/40 text-fg-subtle",
          )}
        >
          <div className={cn(inactive(quote) && "opacity-75")}>{cell(quote)}</div>
        </td>
      ))}
    </tr>
  );
}

export function QuoteComparisonTable({
  quotes,
  highlights,
  bookingId,
  now,
}: {
  quotes: readonly QuoteComparisonItem[];
  highlights: QuoteHighlights;
  bookingId: string | null;
  now: string;
}) {
  const captionId = "quote-comparison-caption";
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="glass-lite overflow-x-auto rounded-3xl"
    >
      {/* Fixed layout: a label column and equal quote columns; when they don't fit, the region scrolls sideways. */}
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${9 + quotes.length * 15}rem` }}>
        <caption id={captionId} className="sr-only">
          Side-by-side comparison of {pluralize(quotes.length, "quote")}. Each column is one quote.
        </caption>
        <thead>
          <tr className="border-b border-line">
            <td className="sticky left-0 z-10 w-36 border-r border-line bg-surface" />
            {quotes.map((quote) => (
              <th
                key={quote.id}
                scope="col"
                className={cn(
                  "px-4 py-4 text-left align-top font-normal",
                  quote.status === "selected" && "bg-success-50/60",
                  inactive(quote) && "bg-surface-2/40",
                )}
              >
                <div className="space-y-2.5">
                  <div className={cn(inactive(quote) && "opacity-75 grayscale-[40%]")}>
                    <MechanicIdentity mechanic={quote.mechanic} />
                  </div>
                  <QuoteBadges quote={quote} highlights={highlights} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <Row
            label="Total"
            emphasis
            quotes={quotes}
            cell={(quote) => (
              <>
                <p className="font-mono text-2xl font-semibold tracking-tight text-fg tabular text-glow">
                  <CountingMoney cents={quote.totals.totalCents} currency={quote.currency} />
                </p>
                <p className="text-xs text-fg-subtle">Taxes and fees included</p>
              </>
            )}
          />
          <Row
            label="Time slot"
            quotes={quotes}
            cell={(quote) => (
              <span className="font-medium text-fg">{formatSlotRange(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}</span>
            )}
          />
          <Row label="Duration" quotes={quotes} cell={(quote) => `About ${formatDuration(quote.estimatedDurationMinutes)}`} />
          <Row
            label="Where"
            quotes={quotes}
            cell={(quote) => (
              <>
                {quote.serviceModeLabel}
                {quote.mechanic.distanceLabel ? (
                  <span className="block text-xs text-fg-subtle">Mechanic based {quote.mechanic.distanceLabel} away</span>
                ) : null}
              </>
            )}
          />
          <Row
            label="Labor"
            quotes={quotes}
            cell={(quote) => <LineList lines={quote.lineItems.labor} currency={quote.currency} empty="No labor lines" />}
          />
          <Row
            label="Parts"
            quotes={quotes}
            cell={(quote) => (
              <div className="space-y-2">
                <PartsBadge included={quote.partsIncluded} />
                <LineList
                  lines={quote.lineItems.parts}
                  currency={quote.currency}
                  empty={quote.partsIncluded ? "No separate part lines" : "Parts are bought separately"}
                />
              </div>
            )}
          />
          <Row
            label="Taxes"
            quotes={quotes}
            cell={(quote) => <LineList lines={quote.lineItems.taxes} currency={quote.currency} empty="None" />}
          />
          <Row
            label="Fees"
            quotes={quotes}
            cell={(quote) => <LineList lines={quote.lineItems.fees} currency={quote.currency} empty="None" />}
          />
          <Row
            label="Platform fee"
            quotes={quotes}
            cell={(quote) => (
              <p className="text-xs text-pretty text-fg-subtle">
                {formatCents(quote.platformFee.cents, quote.currency)} ({formatBps(quote.platformFee.bps)} of labor, provisional)
                is included in the total and deducted from the mechanic&rsquo;s payout.
              </p>
            )}
          />
          <Row label="What's included" quotes={quotes} cell={(quote) => <p className="whitespace-pre-line">{quote.scope}</p>} />
          <Row
            label="Not included"
            quotes={quotes}
            cell={(quote) => <p className="whitespace-pre-line">{quote.exclusions ?? "Nothing listed"}</p>}
          />
          <Row
            label="Notes"
            quotes={quotes}
            cell={(quote) => <p className="whitespace-pre-line">{quote.notes ?? "None"}</p>}
          />
          <Row
            label="Valid until"
            quotes={quotes}
            cell={(quote) =>
              quote.status === "submitted" || quote.status === "expired" ? (
                <ExpiryCountdown expiresAt={quote.expiresAt} startedAt={quote.quotedAt} now={now} timeZone={quote.timeZone} />
              ) : (
                <span className="text-fg-subtle">{quote.statusLabel}</span>
              )
            }
          />
          <Row label="Mechanic" quotes={quotes} cell={(quote) => <MechanicFacts mechanic={quote.mechanic} />} />
          <Row
            label="Reviews"
            quotes={quotes}
            cell={(quote) =>
              quote.mechanic.recentReviews.length > 0 ? (
                <RecentReviews mechanic={quote.mechanic} />
              ) : (
                <span className="text-fg-subtle">No reviews yet</span>
              )
            }
          />
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 w-36 border-r border-line bg-surface px-4 py-4 text-left align-top"
            >
              <span className="sr-only">Choose</span>
            </th>
            {quotes.map((quote) => (
              <td key={quote.id} className={cn("px-4 py-4 align-top", inactive(quote) && "bg-surface-2/40")}>
                <QuoteAction quote={quote} bookingId={bookingId} fullWidth />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
