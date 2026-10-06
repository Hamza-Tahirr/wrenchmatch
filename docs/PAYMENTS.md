# Payments: the Stripe boundary

**Status in this build: not connected.** WrenchMatch shows the full price breakdown of a
reservation, but it collects no card details, calls no payment API and moves no money.
There is no Stripe package installed, no webhook route and no simulated payment. Every
customer- and mechanic-facing screen that would involve money says
**"Payments coming soon — Stripe not connected"**.

This document describes the integration point that exists now, exactly what is blocked,
and how the payments phase (Stripe Connect + hosted Checkout, per `MVP_PLAN.md` section 9)
plugs in without rewriting request, quote or booking logic.

## 1. What works today

* Selecting a quote creates a **pending-payment reservation**: a `bookings` row with
  `status = 'pending_payment'`, `payment_state = 'stripe_not_connected'`,
  `payout_status = 'not_eligible'`, an immutable quote snapshot and consent snapshot, and
  money computed on the server by `src/server/pricing.ts` (integer cents).
* The reservation page shows labor, parts, tax and fee lines, the total, and the
  **provisional platform fee (10% of labor, `PLATFORM_FEE_BPS = 1000`)**. The fee is
  included in the customer total and deducted from the mechanic payout
  (`mechanic_payout = total − platform_fee`, before payment-processing costs).
* Seeded **demo fixtures** (`is_demo_fixture = 1`, `payment_state =
  'demo_fixture_no_real_payment'`) are inserted directly in confirmed / in-progress /
  completed states so the post-booking screens can be inspected. They carry a visible DEMO
  badge and no real payment. Their payout states are demo values.

## 2. The integration point

```
src/server/payments/
  types.ts           PaymentGateway interface, Result<T>, PAYMENT_ACTIONS and DTO types
  not-connected.ts   notConnectedGateway: the only implementation in this build
  index.ts           getPaymentGateway(), paymentBlockedError(action), re-exports
```

```ts
interface PaymentGateway {
  getStatus(): PaymentGatewayStatus; // connected?, UI label, blocked actions
  createCheckoutForBooking(bookingId: string): Promise<Result<CheckoutSession>>;
  createConnectOnboardingLink(mechanicId: string): Promise<Result<ConnectOnboardingLink>>;
  handleVerifiedEvent(event: VerifiedPaymentEvent): Promise<Result<HandledEvent>>;
  refundBooking(bookingId: string, amountCents: number, reason: string): Promise<Result<RefundReceipt>>;
  getPayoutStatus(bookingId: string): Promise<Result<PayoutInfo>>;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: "stripe_not_connected" };
```

`notConnectedGateway` answers every call with `{ ok: false, reason: "stripe_not_connected" }`
without inspecting its arguments: no network calls, no state changes, never a pretend
success. Callers must handle the failure branch; the usual pattern is:

```ts
const gateway = getPaymentGateway();
const checkout = await gateway.createCheckoutForBooking(booking.id);
if (!checkout.ok) throw paymentBlockedError("checkout"); // DomainError("payment_not_connected")
redirect(checkout.value.url); // payments phase only
```

UI code reads `getPaymentGateway().getStatus()` (or `PAYMENTS_NOT_CONNECTED_LABEL`) for the
copy and the list of blocked actions. Request, quote and booking modules never import a
payment SDK; only the gateway does.

## 3. What is blocked, and where it is enforced

