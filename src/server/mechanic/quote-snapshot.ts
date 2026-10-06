import "server-only";

import { z } from "zod";

import { isDomainError } from "@/server/errors";
import { computeQuoteTotals, QUOTE_ITEM_KINDS, sameQuoteTotals, type QuoteItemKind, type QuoteTotals } from "@/server/pricing";

// The job terms of a booking, read from its immutable quote snapshot (bookings.
// quote_snapshot_json, written by quote selection or by the demo seed). The snapshot is
// read tolerantly: its line items are used only when they add up exactly to the booking's
// money (which a trigger keeps equal to the quote), otherwise the quote's own immutable rows
// are used. Either way the terms shown and invoiced are the ones the customer accepted.

export type JobLineItem = {
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type JobTerms = {
  scope: string;
  exclusions: string | null;
  notes: string | null;
  partsIncluded: boolean;
  estimatedDurationMinutes: number;
  items: JobLineItem[];
};

const snapshotItemSchema = z.object({
  kind: z.enum(QUOTE_ITEM_KINDS),
  description: z.string().trim().min(1).max(200),
  quantity: z.int().min(1).max(100),
  unitPriceCents: z.int().min(0),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function nullableText(source: Record<string, unknown>, key: string): string | null | undefined {
  const value = source[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function snapshotItems(raw: unknown, expected: QuoteTotals): JobLineItem[] | null {
  const parsed = z.array(snapshotItemSchema).safeParse(raw);
  if (!parsed.success) return null;
  try {
    if (!sameQuoteTotals(computeQuoteTotals(parsed.data), expected)) return null;
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
  return parsed.data.map((item) => ({ ...item, amountCents: item.quantity * item.unitPriceCents }));
}

/**
 * The booking's terms from its snapshot (shapes `{ quote: {...}, items: [...] }` or flat),
 * falling back field by field to `fallback` (the quote row and its items).
 */
export function readJobTerms(snapshotJson: string, fallback: JobTerms, expected: QuoteTotals): JobTerms {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    return fallback;
  }
  if (!isRecord(snapshot)) return fallback;
  const quote = isRecord(snapshot.quote) ? snapshot.quote : snapshot;
  const items =
    snapshotItems(Array.isArray(snapshot.items) ? snapshot.items : quote.items, expected) ?? fallback.items;
  const duration = quote.estimatedDurationMinutes;
  const exclusions = nullableText(quote, "exclusions");
  const notes = nullableText(quote, "notes");
  return {
    scope: text(quote, "scope") ?? fallback.scope,
    exclusions: exclusions === undefined ? fallback.exclusions : exclusions,
    notes: notes === undefined ? fallback.notes : notes,
    partsIncluded: typeof quote.partsIncluded === "boolean" ? quote.partsIncluded : fallback.partsIncluded,
    estimatedDurationMinutes:
      typeof duration === "number" && Number.isInteger(duration) && duration > 0 ? duration : fallback.estimatedDurationMinutes,
    items,
  };
}
