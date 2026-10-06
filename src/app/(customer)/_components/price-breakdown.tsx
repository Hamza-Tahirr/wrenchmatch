import { PackageCheck, PackageX } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

import { formatBps } from "../_lib/display";
import { CountUp } from "./count-up";

// Itemized prices exactly as the server computed them (src/server/pricing.ts): this file
// only lays out integer cents, it never adds anything up.

export type PriceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type PriceGroups = {
  labor: readonly PriceLine[];
  parts: readonly PriceLine[];
  taxes: readonly PriceLine[];
  fees: readonly PriceLine[];
};

export type PriceTotals = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
};

export type PlatformFeeInfo = { bps: number; cents: number };

export function PartsBadge({ included }: { included: boolean }) {
  return included ? (
    <Badge tone="success" icon={<PackageCheck />}>
      Parts included
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<PackageX />}>
      Parts not included
    </Badge>
  );
}

/** "Includes the provisional platform fee: $6.00 (10% of labor)…" */
export function platformFeeText(fee: PlatformFeeInfo, currency: string): string {
  return `Includes the provisional platform fee of ${formatCents(fee.cents, currency)} (${formatBps(fee.bps)} of labor). It is part of this total, not added on top, and is deducted from the mechanic's payout.`;
}

/** A money amount that counts up when it scrolls into view (USD), or a plain amount. */
export function CountingMoney({ cents, currency, className }: { cents: number; currency: string; className?: string }) {
  if (currency !== "USD") return <Money cents={cents} currency={currency} className={className} />;
  return <CountUp value={cents} format="cents" className={className} />;
}

function GroupRows({
  title,
  lines,
  currency,
  subtotalCents,
  badge,
  emptyText,
}: {
  title: string;
  lines: readonly PriceLine[];
  currency: string;
  subtotalCents: number;
  badge?: ReactNode;
  emptyText?: string;
}) {
  if (lines.length === 0 && !emptyText) return null;
  return (
    <>
      <tr>
        <th scope="colgroup" colSpan={2} className="px-4 pt-3.5 pb-1.5 text-left">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">{title}</span>
            {badge}
          </span>
        </th>
      </tr>
      {lines.length === 0 ? (
        <tr>
          <td colSpan={2} className="px-4 pb-2.5 text-fg-subtle">
            {emptyText}
          </td>
        </tr>
      ) : (
        lines.map((line) => (
          <tr key={line.id} className="transition-colors hover:bg-fg/[0.03]">
            <th scope="row" className="px-4 py-2 text-left font-normal">
              <span className="block text-fg">{line.description}</span>
              {line.quantity > 1 ? (
                <span className="mt-0.5 block font-mono text-xs text-fg-subtle tabular">
                  {line.quantity} × {formatCents(line.unitPriceCents, currency)}
                </span>
              ) : null}
            </th>
            <td className="px-4 py-2 text-right align-top font-mono text-fg tabular">
              <Money cents={line.amountCents} currency={currency} />
            </td>
          </tr>
        ))
      )}
      {lines.length > 1 ? (
        <tr>
          <th scope="row" className="px-4 pb-2 text-left text-xs font-normal text-fg-subtle">
            {title} subtotal
          </th>
          <td className="px-4 pb-2 text-right font-mono text-xs text-fg-subtle tabular">
            <Money cents={subtotalCents} currency={currency} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export type PriceBreakdownProps = {
  /** Names the table for screen readers, e.g. "Price breakdown of Marco R.'s quote". */
  caption: string;
  lines: PriceGroups;
  totals: PriceTotals;
  currency: string;
  partsIncluded: boolean;
  /** Shown under the total; omit to leave the fee note out. */
  platformFee?: PlatformFeeInfo;
  /** Label of the total row. */
  totalLabel?: string;
  /** Count the total up when it scrolls into view. */
  animateTotal?: boolean;
  /** Extra rows after the total (e.g. "You pay"). */
  footer?: ReactNode;
  className?: string;
};

/** Labor, parts, taxes and fees as separate groups of lines, then the total. */
export function PriceBreakdown({
  caption,
  lines,
  totals,
  currency,
  partsIncluded,
  platformFee,
  totalLabel = "Total",
  animateTotal = false,
  footer,
  className,
}: PriceBreakdownProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-surface-2/60", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <GroupRows title="Labor" lines={lines.labor} currency={currency} subtotalCents={totals.laborCents} />
          <GroupRows
            title="Parts"
            lines={lines.parts}
            currency={currency}
            subtotalCents={totals.partsCents}
            badge={<PartsBadge included={partsIncluded} />}
            emptyText={partsIncluded ? "No separate part lines." : "Not included in this price: parts are bought separately."}
          />
          <GroupRows title="Taxes" lines={lines.taxes} currency={currency} subtotalCents={totals.taxCents} />
          <GroupRows title="Fees" lines={lines.fees} currency={currency} subtotalCents={totals.feeCents} />
        </tbody>
        <tfoot className="border-t border-line-strong bg-linear-to-r from-neon-cyan/[0.07] via-transparent to-neon-violet/[0.07]">
          <tr>
            <th
              scope="row"
              className={cn("px-4 pt-3.5 text-left font-display text-base font-semibold text-fg", platformFee ? "pb-1" : "pb-3.5")}
            >
              {totalLabel}
            </th>
            <td
              className={cn(
                "px-4 pt-3.5 text-right font-mono text-xl font-semibold text-fg tabular text-glow",
                platformFee ? "pb-1" : "pb-3.5",
              )}
            >
              {animateTotal ? (
                <CountingMoney cents={totals.totalCents} currency={currency} />
              ) : (
                <Money cents={totals.totalCents} currency={currency} />
              )}
            </td>
          </tr>
          {platformFee ? (
            <tr>
              <td colSpan={2} className="px-4 pt-1 pb-3.5 text-xs text-pretty text-fg-subtle">
                {platformFeeText(platformFee, currency)}
              </td>
            </tr>
          ) : null}
          {footer}
        </tfoot>
      </table>
    </div>
  );
}

/** A compact list of lines for one group (used inside the desktop comparison table). */
export function LineList({ lines, currency, empty }: { lines: readonly PriceLine[]; currency: string; empty: ReactNode }) {
  if (lines.length === 0) return <p className="text-fg-subtle">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-fg-muted">
            {line.description}
            {line.quantity > 1 ? (
              <span className="block font-mono text-xs text-fg-subtle tabular">
                {line.quantity} × {formatCents(line.unitPriceCents, currency)}
              </span>
            ) : null}
          </span>
          <Money cents={line.amountCents} currency={currency} className="shrink-0 font-mono text-fg tabular" />
        </li>
      ))}
    </ul>
  );
}
