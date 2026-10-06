import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { adminFormValues, type AdminActionState, type AdminFormValues } from "@/lib/validation/admin";
import { adminActionFailure, adminValidationFailure } from "@/server/admin/action-result";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext, type AppContext, type Viewer } from "@/server/context";

// The shared body of the admin Server Actions: check the role, parse the form with its
// schema from src/lib/validation/admin.ts, run the domain command, refresh the admin
// pages and return a form state (useActionState). Refusals come back as messages; anything
// unexpected (and Next.js redirects) is rethrown.

/** Every admin page shows shared counts (navigation, dashboard), so a change refreshes all of them. */
export function refreshAdminPages(): void {
  revalidatePath("/admin", "layout");
}

const RECORD_ID = /^[0-9A-Za-z-]{1,64}$/;

/** `${base}/${id}` when the submitted id looks like a record id, else `base` (for the login redirect). */
export function recordPath(base: string, id: string | undefined): string {
  return id && RECORD_ID.test(id) ? `${base}/${id}` : base;
}

/** Signed-in admin for an action; signed-out visitors log in again and return to `path`. */
export async function requireAdminForAction(path: string): Promise<Viewer> {
  return requireRole("admin", path);
}

export type AdminActionOptions<S extends z.ZodType, R> = {
  formData: FormData;
  schema: S;
  /** The page to come back to after logging in again (sessions can expire mid-form). */
  path: (values: AdminFormValues) => string;
  run: (ctx: AppContext, viewer: Viewer, data: z.output<S>) => Promise<R>;
  /** The confirmation shown to the admin. */
  success: (result: R, data: z.output<S>) => string;
};

export async function runAdminAction<S extends z.ZodType, R>(options: AdminActionOptions<S, R>): Promise<AdminActionState> {
  const values = adminFormValues(options.formData);
  const viewer = await requireAdminForAction(options.path(values));
  const parsed = options.schema.safeParse(values);
  if (!parsed.success) return adminValidationFailure(parsed.error, values);

  let result: R;
  try {
    result = await options.run(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return adminActionFailure(error, values);
  }
  refreshAdminPages();
  return { ok: true, message: options.success(result, parsed.data) };
}
