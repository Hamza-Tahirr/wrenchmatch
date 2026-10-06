"use server";

import { supportResolutionSchema, type AdminActionState } from "@/lib/validation/admin";
import { resolveSupportRequest } from "@/server/admin/support";

import { runAdminAction } from "../_lib/run-action";

/** Resolves an open help request with a note the requester sees (notified and audited). */
export async function resolveSupportRequestAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: supportResolutionSchema,
    path: () => "/admin/support",
    run: (ctx, viewer, data) => resolveSupportRequest(ctx, viewer, data),
    success: () => "Help request resolved. The person who asked was notified with your note.",
  });
}
