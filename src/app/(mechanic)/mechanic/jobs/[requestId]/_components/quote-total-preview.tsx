import { Calculator } from "lucide-react";

import { parseDollarsToCents } from "@/lib/validation/mechanic";

import { CountUp } from "../../../_components/count-up";
import type { AmountRow, PartRow } from "./quote-line-rows";

// A display-only preview of the quote total while the mechanic types; every amount rolls to
// its new value. The server never uses it: submitQuote recomputes every amount from the
// submitted line items (pricing.ts).

/** Cents of a typed amount: 0 when empty, null when it can't be read. */
function previewCents(raw: string): number | null {
  return raw.trim() === "" ? 0 : parseDollarsToCents(raw);
}

function previewQuantity(raw: string): number | null {
  if (raw.trim() === "") return 1;
  return /^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

function sumOrNull(amounts: Array<number | null>): number | null {
  if (amounts.some((amount) => amount === null)) return null;
  return amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}

export type PreviewInput = {
  labor: string;
  partsIncluded: string;
  parts: readonly PartRow[];
  taxes: readonly AmountRow[];
  fees: readonly AmountRow[];
};

export type PreviewTotals = {
  laborCents: number | null;
  partsCents: number | null;
  taxCents: number | null;
  feeCents: number | null;
  /** Null while any amount can't be read. */
  totalCents: number | null;
};

/** The preview amounts of the typed rows (display only; the server recalculates). */
export function previewTotals({ labor, partsIncluded, parts, taxes, fees }: PreviewInput): PreviewTotals {
  const laborCents = previewCents(labor);
  const partsCents =
    partsIncluded === "yes"
      ? sumOrNull(
          parts.map((row) => {
            const quantity = previewQuantity(row.quantity);
            const unit = previewCents(row.unitPrice);
            return quantity === null || unit === null ? null : quantity * unit;
          }),
        )
      : 0;
  const taxCents = sumOrNull(taxes.map((row) => previewCents(row.amount)));
  const feeCents = sumOrNull(fees.map((row) => previewCents(row.amount)));
  return { laborCents, partsCents, taxCents, feeCents, totalCents: sumOrNull([laborCents, partsCents, taxCents, feeCents]) };
}

function Amount({ cents, check = "Check amounts" }: { cents: number | null; check?: string }) {
  if (cents === null) return <span className="font-sans text-warning-700">{check}</span>;
  return <CountUp value={cents} format="cents" duration={0.45} />;
}

export function QuoteTotalPreview({ totals, partsIncluded }: { totals: PreviewTotals; partsIncluded: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neon-cyan/30 bg-neon-cyan/5 p-4 shadow-glow-sm sm:p-5">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />
      <div className="flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.16em] text-neon-cyan uppercase">
        <Calculator aria-hidden="true" className="size-4" />
        Total preview
      </div>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 text-sm">
        <dt className="text-fg-muted">Labor</dt>
        <dd className="pl-4 text-right font-mono text-fg tabular">
          <Amount cents={totals.laborCents} check="Check amount" />
        </dd>
        <dt className="text-fg-muted">Parts</dt>
        <dd className="pl-4 text-right font-mono text-fg tabular">
          {partsIncluded === "no" ? <span className="font-sans text-fg-subtle">Not included</span> : <Amount cents={totals.partsCents} />}
        </dd>
        <dt className="text-fg-muted">Taxes</dt>
        <dd className="pl-4 text-right font-mono text-fg tabular">
          <Amount cents={totals.taxCents} />
        </dd>
        <dt className="text-fg-muted">Fees</dt>
        <dd className="pl-4 text-right font-mono text-fg tabular">
          <Amount cents={totals.feeCents} />
        </dd>
        <dt className="mt-1 border-t border-neon-cyan/25 pt-2.5 font-display text-base font-semibold text-fg">Customer total</dt>
        <dd className="mt-1 border-t border-neon-cyan/25 pt-2 pl-4 text-right font-mono text-2xl font-semibold text-fg tabular text-glow">
          {totals.totalCents === null ? "—" : <CountUp value={totals.totalCents} format="cents" duration={0.5} />}
        </dd>
      </dl>
      <p className="mt-3 text-xs text-fg-muted">
        Preview only. When you send the quote, the server recalculates every amount from your line items.
      </p>
    </div>
  );
}
