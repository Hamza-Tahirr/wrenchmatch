import Link from "next/link";

import { Money } from "@/components/ui/money";
import { QUOTE_STATUS_INFO, QUOTE_STATUSES, type QuoteStatus } from "@/lib/domain";
import type { AdminQuoteListItem } from "@/server/admin/quote-items";
import type { Paged } from "@/server/admin/types";

import { QuoteStatusBadge } from "../../_components/badges";
import { ConsoleEmpty } from "../../_components/console";
import { ConsoleTable, MobileCardBody } from "../../_components/console-table";
import { SegmentedLinks } from "../../_components/segmented-links";
import { Timestamp } from "../../_components/timestamp";
import { AdminPagination } from "../../_components/touch";
import { quoteModeLabel, slotLabel, withQuery } from "../../_lib/display";

export function QuotesTab({ page, status, now }: { page: Paged<AdminQuoteListItem>; status?: QuoteStatus; now: Date }) {
  const href = (overrides: { status?: QuoteStatus | null; page?: number }) =>
    withQuery("/admin/marketplace", {
      tab: "quotes",
      status: overrides.status === null ? undefined : (overrides.status ?? status),
      page: overrides.page,
    });
  return (
    <div className="space-y-4">
      <SegmentedLinks
        label="Quote status"
        current={status ?? "all"}
        links={[
          { key: "all", label: "All quotes", href: href({ status: null }) },
          ...QUOTE_STATUSES.map((value) => ({ key: value, label: QUOTE_STATUS_INFO[value].label, href: href({ status: value }) })),
        ]}
      />
      <ConsoleTable
        caption={`${status ? QUOTE_STATUS_INFO[status].label : "All"} quotes, newest first (status as of now)`}
        captionHidden
        rows={page.items}
        getRowKey={(quote) => quote.id}
        mobileCard={(quote) => (
          <MobileCardBody
            title={
              <Link
                href={`/admin/requests/${quote.requestId}`}
                className="underline-offset-4 after:absolute after:inset-0 after:rounded-2xl hover:text-neon-cyan hover:underline"
              >
                {quote.vehicle} · {quote.categoryName}
              </Link>
            }
            aside={
              <Money cents={quote.totalCents} currency={quote.currency} className="font-mono text-base font-semibold text-neon-cyan tabular" />
            }
            meta={
              <>
                {quote.mechanic.displayName} for {quote.customer.displayName} · {quote.areaLabel}
              </>
            }
            chips={<QuoteStatusBadge status={quote.status} />}
            footer={
              <>
                {slotLabel(quote.slotStartAt, quote.slotEndAt, quote.timeZone)} · {quoteModeLabel(quote.serviceMode)} ·{" "}
                {quote.status === "submitted" ? "expires" : "expiry"}{" "}
                <Timestamp iso={quote.expiresAt} timeZone={quote.timeZone} format="relative" now={now} />
              </>
            }
          />
        )}
        empty={
          <ConsoleEmpty illustration="no-quotes" title="No quotes in this view">
            Quotes appear here when approved mechanics answer matched requests.
          </ConsoleEmpty>
        }
        columns={[
          {
            key: "request",
            header: "Request",
            primary: true,
            className: "min-w-[15rem]",
            cell: (quote) => (
              <span className="flex flex-col gap-1">
                <Link
                  href={`/admin/requests/${quote.requestId}`}
                  className="font-medium text-fg underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                >
                  {quote.vehicle} · {quote.categoryName}
                </Link>
                <span className="text-xs font-normal text-fg-subtle">
                  for {quote.customer.displayName} · {quote.areaLabel}
                </span>
              </span>
            ),
          },
          {
            key: "mechanic",
            header: "Mechanic",
            cell: (quote) => (
              <Link
                href={`/admin/mechanics/${quote.mechanic.id}`}
                className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
              >
                {quote.mechanic.displayName}
              </Link>
            ),
          },
          { key: "status", header: "Status", cell: (quote) => <QuoteStatusBadge status={quote.status} /> },
          {
            key: "total",
            header: "Total",
            align: "right",
            cell: (quote) => (
              <Money cents={quote.totalCents} currency={quote.currency} className="font-mono font-semibold text-neon-cyan tabular" />
            ),
          },
          {
            key: "slot",
            header: "Offered slot",
            cell: (quote) => (
              <span className="flex flex-col">
                <span>{slotLabel(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}</span>
                <span className="text-xs text-fg-subtle">{quoteModeLabel(quote.serviceMode)}</span>
              </span>
            ),
          },
          {
            key: "expires",
            header: "Expires",
            cell: (quote) => (
              <Timestamp iso={quote.expiresAt} timeZone={quote.timeZone} format="relative" now={now} className="whitespace-nowrap" />
            ),
          },
        ]}
      />
      {page.totalPages > 1 ? (
        <AdminPagination
          label="Quote pages"
          page={page.page}
          totalPages={page.totalPages}
          prevHref={page.page > 1 ? href({ page: page.page - 1 }) : null}
          nextHref={page.page < page.totalPages ? href({ page: page.page + 1 }) : null}
        />
      ) : null}
    </div>
  );
}
