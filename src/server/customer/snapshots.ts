import "server-only";

import { z } from "zod";

import { QUOTE_SERVICE_MODES, type QuoteServiceMode } from "@/lib/domain";
import { QUOTE_ITEM_KINDS, type BookingMoney, type QuoteItemKind } from "@/server/pricing";

import { parseJson } from "./rows";

// The immutable records stored on a booking: bookings.quote_snapshot_json (the quote's terms,
// line items, the mechanic's public info and the server-computed money at selection time)
// and bookings.consent_snapshot_json (the exact consent text, version and time accepted).
// Readers are lenient: seeded fixtures may store a smaller snapshot, so every part is
// optional and callers fall back to the immutable quote rows.

export const QUOTE_SNAPSHOT_VERSION = 1;

export type QuoteSnapshotItem = {
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type QuoteSnapshot = {
  version: typeof QUOTE_SNAPSHOT_VERSION;
  /** When the server computed the money below (the selection time). */
  computedAt: string;
  quote: {
    id: string;
    requestId: string;
    mechanicId: string;
    serviceMode: QuoteServiceMode;
    partsIncluded: boolean;
    currency: string;
    slotStartAt: string;
    slotEndAt: string;
    estimatedDurationMinutes: number;
    scope: string;
    exclusions: string | null;
    notes: string | null;
    quotedAt: string;
    expiresAt: string;
  };
  items: QuoteSnapshotItem[];
  /** Public display info only (never contact details). */
  mechanic: {
    id: string;
    displayName: string;
    yearsExperience: number;
    certifications: string | null;
    areaLabel: string;
    services: string[];
  };
  totals: BookingMoney;
};

export function buildQuoteSnapshot(input: Omit<QuoteSnapshot, "version">): QuoteSnapshot {
  return { version: QUOTE_SNAPSHOT_VERSION, ...input };
}

const snapshotItemSchema = z.object({
  kind: z.enum(QUOTE_ITEM_KINDS),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  /** Smaller seeded snapshots may leave it out; it is quantity x unit price. */
  amountCents: z.number().int().optional(),
});

/** The quote terms a snapshot may hold; each is undefined when missing or unreadable. */
export type SnapshotTerms = {
  serviceMode?: QuoteServiceMode;
  partsIncluded?: boolean;
  scope?: string;
  exclusions?: string | null;
  notes?: string | null;
  estimatedDurationMinutes?: number;
  quotedAt?: string;
  expiresAt?: string;
};

export type ParsedQuoteSnapshot = {
  computedAt: string | null;
  /** Null when the snapshot holds no readable line items. */
  items: QuoteSnapshotItem[] | null;
  terms: SnapshotTerms;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// Each term is read on its own, so one odd field doesn't hide the others.
function readTerms(source: Record<string, unknown>): SnapshotTerms {
  return {
    serviceMode: pick(z.enum(QUOTE_SERVICE_MODES), source.serviceMode),
    partsIncluded: pick(z.boolean(), source.partsIncluded),
    scope: pick(z.string().min(1), source.scope),
    exclusions: pick(z.string().nullable(), source.exclusions),
    notes: pick(z.string().nullable(), source.notes),
    estimatedDurationMinutes: pick(z.number().int().positive(), source.estimatedDurationMinutes),
    quotedAt: pick(z.string(), source.quotedAt),
    expiresAt: pick(z.string(), source.expiresAt),
  };
}

function readItems(value: unknown): QuoteSnapshotItem[] | null {
  const parsed = z.array(snapshotItemSchema).min(1).safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.map((item) => ({
    kind: item.kind,
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    amountCents: item.amountCents ?? item.quantity * item.unitPriceCents,
  }));
}

/**
 * Reads what it can from a stored quote snapshot: this module's shape, a flat shape with the
 * terms at the top level, or a smaller seeded fixture. Unreadable parts come back empty and
 * callers fall back to the immutable quote rows.
 */
export function parseQuoteSnapshot(json: string): ParsedQuoteSnapshot {
  const snapshot = parseJson(json);
  if (!isRecord(snapshot)) return { computedAt: null, items: null, terms: {} };
  const quote = isRecord(snapshot.quote) ? snapshot.quote : snapshot;
  return {
    computedAt: typeof snapshot.computedAt === "string" ? snapshot.computedAt : null,
    items: readItems(Array.isArray(snapshot.items) ? snapshot.items : quote.items),
    terms: readTerms(quote),
  };
}

export type ConsentRecord = {
  version: string;
  /** UTC ISO time the consent was given. */
  acceptedAt: string;
  /** The exact statements accepted. */
  items: { key: string; text: string }[];
};

const consentSchema = z.object({
  version: z.string(),
  acceptedAt: z.string(),
  items: z.array(z.object({ key: z.string(), text: z.string() })),
});

/** A stored consent snapshot (buildConsentSnapshot's shape), or null when unreadable. */
export function parseConsentRecord(json: string | null): ConsentRecord | null {
  const parsed = consentSchema.safeParse(parseJson(json));
  return parsed.success ? parsed.data : null;
}