| Payment action | Where it would happen | What happens now | Enforced by |
| --- | --- | --- | --- |
| **Checkout** (pay a pending reservation) | Reservation page `/bookings/[id]` | No card form or pay button; the gateway refuses | `notConnectedGateway`, UI copy |
| **Confirmation of reservations** (`pending_payment` → `confirmed`) | After a verified payment event | Impossible: the reservation stays pending and contact details stay hidden | DB trigger `bookings_payment_not_connected` (raises `payment_not_connected`); `bookings_insert_requires_pending_payment` for new rows |
| **Change-order payment** | Approved change orders on a booking | Approval is recorded; nothing is collected | `change_orders.payment_state` is only `stripe_not_connected` or a demo value; gateway |
| **Connect onboarding** (mechanic payout account) | `/mechanic/profile` | Not offered | Gateway refuses `createConnectOnboardingLink` |
| **Refunds** | Cancelling a paid booking | Nothing was charged, so nothing can be refunded | Gateway refuses `refundBooking` |
| **Payouts** | Mechanic payout status | Real bookings stay `not_eligible`; demo fixtures show labelled DEMO states | CHECK `is_demo_fixture = 1 OR payout_status = 'not_eligible'`; trigger `bookings_payout_requires_fixture` |
| **Webhooks** | Stripe → app event delivery | No webhook route exists | No route; gateway refuses `handleVerifiedEvent` |

Cancelling a pending reservation (`pending_payment` → `cancelled`) is allowed because no
money is involved.

## 4. The payments phase

The plan follows `MVP_PLAN.md`: Stripe Connect with Stripe-hosted onboarding, Stripe-hosted
Checkout, a **destination charge** with the platform fee as the **application fee**, charge
at booking, mechanic payout released after completion under the written payout policy
(Stripe is not an escrow service: confirm manual-payout availability and hold limits with
Stripe before launch). Work in Stripe test mode first.

### 4.1 Configuration

* Server-only keys in `.env.local`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Hosted
  Checkout needs no publishable key in the browser; never prefix secrets with `NEXT_PUBLIC_`.
* Add the `stripe` package and `src/server/payments/stripe-gateway.ts` implementing
  `PaymentGateway`. `getPaymentGateway()` returns it when the keys are configured, and
  `notConnectedGateway` otherwise. `getStatus().connected` becomes true only then.

### 4.2 Connect onboarding (mechanics)

* `createConnectOnboardingLink(mechanicId)` creates the connected account on first use and
  returns a Stripe-hosted Account Link (`account_onboarding`) with return/refresh URLs on
  `/mechanic/profile`. The app stores only the Stripe account id and capability flags,
  never identity or bank details.
* Account status comes from verified `account.updated` events (`charges_enabled`,
  `payouts_enabled`, outstanding requirements). Matching should then also require completed
  payout onboarding (MVP_PLAN section 5), as a new matching reason code.

### 4.3 Checkout (customers)

* `createCheckoutForBooking(bookingId)` runs for the reservation's customer (the Server
  Action checks the viewer; the gateway re-checks ownership and `status = 'pending_payment'`).
* Amounts come only from the `bookings` row (`total_cents`, `platform_fee_cents`), which
  `pricing.ts` computed from the saved quote items. No action schema accepts an amount.
* Create a Checkout Session in `payment` mode: line items from the quote snapshot,
  `payment_intent_data.application_fee_amount = platform_fee_cents`,
  `payment_intent_data.transfer_data.destination = <mechanic account>` (or separate charges
  and transfers if payouts must wait for completion), `metadata.booking_id`, an expiry, and
  an idempotency key such as `checkout:<bookingId>:<attempt>`. Store a `payments` row
  (`open`), then redirect to the session URL.
* The success page only says "payment processing": **a booking is confirmed by a verified
  webhook event, never by the browser returning from Checkout.**
* Decide how long a reservation holds its slot while Checkout is open, and what happens if
  the quote expires during checkout (MVP_PLAN test cases).

### 4.4 Webhooks

* New route `src/app/api/payments/stripe/webhook/route.ts`, `POST` only. Read the **raw
  body** with `await request.text()` and verify the `Stripe-Signature` header with
  `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` before parsing
  anything; answer 400 on failure. Only verified events reach
  `gateway.handleVerifiedEvent(event)`.
* **Idempotent:** in one `BEGIN IMMEDIATE` transaction, insert the event id into
  `stripe_webhook_events` (`ON CONFLICT DO NOTHING`); if it already existed, return 200
  without reprocessing. Otherwise apply the effect and mark the event processed.
