import "server-only";

import { DomainError } from "@/server/errors";
import { notConnectedGateway } from "./not-connected";
import type { PaymentAction, PaymentGateway } from "./types";

export { notConnectedGateway, PAYMENTS_NOT_CONNECTED_LABEL } from "./not-connected";
export * from "./types";

/**
 * The payment gateway for this process. Always the not-connected gateway in this build;
 * the payments phase returns a Stripe gateway here once keys and webhooks are configured.
 */
export function getPaymentGateway(): PaymentGateway {
  return notConnectedGateway;
}

const BLOCKED_MESSAGES: Record<PaymentAction, string> = {
  checkout: "Online payments are coming soon, so this reservation can't be paid yet.",
  reservation_confirmation:
    "Online payments are coming soon, so a reservation stays pending and can't be confirmed yet.",
  change_order_payment: "Online payments are coming soon, so approved change orders can't be paid yet.",
  connect_onboarding: "Payout setup opens when online payments launch.",
  refund: "Refunds are available once online payments launch.",
  payout: "Payouts start when online payments launch.",
  webhook: "Payment events aren't accepted until online payments launch.",
};

/** DomainError("payment_not_connected") with a user-facing message for a blocked operation. */
export function paymentBlockedError(action: PaymentAction): DomainError {
  return new DomainError("payment_not_connected", BLOCKED_MESSAGES[action], { action });
}
