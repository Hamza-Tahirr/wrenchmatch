import "server-only";

import { PAYOUT_STATUS_INFO, type BadgeTone, type BookingStatus, type PayoutStatus } from "@/lib/domain";
import { getPaymentGateway } from "@/server/payments";

// Payout and payment wording for mechanics. Stripe is not connected: payout onboarding is not
// offered, real reservations stay pending payment, and payout states other than "not eligible"
// exist only on seeded fixtures. Presentation mode (docs/ARCHITECTURE.md section 11): no
// "demo" wording, and never anything that reads as money paid online; every payout note says
// payouts start when online payments launch.

export type PayoutOnboardingStatus = {
  connected: boolean;
  /** The gateway's own label ("Online payments coming soon"). */
  label: string;
  description: string;
};

export const PAYOUT_ACCOUNT_NOTICE = "Connect your payout account when online payments launch.";

/** Stripe Connect onboarding status for the mechanic's payout account, from the payment gateway. */
export function payoutOnboardingStatus(): PayoutOnboardingStatus {
  const status = getPaymentGateway().getStatus();
  return {
    connected: status.connected,
    label: status.label,
    description: status.connected
      ? status.description
      : `${PAYOUT_ACCOUNT_NOTICE} Until then no bank details are collected and nothing is paid out.`,
  };
}

export type PayoutView = {
  status: PayoutStatus;
  label: string;
  tone: BadgeTone;
  /** One honest line: where the payout stands and that payouts start with online payments. */
  note: string;
};

/** Mechanic-facing payout labels. Nothing is paid out before online payments launch. */
const PAYOUT_LABELS: Readonly<Record<PayoutStatus, string>> = {
  not_eligible: "Not eligible yet",
  pending: "Pending",
  // Only test data can reach "sent": no money moves while payments are not connected.
  sent: "Marked sent",
  failed: "Failed",
  held: "On hold",
};

export const NOT_YET_ELIGIBLE_LABEL = PAYOUT_LABELS.not_eligible;

/** "Payout: pending - payouts start when online payments launch." */
export function payoutNote(label: string): string {
  return `Payout: ${label.toLowerCase()} - payouts start when online payments launch.`;
}

/** A real reservation never reaches a payout state while payments are not connected. */
export const NO_PAYOUT_NOTE = "No payout yet - payouts start when online payments launch.";

export function payoutView(status: PayoutStatus, isDemoFixture: boolean): PayoutView {
  const label = PAYOUT_LABELS[status];
  return {
    status,
    label,
    tone: PAYOUT_STATUS_INFO[status].tone,
    note: isDemoFixture ? payoutNote(label) : NO_PAYOUT_NOTE,
  };
}

export const AWAITING_PAYMENT_NOTICE =
  "Awaiting the customer's payment - online payments are coming soon. This reservation stays pending, so the customer's contact details and exact address stay hidden.";

export const NO_ONLINE_PAYMENT_NOTICE = "No payment was taken online - online payments are coming soon.";

/**
 * The payment line shown on a booking, by status. Seeded fixtures were confirmed without any
 * payment, and a real reservation is never paid while payments are not connected.
 */
export function paymentNotice(status: BookingStatus): string {
  return status === "pending_payment" ? AWAITING_PAYMENT_NOTICE : NO_ONLINE_PAYMENT_NOTICE;
}
