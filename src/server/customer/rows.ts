import "server-only";

// Small helpers for turning database rows into DTOs.

/** Narrows a TEXT column to its CHECK-constrained union; a mismatch means schema drift. */
export function oneOf<T extends string>(allowed: readonly T[], value: string, column: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`Unexpected ${column} value "${value}"`);
  return match;
}

/** JSON.parse that returns undefined instead of throwing (stored JSON is validated by CHECKs). */
export function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Groups rows by a key, keeping row order within each group. */
export function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export function vehicleLabel(year: number, make: string, model: string): string {
  return `${year} ${make} ${model}`;
}

/** "Battery replacement · 2016 Honda Civic" */
export function requestTitle(categoryName: string, year: number, make: string, model: string): string {
  return `${categoryName} · ${vehicleLabel(year, make, model)}`;
}
