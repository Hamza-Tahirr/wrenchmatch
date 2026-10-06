import { Banknote, CalendarClock, Clock, Flag, LifeBuoy, Lock, Play, Wallet, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { CountUp } from "../../../_components/count-up";
import { DetailItem } from "../../../_components/facts";
import { HudLabel, Panel } from "../../../_components/hud";
import { formatDuration, formatSlotRange } from "../../../_lib/display";
import { TAP } from "../../../_components/tap";
import { wasConfirmed } from "./booking-state";

/** Where the money would flow, step by step; the last step waits for online payments. */
function PayoutPipeline({ booking }: { booking: MyBookingDetail }) {
  const steps = [
    { label: "Job done", done: booking.status === "completed" || booking.completedAt !== null },
    { label: "Invoice", done: booking.invoice !== null },
    { label: "Payout", done: false, locked: true },
  ];
  return (
    <ol aria-label="Payout steps" className="grid grid-cols-3 gap-1.5">
      {steps.map((step) => (
        <li key={step.label} className="space-y-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "block h-1.5 rounded-full",
              step.done ? "bg-gradient-to-r from-success-600 to-neon-cyan shadow-[0_0_10px_var(--color-success-600)]" : "shimmer bg-surface-2",
            )}
          />
          <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-fg-subtle">
            {step.locked ? <Lock aria-hidden="true" className="size-3" /> : null}
            {step.label}
            <span className="sr-only">{step.done ? ": done" : step.locked ? ": starts when online payments launch" : ": not yet"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Payout status: no money moves until online payments launch. */
export function PayoutCard({ booking }: { booking: MyBookingDetail }) {
  const invoice = booking.invoice;
  const cancelled = booking.status === "cancelled";
  const amountLabel = invoice
    ? "Payout on the final invoice"
    : booking.status === "pending_payment"
      ? "Payout if the customer pays"
      : "Payout for the agreed job";
  return (
    <Panel id="payout" title="Payout" icon={<Wallet />} tone="success" bodyClassName="space-y-4">
      {cancelled ? (
        <p className="text-sm text-fg-muted">No payout: this {wasConfirmed(booking) ? "booking" : "reservation"} was cancelled.</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-success-600/30 bg-success-600/5 p-4">
          <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-success-600/15 blur-2xl motion-safe:animate-glow-pulse" />
          <HudLabel tone="muted">{amountLabel}</HudLabel>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-fg tabular text-glow">
            <CountUp value={invoice?.mechanicPayoutCents ?? booking.mechanicPayoutCents} format="cents" />
          </p>
          <p className="mt-1 text-xs text-fg-subtle">After the provisional platform fee, before payment-processing costs.</p>
        </div>
      )}
      <div className="space-y-2">
        <Badge tone={booking.payout.tone}>{booking.payout.label}</Badge>
        <p className="text-sm text-fg-muted">{booking.payout.note}</p>
      </div>
      {cancelled ? null : <PayoutPipeline booking={booking} />}
      <div className="space-y-2.5 rounded-xl border border-dashed border-line-strong p-3">
        <p className="text-sm font-medium text-fg">Payout account</p>
        <p className="text-sm text-fg-muted">{booking.payoutOnboarding.description}</p>
        <Button variant="secondary" disabled leadingIcon={<Banknote />} fullWidth className={TAP}>
          Set up payouts
        </Button>
      </div>
    </Panel>
  );
}

export function ScheduleCard({ booking }: { booking: MyBookingDetail }) {
  return (
    <Panel id="schedule" title="Schedule" icon={<CalendarClock />}>
      <dl className="space-y-4">
        <DetailItem icon={<CalendarClock />} label={wasConfirmed(booking) ? "Booked time" : "Reserved time"}>
          {formatSlotRange(booking.slotStartAt, booking.slotEndAt, booking.timeZone)}
        </DetailItem>
        <DetailItem icon={<Clock />} label="Estimated duration">
          {formatDuration(booking.job.estimatedDurationMinutes)}
        </DetailItem>
        <DetailItem icon={<Wrench />} label="Location">
          {booking.serviceLocation}
        </DetailItem>
        {booking.startedAt ? (
          <DetailItem icon={<Play />} label="Started">
            {formatDateTime(booking.startedAt, booking.timeZone)}
          </DetailItem>
        ) : null}
        {booking.completedAt ? (
          <DetailItem icon={<Flag />} label="Completed">
            {formatDateTime(booking.completedAt, booking.timeZone)}
          </DetailItem>
        ) : null}
      </dl>
    </Panel>
  );
}

export function HelpCard({ bookingId }: { bookingId: string }) {
  return (
    <Panel id="help" title="Need help?" icon={<LifeBuoy />} tone="violet" bodyClassName="space-y-3">
      <p className="text-sm text-fg-muted">Problems with this booking, the customer or a dispute? Our help desk can step in.</p>
      <ButtonLink href={`/support?bookingId=${bookingId}`} variant="secondary" leadingIcon={<LifeBuoy />} fullWidth className={TAP}>
        Get help
      </ButtonLink>
    </Panel>
  );
}
