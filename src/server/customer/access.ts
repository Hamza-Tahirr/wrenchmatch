import "server-only";

import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";

// Role and ownership helpers for the customer domain. Records that do not exist and records
// that belong to someone else get the same "not found", so ids cannot be probed.

export function assertCustomer(viewer: Viewer): void {
  if (viewer.role !== "customer") {
    throw new DomainError("forbidden", "This is only available to customer accounts.");
  }
}

const NOT_FOUND_MESSAGES = {
  request: "We couldn't find that repair request.",
  quote: "We couldn't find that quote.",
  booking: "We couldn't find that booking.",
  changeOrder: "We couldn't find that change order.",
} as const;

export type CustomerRecordKind = keyof typeof NOT_FOUND_MESSAGES;

export function notFound(kind: CustomerRecordKind): DomainError {
  return new DomainError("not_found", NOT_FOUND_MESSAGES[kind]);
}
