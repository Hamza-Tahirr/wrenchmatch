import { CalendarClock, Hourglass, Lock, Receipt, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";

import { NoQuotes } from "@/components/illustrations";
import { approximateArea, type MapCircle, type MapLine, type MapPoint, type MapTone } from "@/components/map/geo";
import { MapLegend } from "@/components/map/map-legend";
import { Stagger } from "@/components/motion/stagger";
import { cn } from "@/lib/cn";
import { formatCents, pluralize } from "@/lib/format";
import type { QuoteComparisonItem } from "@/server/customer/quotes";
import type { RequestDetail } from "@/server/customer/request-views";

import { CountUp } from "../../../_components/count-up";
import { InlineNote } from "../../../_components/facts";
import { CountingMoney } from "../../../_components/price-breakdown";
import { formatSlotStart } from "../../../_lib/display";
import { QuoteCard } from "./quote-card";
import { QuoteComparisonTable } from "./quote-comparison";
import { QuoteFocusCard, QuoteMapProvider, QuotesMap } from "./quote-map";
import { quoteHighlights } from "./quote-parts";
import { QuoteViews } from "./quote-views";
import styles from "./request.module.css";

const REQUEST_POINT_ID = "request-area";

function mechanicPointId(quote: QuoteComparisonItem): string {
  return `mechanic-${quote.mechanic.id}`;
}

function toneFor(quote: QuoteComparisonItem): MapTone {
  if (quote.status === "selected") return "success";
  return quote.isSelectable ? "violet" : "neutral";
}

/**
 * Map data: the request's approximate area (its ZIP centroid) and each quoting mechanic's
 * base-ZIP centroid, never an address. One marker per mechanic, joined to the request area
 * when their quote can still be chosen.
 */
function mapData(request: RequestDetail): { points: MapPoint[]; circles: MapCircle[]; lines: MapLine[] } {
  const points: MapPoint[] = [
    {
      id: REQUEST_POINT_ID,
      lat: request.approxLocation.lat,
      lng: request.approxLocation.lng,
      label: "Your request",
      description: `${request.areaLabel} · approximate area`,
      kind: "home",
      tone: "cyan",
      pulse: true,
    },
  ];
  const circles: MapCircle[] = [approximateArea(request.approxLocation, { id: "request-ring", label: "Your approximate area" })];
  const lines: MapLine[] = [];
  const seen = new Set<string>();
  for (const quote of request.quotes) {
    const id = mechanicPointId(quote);
    if (seen.has(id)) continue;
    seen.add(id);
    const { mechanic } = quote;
    points.push({
      id,
      lat: mechanic.approxLocation.lat,
      lng: mechanic.approxLocation.lng,
      label: mechanic.displayName,
      description: [mechanic.areaLabel, mechanic.distanceLabel ? `${mechanic.distanceLabel} away` : null, formatCents(quote.totals.totalCents, quote.currency)]
        .filter(Boolean)
        .join(" · "),
      tone: toneFor(quote),
      ...(quote.isSelectable
        ? { href: `/requests/${request.id}/select/${quote.id}`, hrefLabel: "Review and reserve" }
        : {}),
    });
    if (quote.isSelectable || quote.status === "selected") {
      lines.push({
        id: `line-${id}`,
        from: mechanic.approxLocation,
        to: request.approxLocation,
        tone: toneFor(quote),
        label: mechanic.distanceLabel ? `${mechanic.displayName}: ${mechanic.distanceLabel} (approximate)` : undefined,
      });
    }
  }
  return { points, circles, lines };
}

function SummaryChip({
  icon,
  label,
  className,
  children,
}: {
  icon: ReactNode;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("glass-lite flex min-w-0 items-center gap-3 rounded-2xl px-3.5 py-3 sm:px-4", className)}>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25 [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p className="truncate font-mono text-lg font-semibold text-fg tabular">{children}</p>
      </div>
    </div>
  );
}

function Listening({ request }: { request: RequestDetail }) {
  if (request.awaitingAdminFollowUp) {
    return (
      <div className="glass-lite flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
        <NoQuotes decorative className="w-40 sm:w-48" />
        <h3 className="font-display text-lg font-semibold text-fg">No quotes yet</h3>
        <p className="max-w-md text-sm text-pretty text-fg-muted">
          Nobody was matched yet. If our team finds a mechanic who can help, their quote appears here and we&rsquo;ll
          notify you.
        </p>
      </div>
    );
  }
  if (request.status === "open") {
    return (
      <div className="glass-lite aurora relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl px-6 py-10 text-center">
        <div aria-hidden="true" className="relative grid size-36 place-items-center">
          <span className={styles.ring} />
          <span className={styles.ring} />
          <span className={styles.ring} />
          <NoQuotes decorative className="relative w-32" />
        </div>
        <h3 className="font-display text-lg font-semibold text-fg">
          {pluralize(request.matchedCount, "mechanic")} notified · quotes usually arrive within a day
        </h3>
        <p className="max-w-md text-sm text-pretty text-fg-muted">
          {request.interestedCount > 0
            ? `${pluralize(request.interestedCount, "mechanic")} pressed "Interested" and may be preparing a quote. We'll notify you as soon as one arrives.`
            : "We'll notify you as soon as one arrives. You can leave this page; the request keeps working."}
        </p>
      </div>
    );
  }
  return (
    <div className="glass-lite flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
      <NoQuotes decorative className="w-40" />
      <h3 className="font-display text-lg font-semibold text-fg">No quotes were received</h3>
      <p className="max-w-md text-sm text-pretty text-fg-muted">This request closed before any mechanic sent a quote.</p>
    </div>
  );
}

/** The quotes: summary, cards beside a live map (or a side-by-side table), honest notes. */
export function QuotesSection({ request, now }: { request: RequestDetail; now: string }) {
  const highlights = quoteHighlights(request.quotes);
  const bookingId = request.booking?.id ?? null;
  const acceptingQuotes = request.status === "open" || request.status === "quoted";
  const { selectableCount, lowestTotalCents, earliestSlotStartAt } = request.quoteSummary;
  const { points, circles, lines } = mapData(request);
  const hasQuotes = request.quotes.length > 0;
  const currency = request.quotes.find((quote) => quote.isSelectable)?.currency ?? "USD";

  const map = (
    <QuotesMap
      label={
        hasQuotes
          ? "Your request's approximate area and the mechanics who quoted (approximate base areas)"
          : "Your request's approximate area"
      }
      points={points}
      circles={circles}
      lines={lines}
    />
  );
  // Below the map rather than over it: a narrow map needs its corners for the attribution.
  const legend = (
    <MapLegend
      className="rounded-2xl border border-line bg-surface/60 px-3 py-2 text-xs text-fg-muted"
      items={[
        { tone: "cyan", label: "Your area", kind: "home" },
        ...(hasQuotes ? [{ tone: "violet" as const, label: "Mechanics who quoted" }] : []),
        ...(request.quotes.some((quote) => quote.status === "selected") ? [{ tone: "success" as const, label: "Reserved" }] : []),
        ...(request.quotes.some((quote) => !quote.isSelectable && quote.status !== "selected")
          ? [{ tone: "neutral" as const, label: "No longer available" }]
          : []),
      ]}
    />
  );

  // Phones and tablets read the quotes first and find the map after them; from 1024px the
  // map sits beside the cards and follows the one being read.
  const cards = (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="min-w-0">
        {hasQuotes ? (
          <Stagger as="div" className="space-y-5">
            {request.quotes.map((quote) => (
              <QuoteFocusCard
                key={quote.id}
                pointId={mechanicPointId(quote)}
                quoteId={quote.id}
                highlight={
                  quote.status === "selected" ? "selected" : highlights.lowestPriceId === quote.id ? "best" : null
                }
              >
                <QuoteCard quote={quote} highlights={highlights} bookingId={bookingId} now={now} />
              </QuoteFocusCard>
            ))}
          </Stagger>
        ) : (
          <Listening request={request} />
        )}
      </div>
      <div className="min-w-0 space-y-3 lg:sticky lg:top-24">
        {map}
        {legend}
        <InlineNote icon={<Lock />}>
          Locations are approximate: ZIP code areas, never street addresses. Mechanic contact details stay hidden
          until a booking is confirmed.
        </InlineNote>
      </div>
    </div>
  );

  return (
    <section id="quotes" aria-labelledby="quotes-title" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">Compare</p>
          <h2 id="quotes-title" className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            <span className="holo-text">Quotes</span>
            {hasQuotes ? <span className="ml-2 font-mono text-lg text-fg-subtle tabular">({request.quotes.length})</span> : null}
          </h2>
        </div>
        {hasQuotes ? (
          <p className="text-sm text-fg-muted">Times are shown in the request&rsquo;s local time.</p>
        ) : null}
      </div>

      {hasQuotes ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SummaryChip icon={<Receipt />} label="Can be reserved">
            <CountUp value={selectableCount} />
          </SummaryChip>
          <SummaryChip icon={<TrendingDown />} label="Lowest total">
            {lowestTotalCents !== null ? <CountingMoney cents={lowestTotalCents} currency={currency} /> : "—"}
          </SummaryChip>
          <SummaryChip icon={<CalendarClock />} label="Earliest slot" className="col-span-2 lg:col-span-1">
            <span className="text-base">{earliestSlotStartAt ? formatSlotStart(earliestSlotStartAt, request.timeZone) : "—"}</span>
          </SummaryChip>
        </div>
      ) : null}

      <QuoteMapProvider>
        <QuoteViews
          cards={cards}
          table={
            request.quotes.length > 1 ? (
              <QuoteComparisonTable quotes={request.quotes} highlights={highlights} bookingId={bookingId} now={now} />
            ) : null
          }
        />
      </QuoteMapProvider>

      {acceptingQuotes && hasQuotes && request.interestedCount > 0 ? (
        <InlineNote icon={<Hourglass />}>
          {pluralize(request.interestedCount, "more mechanic")} pressed &ldquo;Interested&rdquo; and may still send a quote.
        </InlineNote>
      ) : null}
    </section>
  );
}
