import "server-only";

// DTO building blocks shared by the admin queries. Every DTO is plain serializable data
// (strings, numbers, booleans, arrays, objects), safe to pass to Client Components.

/** One page of a list, newest or most relevant first. */
export type Paged<T> = {
  items: T[];
  /** The page actually returned (a page past the end returns the last page). */
  page: number;
  pageSize: number;
  totalCount: number;
  /** At least 1, so "page 1 of 1" also describes an empty list. */
  totalPages: number;
};

/** A user shown by display name only (never contact details). */
export type PersonRef = { id: string; displayName: string };

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Narrows a TEXT column to its CHECK-constrained union; a mismatch means schema drift. */
export function oneOf<T extends string>(allowed: readonly T[], value: string, column: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`Unexpected ${column} value "${value}"`);
  return match;
}

/** Parses a stored JSON object column; anything else (or invalid JSON) becomes {}. */
export function parseJsonObject(text: string | null): JsonObject {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
  } catch {
    return {};
  }
}

/** A consent snapshot as stored (exact text accepted, its version and when). */
export type AdminConsentRecord = {
  version: string;
  acceptedAt: string;
  items: { key: string; text: string }[];
};

/** Parses a *_consent_snapshot_json column; null when missing or unreadable. */
export function parseConsentRecord(text: string | null | undefined): AdminConsentRecord | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const record = value as { version?: unknown; acceptedAt?: unknown; items?: unknown };
    if (typeof record.version !== "string" || typeof record.acceptedAt !== "string" || !Array.isArray(record.items)) {
      return null;
    }
    const items = record.items.flatMap((item: unknown) => {
      const entry = item as { key?: unknown; text?: unknown } | null;
      return entry && typeof entry.key === "string" && typeof entry.text === "string"
        ? [{ key: entry.key, text: entry.text }]
        : [];
    });
    return { version: record.version, acceptedAt: record.acceptedAt, items };
  } catch {
    return null;
  }
}
