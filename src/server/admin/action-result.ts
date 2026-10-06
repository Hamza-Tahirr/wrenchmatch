import "server-only";

import type { z } from "zod";

import {
  adminFieldErrors,
  type AdminActionState,
  type AdminFailureState,
  type AdminFormValues,
  type AdminRevealState,
} from "@/lib/validation/admin";
import { isDomainError } from "@/server/errors";

// Failure states for the admin Server Actions (useActionState / ConfirmDialog). The state
// types and INITIAL_ADMIN_ACTION_STATE live in src/lib/validation/admin.ts, so Client
// Components can import them. A failure fits both AdminActionState and AdminRevealState.
// Typical action:
//
//   "use server";
//   export async function changeStatusAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
//     const viewer = await requireRole("admin");
//     const values = adminFormValues(formData);
//     const parsed = mechanicStatusChangeSchema.safeParse(values);
//     if (!parsed.success) return adminValidationFailure(parsed.error, values);
//     try {
//       await setMechanicStatus(createAppContext(), viewer, parsed.data);
//     } catch (error) {
//       return adminActionFailure(error, values); // rethrows anything that is not a DomainError
//     }
//     revalidatePath(`/admin/mechanics/${parsed.data.mechanicId}`);
//     return { ok: true, message: "Mechanic approved." };
//   }

export type { AdminActionState, AdminFailureState, AdminFormValues, AdminRevealState };

/** A failed admin action: `formError` is always set, so a ConfirmDialog explains the problem. */
export type AdminActionFailure = AdminFailureState & { formError: string };

const CHECK_FIELDS = "Check the highlighted fields and try again.";

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).every((messages) => Array.isArray(messages) && messages.every((m) => typeof m === "string"))
  );
}

/** A failed schema parse as form state (field errors keyed by form field name). */
export function adminValidationFailure(error: z.ZodError, values?: AdminFormValues): AdminActionFailure {
  const fieldErrors = adminFieldErrors(error);
  const messages = Object.values(fieldErrors).flat();
  return {
    ok: false,
    formError: messages.length === 1 ? messages[0] : CHECK_FIELDS,
    fieldErrors,
    ...(values ? { values } : {}),
  };
}

/**
 * A DomainError from an admin command as form state: its user message, plus field errors
 * when the command reported them. Anything else (including Next.js redirect/notFound
 * signals) is rethrown unchanged.
 */
export function adminActionFailure(error: unknown, values?: AdminFormValues): AdminActionFailure {
  if (!isDomainError(error)) throw error;
  const fieldErrors = error.details?.fieldErrors;
  return {
    ok: false,
    formError: error.userMessage,
    ...(isFieldErrors(fieldErrors) && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    ...(values ? { values } : {}),
  };
}
