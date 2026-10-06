import "server-only";

import {
  PAYMENT_ACTIONS,
  type CheckoutSession,
  type ConnectOnboardingLink,
  type HandledEvent,
  type PaymentGateway,
  type PaymentGatewayStatus,
  type PayoutInfo,
  type RefundReceipt,
  type Result,
} from "./types";

export const PAYMENTS_NOT_CONNECTED_LABEL = "Online payments coming soon";

const STATUS: PaymentGatewayStatus = Object.freeze({
  provider: "stripe",
  connected: false,
  label: PAYMENTS_NOT_CONNECTED_LABEL,
  description:
    "Online payments are coming soon. No card details are collected and nothing is charged, refunded or paid out yet, so reservations stay pending payment.",
  blockedActions: PAYMENT_ACTIONS,
});

const NOT_CONNECTED = { ok: false, reason: "stripe_not_connected" } as const;

function notConnected<T>(): Promise<Result<T>> {
  return Promise.resolve(NOT_CONNECTED);
}

/**
 * The only gateway in this build. Every operation refuses with "stripe_not_connected"
 * without looking at its arguments: no network calls, no simulated success, no state change.
 */
export const notConnectedGateway: PaymentGateway = {
  getStatus: () => STATUS,
  createCheckoutForBooking: () => notConnected<CheckoutSession>(),
  createConnectOnboardingLink: () => notConnected<ConnectOnboardingLink>(),
  handleVerifiedEvent: () => notConnected<HandledEvent>(),
  refundBooking: () => notConnected<RefundReceipt>(),
  getPayoutStatus: () => notConnected<PayoutInfo>(),
};
