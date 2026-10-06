import { Receipt } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/ui/money";
import type { AdminQuoteDetail } from "@/server/admin/quote-items";

import { QuoteStatusBadge } from "../../../_components/badges";
import { ConsoleEmpty, Panel } from "../../../_components/console";
import { LineItemsTable, TotalsList } from "../../../_components/money";
import { Timestamp } from "../../../_components/timestamp";
import { durationLabel, quoteModeLabel, slotLabel } from "../../../_lib/display";
import { TAP_TARGET } from "../../../_lib/ui";

function QuoteItem({ quote }: { quote: AdminQuoteDetail }) {
  return (
    <li className="space-y-4 rounded-2xl border border-line bg-fg/[0.02] p-4 transition-colors hover:border-line-strong sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-base font-semibold text-fg">
            <Link
              href={`/admin/mechanics/${quote.mechanic.id}`}
              className={`inline-flex items-center text-fg underline-offset-4 transition-colors hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
            >
              {quote.mechanic.displayName}
            </Link>
            <QuoteStatusBadge status={quote.status} />
          </p>
          <p className="text-sm text-fg-muted">
            {quoteModeLabel(quote.serviceMode)} · {slotLabel(quote.slotStartAt, quote.slotEndAt, quote.timeZone)} · about{" "}
            {durationLabel(quote.estimatedDurationMinutes)}
          </p>
          <p className="text-xs text-fg-subtle">
            Sent <Timestamp iso={quote.createdAt} timeZone={quote.timeZone} />
            {quote.withdrawnAt ? (
              <>
                {" "}
                · withdrawn <Timestamp iso={quote.withdrawnAt} timeZone={quote.timeZone} />
              </>
            ) : (
              <>
                {" "}
                · {quote.status === "submitted" ? "expires" : "expiry"} <Timestamp iso={quote.expiresAt} timeZone={quote.timeZone} />
              </>
            )}
          </p>
        </div>
        <p className="shrink-0 font-mono text-2xl font-semibold text-neon-cyan text-glow tabular">
          <Money cents={quote.totalCents} currency={quote.currency} />
        </p>
      </div>

      <LineItemsTable
        caption={`Line items of ${quote.mechanic.displayName}'s quote`}
        currency={quote.currency}
        items={quote.items.map((item) => ({ key: item.id, ...item }))}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Scope</dt>
            <dd className="mt-1 whitespace-pre-line text-fg-muted">{quote.scope}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Parts</dt>
            <dd className="mt-1 text-fg-muted">{quote.partsIncluded ? "Included in the quote" : "Not included"}</dd>
          </div>
          {quote.exclusions ? (
            <div>
              <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Exclusions</dt>
              <dd className="mt-1 whitespace-pre-line text-fg-muted">{quote.exclusions}</dd>
            </div>
          ) : null}
          {quote.notes ? (
            <div>
              <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Notes</dt>
              <dd className="mt-1 whitespace-pre-line text-fg-muted">{quote.notes}</dd>
            </div>
          ) : null}
        </dl>
        <TotalsList
          currency={quote.currency}
          rows={[
            { label: "Labor", cents: quote.laborCents },
            { label: "Parts", cents: quote.partsCents },
            { label: "Tax", cents: quote.taxCents },
            { label: "Fees", cents: quote.feeCents },
            { label: "Total", cents: quote.totalCents, emphasis: true },
          ]}
        />
      </div>
    </li>
  );
}

/** Every quote on the request with its immutable terms and server-computed totals. */
export function QuotesSection({ quotes }: { quotes: readonly AdminQuoteDetail[] }) {
  return (
    <Panel
      title={`Quotes (${quotes.length})`}
      icon={<Receipt />}
      tone="violet"
      description="Terms are immutable once sent; totals were computed on the server from the line items."
    >
      {quotes.length > 0 ? (
        <ul className="stagger-children space-y-4">
          {quotes.map((quote) => (
            <QuoteItem key={quote.id} quote={quote} />
          ))}
        </ul>
      ) : (
        <ConsoleEmpty bare headingLevel={3} illustration="no-quotes" title="No quotes yet">
          Notified mechanics can send quotes from their job board until the request expires.
        </ConsoleEmpty>
      )}
    </Panel>
  );
}
