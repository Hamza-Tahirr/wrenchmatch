"use server";

import { pluralize } from "@/lib/format";
import {
  adminFormValues,
  requestRevealSchema,
  rerunMatchingSchema,
  type AdminActionState,
  type AdminRevealState,
} from "@/lib/validation/admin";
import { adminActionFailure, adminValidationFailure } from "@/server/admin/action-result";
import { rerunMatching, type RerunMatchingResult } from "@/server/admin/matching";
import { revealRequestContact, type RequestContactDetails } from "@/server/admin/requests";
import { createAppContext } from "@/server/context";

import { recordPath, refreshAdminPages, requireAdminForAction, runAdminAction } from "../../_lib/run-action";

const requestPath = (values: Record<string, string>) => recordPath("/admin/requests", values.requestId);

function rerunMessage(result: RerunMatchingResult): string {
  if (result.newlyNotifiedCount > 0) {
    const names = result.newlyNotified.map((mechanic) => mechanic.displayName).join(", ");
    return `Matching re-run: notified ${pluralize(result.newlyNotifiedCount, "more mechanic")} (${names}). ${pluralize(
      result.notifiedCount,
      "mechanic",
    )} notified in total, and the customer was told.`;
  }
  return `Matching re-run: nobody new to notify. ${result.eligibleCount} of ${pluralize(
    result.evaluatedCount,
    "mechanic",
  )} eligible now, ${result.notifiedCount} already notified. The reasons below are refreshed.`;
}

export async function rerunMatchingAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: rerunMatchingSchema,
    path: requestPath,
    run: (ctx, viewer, data) => rerunMatching(ctx, viewer, data.requestId),
    success: rerunMessage,
  });
}

/** Reveals the customer's contact details with a reason (audited); the dialog shows them once. */
export async function revealRequestContactAction(
  _previous: AdminRevealState<RequestContactDetails>,
  formData: FormData,
): Promise<AdminRevealState<RequestContactDetails>> {
  const values = adminFormValues(formData);
  const viewer = await requireAdminForAction(requestPath(values));
  const parsed = requestRevealSchema.safeParse(values);
  if (!parsed.success) return adminValidationFailure(parsed.error, values);
  let revealed: RequestContactDetails;
  try {
    revealed = await revealRequestContact(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return adminActionFailure(error, values);
  }
  refreshAdminPages();
  return { ok: true, revealed };
}
