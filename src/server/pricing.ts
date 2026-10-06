import "server-only";

import { PLATFORM_FEE_BPS } from "@/server/config";
import { DomainError } from "@/server/errors";

// The only place money is computed (ARCHITECTURE section 7). Pure functions over integer
// cents; totals are always recomputed from saved items, never accepted from the browser.

export const QUOTE_ITEM_KINDS = ["labor", "part", "tax", "fee"] as const;
export type QuoteItemKind = (typeof QUOTE_ITEM_KINDS)[number];

/** Bounds mirror the quote_items CHECK constraints. */
export const MAX_ITEM_QUANTITY = 100;
export const MAX_UNIT_PRICE_CENTS = 10_000_000; // $100,000
export const MAX_QUOTE_ITEMS = 25;
/** The bookings/invoices CHECK allows 0-3000 basis points (0-30%). */
export const MAX_PLATFORM_FEE_BPS = 3000;

export type PricedItem = {
  kind: QuoteItemKind;
  quantity: number;
  unitPriceCents: number;
};

export type QuoteTotals = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
};

export type BookingMoney = QuoteTotals & {
  platformFeeBps: number;
  platformFeeCents: number;
  mechanicPayoutCents: number;
};

export type ChangeOrderAmounts = {
  laborCents: number;
  partsCents: number;
  taxCents: number;
};

export type InvoiceTotals = BookingMoney & { approvedChangeOrderCount: number };

function invalid(message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError("invalid_input", message, details);
}

function isCents(value: unknown, max: number = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_PLATFORM_FEE_BPS) {
    throw invalid(`The platform fee rate must be 0-${MAX_PLATFORM_FEE_BPS} basis points.`);
  }
}

/** amount = quantity x unit price, after validating both (the quote_items CHECK formula). */
export function lineAmountCents(item: Pick<PricedItem, "quantity" | "unitPriceCents">): number {
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY) {
    throw invalid(`Each line needs a whole-number quantity from 1 to ${MAX_ITEM_QUANTITY}.`);
  }
  if (!isCents(item.unitPriceCents, MAX_UNIT_PRICE_CENTS)) {
    throw invalid("Each price must be a whole number of cents between $0 and $100,000.");
  }
  return item.quantity * item.unitPriceCents;
}

/**
 * Totals for a quote's line items. Requires exactly one labor line, at most
 * MAX_QUOTE_ITEMS lines, integer quantities and cents within bounds, and a total above $0.
 * Throws DomainError("invalid_input") otherwise.
 */
export function computeQuoteTotals(items: readonly PricedItem[]): QuoteTotals {
  if (items.length === 0 || items.length > MAX_QUOTE_ITEMS) {
    throw invalid(`A quote needs between 1 and ${MAX_QUOTE_ITEMS} line items.`);
  }
  const totals: QuoteTotals = { laborCents: 0, partsCents: 0, taxCents: 0, feeCents: 0, totalCents: 0 };
  let laborLines = 0;

  items.forEach((item, index) => {
    let amount: number;
    try {
      amount = lineAmountCents(item);
    } catch (error) {
      if (error instanceof DomainError) throw invalid(error.userMessage, { index });
      throw error;
    }
    switch (item.kind) {
      case "labor":
        laborLines += 1;
        totals.laborCents += amount;
        break;
      case "part":
        totals.partsCents += amount;
        break;
      case "tax":
        totals.taxCents += amount;
        break;
      case "fee":
        totals.feeCents += amount;
        break;
      default:
        throw invalid("Unknown line item type.", { index });
    }
  });

  if (laborLines !== 1) throw invalid("A quote needs exactly one labor line.");
  totals.totalCents = totals.laborCents + totals.partsCents + totals.taxCents + totals.feeCents;
  if (totals.totalCents <= 0) throw invalid("A quote total must be more than $0.");
  return totals;
}

/** Platform fee on labor, rounded half up in integer math: floor((labor x bps + 5000) / 10000). */
export function platformFeeCents(laborCents: number, bps: number = PLATFORM_FEE_BPS): number {
  if (!isCents(laborCents)) throw invalid("Labor must be a whole, non-negative number of cents.");
  assertBps(bps);
  return Math.floor((laborCents * bps + 5000) / 10000);
}

export function sameQuoteTotals(a: QuoteTotals, b: QuoteTotals): boolean {
  return (
    a.laborCents === b.laborCents &&
    a.partsCents === b.partsCents &&
    a.taxCents === b.taxCents &&
    a.feeCents === b.feeCents &&
    a.totalCents === b.totalCents
  );
}

function assertConsistent(totals: QuoteTotals): void {
  const parts = [totals.laborCents, totals.partsCents, totals.taxCents, totals.feeCents];
  if (!parts.every((value) => isCents(value)) || !isCents(totals.totalCents)) {
    throw invalid("Amounts must be whole, non-negative numbers of cents.");
  }
  if (parts.reduce((sum, value) => sum + value, 0) !== totals.totalCents) {
    throw invalid("The quote total does not equal the sum of its parts.");
  }
}

/**
 * Money for a booking created from a quote: the platform fee is included in the customer
 * total and deducted from the mechanic payout (before payment-processing costs, which are
 * decided when Stripe is connected). Matches the bookings CHECK constraints.
 */
export function computeBookingMoney(totals: QuoteTotals, bps: number = PLATFORM_FEE_BPS): BookingMoney {
  assertConsistent(totals);
  const fee = platformFeeCents(totals.laborCents, bps);
  return {
    laborCents: totals.laborCents,
    partsCents: totals.partsCents,
    taxCents: totals.taxCents,
    feeCents: totals.feeCents,
    totalCents: totals.totalCents,
    platformFeeBps: bps,
    platformFeeCents: fee,
    mechanicPayoutCents: totals.totalCents - fee,
  };
}

/** Invoice (demo fixtures): quote totals plus approved change orders; fee on the combined labor. */
export function computeInvoiceTotals(
  quoteTotals: QuoteTotals,
  approvedChangeOrders: readonly ChangeOrderAmounts[],
  bps: number = PLATFORM_FEE_BPS,
): InvoiceTotals {
  assertConsistent(quoteTotals);
  const combined: QuoteTotals = { ...quoteTotals };
  for (const order of approvedChangeOrders) {
    if (![order.laborCents, order.partsCents, order.taxCents].every((value) => isCents(value))) {
      throw invalid("Change order amounts must be whole, non-negative numbers of cents.");
    }
    combined.laborCents += order.laborCents;
    combined.partsCents += order.partsCents;
    combined.taxCents += order.taxCents;
  }
  combined.totalCents = combined.laborCents + combined.partsCents + combined.taxCents + combined.feeCents;
  return { ...computeBookingMoney(combined, bps), approvedChangeOrderCount: approvedChangeOrders.length };
}
