import type { ExtraRow } from "../../../_components/line-items";

// Platform-fee and payout rows shown under booking and invoice totals. The amounts come from
// the server (pricing.ts); this only labels them.

function feePercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** "Platform fee (10% of labor)" and the payout, for LineItems extraRows. */
export function moneyRows(platformFeeBps: number, platformFeeCents: number, payoutCents: number): ExtraRow[] {
  return [
    {
      label: `Platform fee (${feePercent(platformFeeBps)} of labor)`,
      cents: platformFeeCents,
      deducted: true,
      hint: "Provisional fee, included in the total and deducted from your payout.",
    },
    {
      label: "Your payout",
      cents: payoutCents,
      emphasis: true,
      hint: "Before payment-processing costs, which are set when online payments launch.",
    },
  ];
}
