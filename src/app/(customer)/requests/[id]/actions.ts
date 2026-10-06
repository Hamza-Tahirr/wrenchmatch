"use server";

import { revalidatePath } from "next/cache";

import { parseCancelRequestForm } from "@/lib/validation/request";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { cancelRequest } from "@/server/customer/requests";

import { actionFailure, firstFieldError, STALE_FORM_MESSAGE, type ActionResult } from "../../_lib/action-result";

/** Cancels one of the customer's open or quoted requests (its quotes are declined, mechanics told). */
export async function cancelRequestAction(formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("customer", "/quotes");
  const parsed = parseCancelRequestForm(formData);
  if (!parsed.ok) return { ok: false, formError: firstFieldError(parsed.fieldErrors, STALE_FORM_MESSAGE) };
  try {
    await cancelRequest(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath(`/requests/${parsed.data.requestId}`);
  revalidatePath("/quotes");
  revalidatePath("/account");
  return { ok: true };
}
