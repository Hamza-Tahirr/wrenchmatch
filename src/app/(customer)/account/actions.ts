"use server";

import { revalidatePath } from "next/cache";

import { parseAccountDeletionForm } from "@/lib/validation/support";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { requestAccountDeletion } from "@/server/support/requests";

import { actionFailure, firstFieldError, STALE_FORM_MESSAGE } from "../_lib/action-result";

/** ConfirmDialog keeps itself open on `ok: false`; on success it toasts `message`. */
export type AccountDeletionActionResult = { ok: true; message: string } | { ok: false; formError: string };

/**
 * "Request account deletion": sends the help desk an account help request (MVP_PLAN section
 * 10). Nothing is deleted or disabled here; the team confirms with the customer first.
 */
export async function requestAccountDeletionAction(formData: FormData): Promise<AccountDeletionActionResult> {
  const viewer = await requireRole("customer", "/account");
  const parsed = parseAccountDeletionForm(formData);
  if (!parsed.ok) return { ok: false, formError: firstFieldError(parsed.fieldErrors, STALE_FORM_MESSAGE) };
  let alreadyRequested: boolean;
  try {
    ({ alreadyRequested } = await requestAccountDeletion(createAppContext(), viewer, parsed.data));
  } catch (error) {
    const failure = actionFailure(error);
    return { ok: false, formError: failure.ok ? STALE_FORM_MESSAGE : failure.formError };
  }
  revalidatePath("/account");
  revalidatePath("/support");
  // The header's unread badge counts the "we received your request" notification.
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: alreadyRequested ? "Your deletion request is already with our team" : "Deletion request sent",
  };
}
