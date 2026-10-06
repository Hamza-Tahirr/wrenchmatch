import "server-only";

import type { MechanicStatus } from "@/lib/domain";

// Whether a mechanic can still be booked from a quote (ARCHITECTURE section 5: still
// approved, accepting jobs, insurance unexpired). Insurance must be valid today and on the
// day of the quoted slot, both in the request's time zone.

export type MechanicBookingFacts = {
  status: MechanicStatus;
  acceptingJobs: boolean;
  insuranceProvider: string | null;
  /** YYYY-MM-DD; the policy is valid through this day. */
  insuranceExpiresOn: string | null;
  /** An admin disabled the account. */
  accountDisabled: boolean;
};

export type BookingIneligibility = "not_approved" | "account_disabled" | "not_accepting_jobs" | "insurance";

export const MECHANIC_NOT_ELIGIBLE_MESSAGE =
  "This mechanic can't take new bookings right now, so this quote can't be reserved. Choose another quote.";

export function bookingIneligibility(
  mechanic: MechanicBookingFacts,
  dates: { todayLocal: string; slotDateLocal: string },
): BookingIneligibility | null {
  if (mechanic.status !== "approved") return "not_approved";
  if (mechanic.accountDisabled) return "account_disabled";
  if (!mechanic.acceptingJobs) return "not_accepting_jobs";
  const expiresOn = mechanic.insuranceExpiresOn;
  if (!expiresOn || !mechanic.insuranceProvider?.trim()) return "insurance";
  // YYYY-MM-DD strings compare in calendar order.
  if (expiresOn < dates.todayLocal || expiresOn < dates.slotDateLocal) return "insurance";
  return null;
}