* **Out-of-order safe:** handlers move state forward only (open → succeeded, never back),
  ignore events older than the last one applied to the same object
  (`payments.last_event_created_at`), and re-fetch the object from the Stripe API when the
  event alone is not authoritative. A late `payment_intent.payment_failed` after success,
  or a repeated `checkout.session.completed`, changes nothing.
* Respond quickly (Stripe retries for up to three days); reconcile payments and payouts with
  Stripe daily (MVP_PLAN section 9).
* Events to handle: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
  / `_failed`, `checkout.session.expired`, `payment_intent.payment_failed`,
  `charge.refunded` / `refund.updated`, `charge.dispute.created` / `.closed`,
  `account.updated`, and transfer/payout events for connected accounts.

### 4.5 Confirming a booking

On a verified successful payment covering the booking total, one transaction: mark the
`payments` row `succeeded`, move the booking `pending_payment` → `confirmed`
(`confirmed_at`), the request `reserved` → `booked`, notify both parties, reveal contact
details per the privacy matrix (`ARCHITECTURE.md` section 8), and record an audit event
(actor `system`, with the Stripe object ids).

### 4.6 Change orders, refunds and payouts

* **Change orders:** an approved change order is paid with a new Checkout Session or
  PaymentIntent (saving the payment method at the first checkout enables off-session
  charges), or captured with the final invoice; `change_orders.payment_state` gains real
  states, confirmed only by verified events.
* **Refunds:** `refundBooking(bookingId, amountCents, reason)` is admin- or policy-driven,
  limited to captured minus already-refunded amounts, uses an idempotency key and
  `reverse_transfer` / `refund_application_fee` as the cancellation policy says, writes a
  `refunds` row and an audit event, and takes its final status from `refund.updated` /
  `charge.refunded`.
* **Payouts:** `getPayoutStatus(bookingId)` reads the `payouts` row kept current by verified
  transfer/payout events. Admins can hold a payout during a documented dispute
  (`payout_status = 'held'`).

## 5. Database changes for the payments phase

A new migration (for example `db/migrations/0002_payments.sql`, or the Postgres port when
moving to hosted Supabase), followed by `npm run db:types`:

* **Replace the `bookings_payment_not_connected` trigger** with a verified-event
  transition: `pending_payment` → `confirmed` is allowed only when a `payments` row for the
  booking has `status = 'succeeded'` and an amount equal to `bookings.total_cents`.
* Extend `bookings.payment_state` beyond `stripe_not_connected` /
  `demo_fixture_no_real_payment` (e.g. `awaiting_payment`, `paid`, `partially_refunded`,
  `refunded`) and allow it to change only through that transition (today
  `bookings_snapshot_is_immutable` freezes it). SQLite cannot alter a CHECK constraint, so
  this means rebuilding the table, or doing it as part of the Postgres port.
* Replace `bookings_payout_requires_fixture` and the `payout_status = 'not_eligible'` CHECK
  for real bookings with updates driven by verified payout events (or move payout state into
  the `payouts` table).
* New tables:
  * `payments`: booking, Checkout Session id and PaymentIntent id (unique), amount and
    application fee in cents, currency, status, `last_event_created_at`, timestamps.
  * `refunds`: payment, Stripe refund id (unique), amount (cents, > 0), reason, requested
    by, status, timestamps.
  * `payouts`: booking, mechanic, Stripe transfer/payout ids, amount, status, arrival date.
  * `stripe_webhook_events`: Stripe event id (primary key), type, Stripe `created` time,
    received/processed timestamps, outcome.
  * `mechanic_payout_accounts`: mechanic, Stripe account id (unique), `charges_enabled`,
    `payouts_enabled`, requirements, updated time.

## 6. Before taking real payments

Confirm the Stripe account configuration (Connect model, destination charges, manual
payout holds), the cancellation/refund/no-show policy and mechanic payout agreement, tax
handling, and who bears processing fees (MVP_PLAN section 9 unit economics). Test in Stripe
test mode end to end, including duplicate and delayed webhooks (Stripe CLI
`stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`), failed payments,
expired quotes during checkout, refunds, disputes and payout holds.
