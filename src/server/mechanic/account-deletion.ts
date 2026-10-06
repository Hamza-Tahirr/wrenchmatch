import "server-only";

import { isAccountDeletionMessage } from "@/lib/validation/support";
import type { AppContext, Viewer } from "@/server/context";
import { listMySupportRequests } from "@/server/support/requests";

import { assertMechanic } from "./access";

// "Request account deletion" on the mechanic profile uses the shared help-desk command
// (requestAccountDeletion in src/server/support/requests.ts): a help request with topic
// "account" that notifies the admins. Nothing is deleted automatically. This module only
// tells the profile whether such a request is still open.

export type AccountDeletionRequest = {
  supportRequestId: string;
  /** UTC ISO timestamp. */
  createdAt: string;
  /** IANA zone to show the date in. */
  timeZone: string;
};

/** The mechanic's open account-deletion request, or null. */
export async function getAccountDeletionRequest(ctx: AppContext, viewer: Viewer): Promise<AccountDeletionRequest | null> {
  assertMechanic(viewer);
  const requests = await listMySupportRequests(ctx, viewer);
  const open = requests.find((request) => request.status === "open" && isAccountDeletionMessage(request.topic, request.message));
  return open ? { supportRequestId: open.id, createdAt: open.createdAt, timeZone: open.timeZone } : null;
}
