import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

import { LINE_KIND_LABELS } from "../_lib/display";

export type LineItem = {
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type LineTotals = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
};

export type ExtraRow = {
  label: string;
  cents: number;
  /** Shown as "−$12.00" (e.g. the platform fee deducted from a payout). */
  deducted?: boolean;
  emphasis?: boolean;
  hint?: string;
};

type LineItemsProps = {
  /** Names the table for screen readers, e.g. "Quote line items". */
  caption: string;
  lines: readonly LineItem[];
  totals: LineTotals;
  /** Rows after the total, e.g. the platform fee and the mechanic payout. */
  extraRows?: readonly ExtraRow[];
  className?: string;
};

/** "Part · 2 × $45.00"; the kind is left out when the description already says it ("Labor"). */
function lineDetails(line: LineItem): string {
  const kind = LINE_KIND_LABELS[line.kind] ?? line.kind;
  const parts = [
    kind.toLowerCase() === line.description.trim().toLowerCase() ? null : kind,
    line.quantity > 1 ? `${line.quantity} × ${formatCents(line.unitPriceCents)}` : null,
  ];
  return parts.filter((part): part is string => part !== null).join(" · ");
}

/**
 * Itemized lines with their subtotals and total, exactly as the server computed them
 * (src/server/pricing.ts). Two columns, so it reads well on phones.
 */
export function LineItems({ caption, lines, totals, extraRows = [], className }: LineItemsProps) {
  const subtotals = [
    { label: "Labor", cents: totals.laborCents, always: true },
    { label: "Parts", cents: totals.partsCents, always: true },
    { label: "Taxes", cents: totals.taxCents, always: false },
    { label: "Fees", cents: totals.feeCents, always: false },
  ].filter((row) => row.always || row.cents > 0);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface-2/40", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-surface-2/70 text-left font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
          <tr>
            <th scope="col" className="px-4 py-2.5">
              Item
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((line, index) => (
            <tr key={`${line.kind}-${index}`} className="transition-colors hover:bg-fg/[0.03]">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className="block font-medium text-fg">{line.description}</span>
                {lineDetails(line) ? <span className="mt-0.5 block text-xs text-fg-subtle">{lineDetails(line)}</span> : null}
              </th>
              <td className="px-4 py-3 text-right align-top font-mono font-medium text-fg tabular">
                <Money cents={line.amountCents} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line-strong bg-surface-2/60">
          {subtotals.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="px-4 pt-2 text-left font-normal text-fg-muted">
                {row.label}
              </th>
              <td className="px-4 pt-2 text-right font-mono text-fg-muted tabular">
                <Money cents={row.cents} />
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="px-4 pt-3 pb-3 text-left font-display text-base font-semibold text-fg">
              Total
            </th>
            <td className="px-4 pt-3 pb-3 text-right font-mono text-lg font-semibold text-fg tabular">
              <Money cents={totals.totalCents} />
            </td>
          </tr>
          {extraRows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <th scope="row" className={cn("px-4 py-2.5 text-left", row.emphasis ? "font-semibold text-fg" : "font-normal text-fg-muted")}>
                {row.label}
                {row.hint ? <span className="block text-xs font-normal text-fg-subtle">{row.hint}</span> : null}
              </th>
              <td
                className={cn(
                  "px-4 py-2.5 text-right align-top font-mono tabular",
                  row.emphasis ? "text-base font-semibold text-success-700" : "text-fg-muted",
                )}
              >
                {row.deducted ? <span aria-hidden="true">−</span> : null}
                {row.deducted ? <span className="sr-only">minus </span> : null}
                <Money cents={row.cents} />
              </td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
