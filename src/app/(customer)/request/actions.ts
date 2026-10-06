"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { submitRepairRequestForm, type RequestFormState } from "@/server/customer/request-form";

/**
 * Sends the repair request: fields, photos and video are validated and stored together, the
 * request is matched, and the customer lands on its page, which states the actual number
 * of mechanics notified. A refused submission comes back with field errors and the values.
 */
export async function submitRequestAction(_previous: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const viewer = await requireRole("customer", "/request");
  const state = await submitRepairRequestForm(createAppContext(), viewer, formData);
  if (!state.ok) return state;
  // The header's unread badge counts the "request sent" notification.
  revalidatePath("/", "layout");
  redirect(`/requests/${state.requestId}?submitted=1`);
}
