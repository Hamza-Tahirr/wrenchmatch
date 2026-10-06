"use server";

import { revalidatePath } from "next/cache";

import { parseCancelReservationForm, parseChangeOrderDecisionForm, parseReviewForm } from "@/lib/validation/booking";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { formFailure } from "@/server/customer/form-errors";
import { decideChangeOrder, submitReview } from "@/server/customer/post-booking";
import { cancelReservation } from "@/server/customer/reservations";

import { actionFailure, firstFieldError, STALE_FORM_MESSAGE, type ActionResult } from "../../_lib/action-result";
import type { ReviewFormState } from "./review-form-state";

function refreshBookingPages(bookingId: string, requestId?: string): void {
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  revalidatePath("/account");
  if (requestId) {
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/quotes");
  }
}

/** Cancels a pending reservation (and its request); nothing was charged, so nothing is refunded. */
export async function cancelReservationAction(formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("customer", "/bookings");
  const parsed = parseCancelReservationForm(formData);
  if (!parsed.ok) return { ok: false, formError: firstFieldError(parsed.fieldErrors, STALE_FORM_MESSAGE) };
  let requestId: string;
  try {
    ({ requestId } = await cancelReservation(createAppContext(), viewer, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
  refreshBookingPages(parsed.data.bookingId, requestId);
  return { ok: true };
}

/** Approves or declines a change order on a confirmed booking; online payments for extra work are coming soon. */
export async function decideChangeOrderAction(formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("customer", "/bookings");
  const parsed = parseChangeOrderDecisionForm(formData);
  if (!parsed.ok) return { ok: false, formError: firstFieldError(parsed.fieldErrors, STALE_FORM_MESSAGE) };
  let bookingId: string;
  try {
    ({ bookingId } = await decideChangeOrder(createAppContext(), viewer, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
  refreshBookingPages(bookingId);
  return { ok: true };
}

function reviewValues(formData: FormData): ReviewFormState["values"] {
  const rating = formData.get("rating");
  const comment = formData.get("comment");
  return {
    rating: typeof rating === "string" ? rating.slice(0, 2) : undefined,
    comment: typeof comment === "string" ? comment.slice(0, 2000) : undefined,
  };
}

/** Leaves the one review allowed for a completed booking. */
export async function submitReviewAction(_previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const viewer = await requireRole("customer", "/bookings");
  const values = reviewValues(formData);
  const parsed = parseReviewForm(formData);
  if (!parsed.ok) {
    const formError = parsed.fieldErrors.bookingId ? STALE_FORM_MESSAGE : null;
    return { ok: false, formError, fieldErrors: parsed.fieldErrors, values };
  }
  try {
    await submitReview(createAppContext(), viewer, parsed.data);
  } catch (error) {
    const failure = formFailure(error, values);
    return { ok: false, formError: failure.formError, fieldErrors: failure.fieldErrors, values };
  }
  refreshBookingPages(parsed.data.bookingId);
  return { ok: true, formError: null, fieldErrors: {}, values: {} };
}
