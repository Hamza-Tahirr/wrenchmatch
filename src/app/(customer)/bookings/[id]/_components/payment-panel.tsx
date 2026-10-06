import { Wallet } from "lucide-react";

import { formatCents } from "@/lib/format";
import type { CustomerBookingDetail } from "@/server/customer/booking-views";

import { Panel } from "../../../_components/facts";
import { PaymentsSoon } from "../../../_components/payments-soon";
import { CountingMoney } from "../../../_components/price-breakdown";
import { formatBps } from "../../../_lib/display";

/**
 * What the customer pays and the honest payment state. A pending reservation shows the
 * checkout that would come next, disabled: online payments aren't live, so nothing can be
 * charged and the reservation can't become a confirmed booking. Nothing is ever shown as paid.
 */
export function PaymentPanel({ booking }: { booking: CustomerBookingDetail }) {
  const { money, payment } = booking;
  const pending = booking.status === "pending_payment";
  const invoiceDiffers = booking.invoice !== null && booking.invoice.totalCents !== money.totalCents;

  return (
    <Panel
      title="Payment"
      titleId="payment-title"
      eyebrow={pending ? "You pay" : "Quoted total"}
      actions={<Wallet aria-hidden="true" className="size-5 text-neon-cyan" />}
      className="glow-border"
      bodyClassName="space-y-4"
    >
      <div>
        <p className="font-mono text-4xl font-semibold tracking-tight text-fg tabular text-glow">
          <CountingMoney cents={money.totalCents} currency={money.currency} />
        </p>
        <p className="mt-1 text-sm text-fg-muted">Labor, parts, taxes and fees included</p>
      </div>
      <p className="rounded-2xl border border-line bg-surface-2/60 p-3 text-sm text-pretty text-fg-muted">
        Platform fee (provisional, {formatBps(money.platformFeeBps)} of labor):{" "}
        <strong className="font-mono font-semibold text-fg tabular">{formatCents(money.platformFeeCents, money.currency)}</strong>{" "}
        – included in your total and deducted from the mechanic&rsquo;s payout.
      </p>

      {invoiceDiffers && booking.invoice ? (
        <p className="text-sm text-pretty text-fg-muted">
          The final{" "}
          <a href="#invoice" className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800">
            invoice
          </a>{" "}
          comes to{" "}
          <strong className="font-mono font-semibold text-fg tabular">
            {formatCents(booking.invoice.totalCents, booking.invoice.currency)}
          </strong>
          {booking.invoice.approvedChangeOrderCount > 0 ? ", including the extra work you approved." : "."}
        </p>
      ) : null}

      {pending ? (
        <PaymentsSoon title={payment.label} id="booking-payments">
          <p>{payment.description}</p>
          <p className="mt-2">
            This reservation is <strong className="font-semibold text-fg">not a confirmed booking</strong>. Contact
            details stay hidden on both sides until it is.
          </p>
        </PaymentsSoon>
      ) : booking.status === "cancelled" ? (
        <p className="text-sm text-fg-muted">This reservation was cancelled. You weren&rsquo;t charged.</p>
      ) : (
        <PaymentsSoon title={payment.label} showCheckout={false} id="booking-payments">
          <p>{payment.description}</p>
        </PaymentsSoon>
      )}
    </Panel>
  );
}
