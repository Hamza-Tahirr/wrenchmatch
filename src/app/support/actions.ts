"use server";

import { revalidatePath } from "next/cache";

import { parseSupportRequestForm } from "@/lib/validation/support";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { formFailure } from "@/server/customer/form-errors";
import { createSupportRequest } from "@/server/support/requests";

import type { SupportFormState, SupportFormValues } from "./support-form-state";

function submittedValues(formData: FormData): SupportFormValues {
  const text = (name: string, max: number) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.slice(0, max) : undefined;
  };
  return {
    topic: text("topic", 40),
    message: text("message", 4000),
    requestId: text("requestId", 64),
    bookingId: text("bookingId", 64),
  };
}

/** Opens a help request (customers and mechanics); the help desk replies on the same page. */
export async function createSupportRequestAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const viewer = await requireRole(["customer", "mechanic"], "/support");
  const values = submittedValues(formData);
  const parsed = parseSupportRequestForm(formData);
  if (!parsed.ok) return { ok: false, formError: null, fieldErrors: parsed.fieldErrors, values };
  try {
    await createSupportRequest(createAppContext(), viewer, parsed.data);
  } catch (error) {
    const failure = formFailure(error, values);
    return { ok: false, formError: failure.formError, fieldErrors: failure.fieldErrors, values };
  }
  revalidatePath("/support");
  revalidatePath("/account");
  // The header's unread badge counts the "we received your help request" notification.
  revalidatePath("/", "layout");
  return { ok: true, formError: null, fieldErrors: {}, values: {} };
}
