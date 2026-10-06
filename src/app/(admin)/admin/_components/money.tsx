import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";

import { ConsoleTable } from "./console-table";

// Money as the server computed it (src/server/pricing.ts): line items and totals in integer
// cents, formatted here and never recomputed. Prices are set in mono tabular figures so the
// columns line up.

const KIND_LABELS: Readonly<Record<string, string>> = { labor: "Labor", part: "Part", tax: "Tax", fee: "Fee" };

export function itemKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export type LineItem = {
  key: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  /** e.g. "Change order" for invoice lines that came from an approved change order. */
  note?: ReactNode;
};

/** Itemized lines (description, kind, quantity, unit price, amount); one compact row per line on phones. */
export function LineItemsTable({ caption, items, currency }: { caption: string; items: readonly LineItem[]; currency: string }) {
  return (
    <ConsoleTable
      caption={caption}
      captionHidden
      bare
      className="rounded-xl border border-line bg-fg/[0.02]"
      rows={items}
      getRowKey={(item) => item.key}
      empty={<p className="text-sm text-fg-subtle">No line items.</p>}
      mobileCard={(item) => (
        <div className="flex items-start justify-between gap-3 px-1.5 text-sm">
          <div className="min-w-0">
            <p className="text-fg">{item.description}</p>
            <p className="mt-0.5 font-mono text-xs text-fg-subtle tabular">
              {itemKindLabel(item.kind)} · {item.quantity} × <Money cents={item.unitPriceCents} currency={currency} />
            </p>
            {item.note ? <p className="mt-0.5 text-xs text-fg-subtle">{item.note}</p> : null}
          </div>
          <Money cents={item.amountCents} currency={currency} className="shrink-0 font-mono font-medium text-fg tabular" />
        </div>
      )}
      columns={[
        {
          key: "description",
          header: "Item",
          primary: true,
          cell: (item) => (
            <span className="flex min-w-48 flex-col">
              <span>{item.description}</span>
              {item.note ? <span className="text-xs font-normal text-fg-subtle">{item.note}</span> : null}
            </span>
          ),
        },
        { key: "kind", header: "Type", cell: (item) => itemKindLabel(item.kind) },
        { key: "quantity", header: "Qty", align: "right", cell: (item) => <span className="font-mono tabular">{item.quantity}</span> },
        {
          key: "unit",
          header: "Unit price",
          align: "right",
          cell: (item) => <Money cents={item.unitPriceCents} currency={currency} className="font-mono tabular" />,
        },
        {
          key: "amount",
          header: "Amount",
          align: "right",
          cell: (item) => <Money cents={item.amountCents} currency={currency} className="font-mono font-medium text-fg tabular" />,
        },
      ]}
    />
  );
}

export type TotalsRow = { label: ReactNode; cents: number; emphasis?: boolean; hint?: ReactNode };

/** Right-aligned totals (labor, parts, tax, fees, total; platform fee and payout). */
export function TotalsList({ rows, currency, className }: { rows: readonly TotalsRow[]; currency: string; className?: string }) {
  return (
    <dl className={cn("space-y-2 rounded-xl border border-line bg-fg/[0.025] p-4 text-sm", className)}>
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn(
            "flex items-baseline justify-between gap-4",
            row.emphasis && "border-t border-line-strong pt-2.5 text-base font-semibold",
          )}
        >
          <dt className={row.emphasis ? "text-fg" : "text-fg-muted"}>
            {row.label}
            {row.hint ? <span className="block text-xs font-normal text-fg-subtle">{row.hint}</span> : null}
          </dt>
          <dd className={cn("font-mono tabular", row.emphasis ? "text-neon-cyan text-glow" : "text-fg")}>
            <Money cents={row.cents} currency={currency} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "10% of labor" from basis points. */
export function feeRateLabel(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}% of labor, provisional`;
}
