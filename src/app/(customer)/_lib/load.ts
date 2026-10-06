import "server-only";

import { notFound } from "next/navigation";

import { RECORD_ID_PATTERN } from "@/lib/validation/request";
import { isDomainError } from "@/server/errors";

/** A record id from the URL, or the 404 page for anything that can't be one. */
export function recordIdOr404(raw: string): string {
  // Ids are letters, digits, "-" and "_", so they never need URL encoding.
  if (!RECORD_ID_PATTERN.test(raw)) notFound();
  return raw;
}

/**
 * Runs a customer query. "Not found" (missing, or someone else's record: the domain never
 * says which) renders the 404 page; any other failure goes to the error boundary.
 */
export async function loadOr404<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A page title from a record (e.g. "Brake work · 2017 Honda Civic LX"), or `fallback` when
 * the id is malformed or the record can't be shown (the page itself renders the 404).
 */
export async function recordTitle(rawId: string, load: (id: string) => Promise<string>, fallback: string): Promise<string> {
  if (!RECORD_ID_PATTERN.test(rawId)) return fallback;
  try {
    return await load(rawId);
  } catch (error) {
    if (isDomainError(error)) return fallback;
    throw error;
  }
}
