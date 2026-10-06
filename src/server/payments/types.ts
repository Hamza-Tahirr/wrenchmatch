import "server-only";

import type { PayoutStatus } from "@/lib/domain";

// The integration point for payments (docs/PAYMENTS.md). Domain code depends only on
// PaymentGateway; this build ships a single implementation that is not connected, so every
// money-moving operation reports "stripe_not_connected". A Stripe implementation can be
// added behind getPaymentGateway() without changing request, quote or booking logic.

export type PaymentFailureReason = "stripe_not_connected";

/** Outcome of a gateway call. Callers must handle `ok: false`; nothing is ever simulated. */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: PaymentFailureReason };

/** Payment operations, used to explain what is blocked while Stripe is not connected. */
export const PAYMENT_ACTIONS = [
  "checkout",
  "reservation_confirmation",
  "change_order_payment",
  "connect_onboarding",
  "refund",
  "payout",
  "webhook",
] as const;
export type PaymentAction = (typeof PAYMENT_ACTIONS)[number];

export type PaymentGatewayStatus = {
  provider: "stripe";
  connected: boolean;
  /** Short UI label, e.g. "Online payments coming soon". */
  label: string;
  /** One-paragraph explanation for customers and mechanics. */
  description: string;
  /** Operations that are refused in the current state. */
  blockedActions: readonly PaymentAction[];
};

/** A hosted checkout page for a booking. Amounts always come from the server-side booking row. */
export type CheckoutSession = {
  sessionId: string;
  /** Provider-hosted page to send the customer to. */
  url: string;
  amountCents: number;
  /** Platform fee collected as the application fee (destination charge). */
  applicationFeeCents: number;
  currency: "USD";
  expiresAt: string;
};

/** A provider-hosted onboarding link for a mechanic's payout account. */
export type ConnectOnboardingLink = {
  url: string;
  expiresAt: string;
};

/**
 * A provider event whose signature has already been verified against the raw request
 * body. Unverified payloads must never reach the gateway.
 */
export type VerifiedPaymentEvent = {
  /** Provider event id; stored to make handling idempotent. */
  id: string;
  type: string;
  /** When the provider created the event (UTC ISO); used to ignore stale, out-of-order events. */
  createdAt: string;
  /** The event's object, as parsed from the verified body. */
  data: Readonly<Record<string, unknown>>;
};

export type HandledEvent = {
  eventId: string;
  /** True when this event id was already processed (a provider retry). */
  duplicate: boolean;
};

export type RefundReceipt = {
  refundId: string;
  bookingId: string;
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
};

export type PayoutInfo = {
  bookingId: string;
  status: PayoutStatus;
  amountCents: number;
  /** Expected or actual arrival date (YYYY-MM-DD), when known. */
  arrivalDate: string | null;
};

export interface PaymentGateway {
  /** Whether payments are connected, and what is blocked. No network calls. */
  getStatus(): PaymentGatewayStatus;
  /** Creates a hosted checkout for a pending-payment booking's server-computed total. */
  createCheckoutForBooking(bookingId: string): Promise<Result<CheckoutSession>>;
  /** Creates an onboarding link so a mechanic can set up payouts. */
  createConnectOnboardingLink(mechanicId: string): Promise<Result<ConnectOnboardingLink>>;
  /** Applies a signature-verified provider event (payment succeeded, refund updated...). */
  handleVerifiedEvent(event: VerifiedPaymentEvent): Promise<Result<HandledEvent>>;
  /** Refunds part or all of a paid booking. */
  refundBooking(bookingId: string, amountCents: number, reason: string): Promise<Result<RefundReceipt>>;
  /** The mechanic payout for a booking, as reported by the provider. */
  getPayoutStatus(bookingId: string): Promise<Result<PayoutInfo>>;
}
