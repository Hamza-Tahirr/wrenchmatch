"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult, MechanicFormState } from "@/lib/validation/mechanic";
import { parseQuoteForm, quoteFormValuesFromFormData, type QuoteFormValues } from "@/lib/validation/quote";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { markInterested, passJob } from "@/server/mechanic/job-actions";
import { submitQuote, withdrawQuote } from "@/server/mechanic/quotes";

import { actionFailure, formFailure, MISSING_RECORD, MISSING_RECORD_MESSAGE, readId } from "../_lib/action-state";

// Server Actions of the job board and job detail: Interested, Not interested, send a quote
// and withdraw a quote. The request id travels in a hidden input; the domain functions
// check that the job is matched to this mechanic (anything else reads "not found").

const BOARD_PATH = "/mechanic/jobs";

const jobPath = (requestId: string) => `${BOARD_PATH}/${requestId}`;

function refreshJob(requestId: string): void {
  revalidatePath(BOARD_PATH);
  revalidatePath(jobPath(requestId));
}

export async function markInterestedAction(formData: FormData): Promise<ActionResult> {
  const requestId = readId(formData, "requestId");
  const viewer = await requireRole("mechanic", requestId ? jobPath(requestId) : BOARD_PATH);
  if (!requestId) return MISSING_RECORD;
  try {
    await markInterested(createAppContext(), viewer, requestId);
  } catch (error) {
    return actionFailure(error);
  }
  refreshJob(requestId);
  return { ok: true, message: "Saved to Interested" };
}

export async function passJobAction(formData: FormData): Promise<ActionResult> {
  const requestId = readId(formData, "requestId");
  const viewer = await requireRole("mechanic", requestId ? jobPath(requestId) : BOARD_PATH);
  if (!requestId) return MISSING_RECORD;
  try {
    await passJob(createAppContext(), viewer, requestId);
  } catch (error) {
    return actionFailure(error);
  }
  refreshJob(requestId);
  return { ok: true, message: "Job hidden from your board" };
}

export type QuoteFormState = MechanicFormState<QuoteFormValues>;

/**
 * Sends a quote. The browser never supplies a total: submitQuote prices the line items with
 * src/server/pricing.ts. On success the job page reloads with a confirmation.
 */
export async function submitQuoteAction(_previous: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const requestId = readId(formData, "requestId");
  const viewer = await requireRole("mechanic", requestId ? jobPath(requestId) : BOARD_PATH);
  const values = quoteFormValuesFromFormData(formData);
  if (!requestId) return { ok: false, formError: MISSING_RECORD_MESSAGE, values };
  const parsed = parseQuoteForm(values);
  if (!parsed.ok) return { ok: false, formError: parsed.formError, fieldErrors: parsed.fieldErrors, values };
  try {
    await submitQuote(createAppContext(), viewer, { ...parsed.data, requestId });
  } catch (error) {
    return formFailure(error, values);
  }
  refreshJob(requestId);
  redirect(`${jobPath(requestId)}?quote=sent`);
}

export async function withdrawQuoteAction(formData: FormData): Promise<ActionResult> {
  const quoteId = readId(formData, "quoteId");
  const viewer = await requireRole("mechanic", BOARD_PATH);
  if (!quoteId) return MISSING_RECORD;
  let requestId: string;
  try {
    ({ requestId } = await withdrawQuote(createAppContext(), viewer, quoteId));
  } catch (error) {
    return actionFailure(error);
  }
  refreshJob(requestId);
  return { ok: true, message: "Quote withdrawn" };
}
