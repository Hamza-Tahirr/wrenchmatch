"use server";

import {
  adminFormValues,
  documentReviewSchema,
  mechanicRevealSchema,
  mechanicStatusChangeSchema,
  safetyApprovalSchema,
  type AdminActionState,
  type AdminRevealState,
} from "@/lib/validation/admin";
import { adminActionFailure, adminValidationFailure } from "@/server/admin/action-result";
import { reviewDocument, setSafetyApproval } from "@/server/admin/mechanic-review";
import { revealMechanicPrivate, type MechanicPrivateDetails } from "@/server/admin/mechanic-private";
import { setMechanicStatus, type MechanicStatusEvent } from "@/server/admin/mechanic-status";
import { createAppContext } from "@/server/context";

import { recordPath, refreshAdminPages, requireAdminForAction, runAdminAction } from "../../_lib/run-action";

// Server Actions of the mechanic review page. Each re-checks the admin role, validates the
// form with its schema and calls the admin domain command (which checks the role again).

const mechanicPath = (values: Record<string, string>) => recordPath("/admin/mechanics", values.mechanicId);

const STATUS_MESSAGES: Readonly<Record<MechanicStatusEvent, string>> = {
  review_started: "Moved to review. The mechanic was notified in the app (email captured in the local outbox).",
  approved:
    "Mechanic approved and notified. New matching requests can reach them now; use Re-run matching on an open request to offer it to them.",
  reinstated: "Mechanic reinstated and notified. They can receive job matches again.",
  rejected: "Application rejected. The mechanic was notified with your reason.",
  suspended: "Mechanic suspended. They receive no new jobs and were notified with your reason.",
};

export async function changeMechanicStatusAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: mechanicStatusChangeSchema,
    path: mechanicPath,
    run: (ctx, viewer, data) => setMechanicStatus(ctx, viewer, data),
    success: (result) => STATUS_MESSAGES[result.event],
  });
}

export async function setSafetyApprovalAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: safetyApprovalSchema,
    path: mechanicPath,
    run: (ctx, viewer, data) => setSafetyApproval(ctx, viewer, data),
    success: (result) => {
      if (!result.changed) return "Nothing changed: the approval was already in that state.";
      return result.approved
        ? "Safety approval saved. Requests in this category can now reach this mechanic; re-run matching to offer open ones."
        : "Safety approval removed. Requests in this category no longer reach this mechanic.";
    },
  });
}

export async function reviewDocumentAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: documentReviewSchema,
    path: mechanicPath,
    run: (ctx, viewer, data) => reviewDocument(ctx, viewer, data),
    success: (result) => {
      if (!result.changed) return "Nothing changed: the document already had that decision.";
      return result.status === "verified"
        ? "Document verified. The mechanic was notified."
        : "Document rejected. The mechanic was notified with your note.";
    },
  });
}

/** Reveals the mechanic's private record with a reason (audited); the dialog shows it once. */
export async function revealMechanicPrivateAction(
  _previous: AdminRevealState<MechanicPrivateDetails>,
  formData: FormData,
): Promise<AdminRevealState<MechanicPrivateDetails>> {
  const values = adminFormValues(formData);
  const viewer = await requireAdminForAction(mechanicPath(values));
  const parsed = mechanicRevealSchema.safeParse(values);
  if (!parsed.success) return adminValidationFailure(parsed.error, values);
  let revealed: MechanicPrivateDetails;
  try {
    revealed = await revealMechanicPrivate(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return adminActionFailure(error, values);
  }
  // The reveal is now in the mechanic's history; the details stay only in the open dialog.
  refreshAdminPages();
  return { ok: true, revealed };
}
