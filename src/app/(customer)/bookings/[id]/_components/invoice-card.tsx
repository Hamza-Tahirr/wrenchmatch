import { CreditCard, Receipt } from "lucide-react";

import { InView } from "@/components/motion/in-view";
import { Money } from "@/components/ui/money";
import { formatCents, formatDateTime, pluralize } from "@/lib/format";
import type { InvoiceView } from "@/server/customer/booking-views";

import { CountingMoney } from "../../../_components/price-breakdown";
import { formatBps, LINE_KIND_LABELS } from "../../../_lib/display";

/** The final invoice of a booking, revealed like a printed receipt as it scrolls into view. */
export function InvoiceCard({ invoice, timeZone }: { invoice: InvoiceView; timeZone: string }) {
  const subtotals = [
    { label: "Labor", cents: invoice.laborCents },
    { label: "Parts", cents: invoice.partsCents },
    { label: "Taxes", cents: invoice.taxCents },
    { label: "Fees", cents: invoice.feeCents },
  ];

  return (
    <InView as="section" variant="scale" id="invoice" aria-labelledby="invoice-title" className="scroll-mt-24">
      <div className="glass-lite relative overflow-hidden rounded-3xl">
        {/* Receipt edge and a scan line, purely decorative. */}
        <div
          aria-hidden="true"
          className="h-2 bg-[radial-gradient(circle_at_6px_0,transparent_5px,var(--color-surface-2)_5.5px)] bg-[length:12px_8px] bg-repeat-x"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-neon-cyan/10 to-transparent" />
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">Final invoice</p>
            <h2 id="invoice-title" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
              <Receipt aria-hidden="true" className="size-5 text-neon-cyan" />
              Invoice <span className="font-mono tabular">{invoice.invoiceNumber}</span>
            </h2>
            <p className="text-sm text-fg-muted">Issued {formatDateTime(invoice.issuedAt, timeZone)}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-warning-400/50 bg-warning-500/10 px-3 py-1 text-xs font-semibold text-warning-800">
            <CreditCard aria-hidden="true" className="size-3.5" />
            Online payment: coming soon
          </span>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/60">
            <table className="w-full text-sm">
              <caption className="sr-only">Invoice {invoice.invoiceNumber} line items</caption>
              <thead className="text-left font-mono text-xs font-medium tracking-[0.16em] text-brand-700 uppercase">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Item
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="stagger-children divide-y divide-line">
                {invoice.lineItems.map((line, index) => (
                  <tr key={`${line.description}-${index}`}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <span className="block text-fg">{line.description}</span>
                      <span className="mt-0.5 block text-xs text-fg-subtle">
                        {line.kind ? (LINE_KIND_LABELS[line.kind] ?? line.kind) : "Item"}
                        {line.quantity !== null && line.unitPriceCents !== null && line.quantity > 1
                          ? ` · ${line.quantity} × ${formatCents(line.unitPriceCents, invoice.currency)}`
                          : null}
                      </span>
                    </th>
                    <td className="px-4 py-2.5 text-right align-top font-mono text-fg tabular">
                      <Money cents={line.amountCents} currency={invoice.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line-strong">
                {subtotals.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="px-4 pt-2 text-left font-normal text-fg-subtle">
                      {row.label}
                    </th>
                    <td className="px-4 pt-2 text-right font-mono text-fg-muted tabular">
                      <Money cents={row.cents} currency={invoice.currency} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-linear-to-r from-neon-cyan/[0.07] via-transparent to-neon-violet/[0.07]">
                  <th scope="row" className="px-4 pt-3 pb-3 text-left font-display text-base font-semibold text-fg">
                    Total
                  </th>
                  <td className="px-4 pt-3 pb-3 text-right font-mono text-xl font-semibold text-fg tabular text-glow">
                    <CountingMoney cents={invoice.totalCents} currency={invoice.currency} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>
              Includes the provisional platform fee of{" "}
              <span className="font-mono tabular">{formatCents(invoice.platformFeeCents, invoice.currency)}</span> (
              {formatBps(invoice.platformFeeBps)} of labor), deducted from the mechanic&rsquo;s payout.
            </li>
            {invoice.approvedChangeOrderCount > 0 ? (
              <li>Includes {pluralize(invoice.approvedChangeOrderCount, "approved change order")}.</li>
            ) : null}
            {invoice.notes ? <li className="whitespace-pre-line">Mechanic&rsquo;s notes: {invoice.notes}</li> : null}
          </ul>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-400/40 bg-warning-500/[0.08] p-3 text-sm text-warning-900">
            <CreditCard aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Online payment: coming soon. Nothing has been charged online for this invoice.
          </p>
        </div>
      </div>
    </InView>
  );
}
