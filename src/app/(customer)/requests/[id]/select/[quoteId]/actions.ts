"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseSelectQuoteForm } from "@/lib/validation/booking";
import { formStrings } from "@/lib/validation/request";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { fieldErrorsOf } from "@/server/customer/form-errors";
import { selectQuote, type SelectQuoteResult } from "@/server/customer/reservations";
import { isDomainError } from "@/server/errors";

import { STALE_FORM_MESSAGE } from "../../../../_lib/action-result";
import type { ReserveFormState } from "./reserve-form-state";

/**
 * Reserves the quote: the server re-checks the request, the quote and the mechanic, prices
 * it from the saved line items and creates a pending-payment reservation (never a
 * confirmed booking: payments aren't connected). On success the customer lands on it.
 */
export async function reserveQuoteAction(_previous: ReserveFormState, formData: FormData): Promise<ReserveFormState> {
  const viewer = await requireRole("customer", "/quotes");
  const acceptedConsentKeys = formStrings(formData, "acceptedConsentKeys");
  const parsed = parseSelectQuoteForm(formData);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "invalid_input",
      formError: parsed.fieldErrors.quoteId ? STALE_FORM_MESSAGE : null,
      fieldErrors: parsed.fieldErrors,
      acceptedConsentKeys,
    };
  }

  let result: SelectQuoteResult;
  try {
    result = await selectQuote(createAppContext(), viewer, parsed.data);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const fieldErrors = fieldErrorsOf(error);
    return {
      ok: false,
      code: error.code,
      formError: fieldErrors ? null : error.userMessage,
      fieldErrors: fieldErrors ?? {},
      acceptedConsentKeys,
    };
  }

  // The header's unread badge counts the "reservation created" notification.
  revalidatePath("/", "layout");
  redirect(`/bookings/${result.bookingId}?reserved=1`);
}
