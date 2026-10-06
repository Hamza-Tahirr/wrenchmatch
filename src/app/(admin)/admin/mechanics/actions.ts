"use server";

import { adminFormValues, inviteMechanicSchema, type AdminFailureState } from "@/lib/validation/admin";
import { adminActionFailure, adminValidationFailure } from "@/server/admin/action-result";
import { inviteMechanic } from "@/server/admin/invites";
import { createAppContext } from "@/server/context";

import { refreshAdminPages, requireAdminForAction } from "../_lib/run-action";

/** The invite form's state: the captured email to link to, or a failure. */
export type InviteMechanicState =
  | { ok: true; message: string; emailId: string; toEmail: string; previouslyInvited: boolean }
  | AdminFailureState;

/** Captures an invitation email in the local outbox (nothing is sent) and audits it. */
export async function inviteMechanicAction(
  _previous: InviteMechanicState,
  formData: FormData,
): Promise<InviteMechanicState> {
  const viewer = await requireAdminForAction("/admin/mechanics");
  const values = adminFormValues(formData);
  const parsed = inviteMechanicSchema.safeParse(values);
  if (!parsed.success) return adminValidationFailure(parsed.error, values);
  try {
    const result = await inviteMechanic(createAppContext(), viewer, parsed.data);
    refreshAdminPages();
    return {
      ok: true,
      message: `Invitation for ${result.toEmail} captured in the local email outbox (not sent).`,
      emailId: result.emailId,
      toEmail: result.toEmail,
      previouslyInvited: result.previouslyInvited,
    };
  } catch (error) {
    return adminActionFailure(error, values);
  }
}
