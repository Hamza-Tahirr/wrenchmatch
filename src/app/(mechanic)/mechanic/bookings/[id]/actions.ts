"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult, MechanicFormState } from "@/lib/validation/mechanic";
import {
  changeOrderValuesFromFormData,
  invoiceValuesFromFormData,
  parseChangeOrderForm,
  parseInvoiceForm,
  type ChangeOrderFormValues,
} from "@/lib/validation/quote";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext, type Viewer } from "@/server/context";
import {
  completeJob,
  issueInvoice,
  proposeChangeOrder,
  startJob,
  withdrawChangeOrder,
} from "@/server/mechanic/booking-commands";

import { actionFailure, formFailure, MISSING_RECORD, MISSING_RECORD_MESSAGE, readId } from "../../_lib/action-state";

// Server Actions of /mechanic/bookings/[id]. Only seeded fixtures can be confirmed while
// payments are not connected, so in practice these act on seeded bookings; the domain
// functions and database triggers refuse anything a pending-payment reservation may not do.

const BOARD_PATH = "/mechanic/jobs";
const bookingPath = (bookingId: string) => `/mechanic/bookings/${bookingId}`;

function refreshBooking(bookingId: string): void {
  revalidatePath(bookingPath(bookingId));
  revalidatePath(BOARD_PATH);
}

/** Runs a one-click command on the booking named by the hidden input "bookingId". */
async function bookingAction(
  formData: FormData,
  run: (viewer: Viewer, bookingId: string) => Promise<unknown>,
  message: string,
): Promise<ActionResult> {
  const bookingId = readId(formData, "bookingId");
  const viewer = await requireRole("mechanic", bookingId ? bookingPath(bookingId) : BOARD_PATH);
  if (!bookingId) return MISSING_RECORD;
  try {
    await run(viewer, bookingId);
  } catch (error) {
    return actionFailure(error);
  }
  refreshBooking(bookingId);
  return { ok: true, message };
}

export async function startJobAction(formData: FormData): Promise<ActionResult> {
  return bookingAction(formData, (viewer, bookingId) => startJob(createAppContext(), viewer, bookingId), "Job started");
}

export async function completeJobAction(formData: FormData): Promise<ActionResult> {
  return bookingAction(
    formData,
    (viewer, bookingId) => completeJob(createAppContext(), viewer, bookingId),
    "Job marked complete",
  );
}

/** Issues the final invoice; the optional "notes" field comes from the confirm dialog. */
export async function issueInvoiceAction(formData: FormData): Promise<ActionResult> {
  const parsed = parseInvoiceForm(invoiceValuesFromFormData(formData));
  if (!parsed.ok) {
    return { ok: false, formError: parsed.fieldErrors.notes?.[0] ?? parsed.formError ?? "Check the invoice notes." };
  }
  return bookingAction(
    formData,
    (viewer, bookingId) => issueInvoice(createAppContext(), viewer, { bookingId, notes: parsed.data.notes }),
    "Invoice issued",
  );
}

export type ChangeOrderFormState = MechanicFormState<ChangeOrderFormValues>;

export async function proposeChangeOrderAction(
  _previous: ChangeOrderFormState,
  formData: FormData,
): Promise<ChangeOrderFormState> {
  const bookingId = readId(formData, "bookingId");
  const viewer = await requireRole("mechanic", bookingId ? bookingPath(bookingId) : BOARD_PATH);
  const values = changeOrderValuesFromFormData(formData);
  if (!bookingId) return { ok: false, formError: MISSING_RECORD_MESSAGE, values };
  const parsed = parseChangeOrderForm(values);
  if (!parsed.ok) return { ok: false, formError: parsed.formError, fieldErrors: parsed.fieldErrors, values };
  try {
    await proposeChangeOrder(createAppContext(), viewer, { ...parsed.data, bookingId });
  } catch (error) {
    return formFailure(error, values);
  }
  refreshBooking(bookingId);
  return { ok: true, message: "Change order sent for approval" };
}

export async function withdrawChangeOrderAction(formData: FormData): Promise<ActionResult> {
  const changeOrderId = readId(formData, "changeOrderId");
  const viewer = await requireRole("mechanic", BOARD_PATH);
  if (!changeOrderId) return MISSING_RECORD;
  let bookingId: string;
  try {
    ({ bookingId } = await withdrawChangeOrder(createAppContext(), viewer, changeOrderId));
  } catch (error) {
    return actionFailure(error);
  }
  refreshBooking(bookingId);
  return { ok: true, message: "Change order withdrawn" };
}
