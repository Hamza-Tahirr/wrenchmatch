import { ArrowRight, CalendarClock, CircleCheck, Clock, Hourglass, Info, Package, Receipt, TriangleAlert, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { MyQuoteDetail } from "@/server/mechanic/jobs";

import { DetailGrid, DetailItem } from "../../../_components/facts";
import { HudLabel } from "../../../_components/hud";
import { LineItems } from "../../../_components/line-items";
import { ToastConfirmDialog } from "../../../_components/toast-actions";
import { formatDuration, formatSlotRange } from "../../../_lib/display";
import { withdrawQuoteAction } from "../../actions";

type StatusNoticeProps = { quote: MyQuoteDetail; bookingId: string | null; booked: boolean };

function Notice({
  tone,
  title,
  action,
  children,
}: {
  tone: "info" | "success" | "warning";
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    info: { box: "border-neon-cyan/25 bg-neon-cyan/5", icon: <Info className="text-neon-cyan" /> },
    success: { box: "border-success-600/35 bg-success-600/8", icon: <CircleCheck className="text-success-600" /> },
    warning: { box: "border-warning-600/35 bg-warning-600/8", icon: <TriangleAlert className="text-warning-600" /> },
  }[tone];
  return (
    <div role="note" className={cn("flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start", styles.box)}>
      <span aria-hidden="true" className="shrink-0 [&_svg]:size-5">
        {styles.icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <div className="text-sm text-fg-muted">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function StatusNotice({ quote, bookingId, booked }: StatusNoticeProps) {
  if (quote.status === "selected" && booked) {
    return (
      <Notice
        tone="success"
        title="Booked with you"
        action={
          bookingId ? (
            <ButtonLink href={`/mechanic/bookings/${bookingId}`} variant="secondary" size="sm" trailingIcon={<ArrowRight />}>
              Open the booking
            </ButtonLink>
          ) : null
        }
      >
        <p>The customer selected this quote and the booking is confirmed. Contact details and the job tools are on the booking page.</p>
      </Notice>
    );
  }
  switch (quote.status) {
    case "submitted":
      return (
        <Notice tone="info" title="Waiting for the customer">
          <p>
            The customer can select this quote until {formatDateTime(quote.expiresAt, quote.timeZone)}. Your offered time
            stays reserved for them until then.
          </p>
        </Notice>
      );
    case "selected":
      return (
        <Notice
          tone="warning"
          title="The customer reserved this quote - awaiting their payment"
          action={
            bookingId ? (
              <ButtonLink href={`/mechanic/bookings/${bookingId}`} variant="secondary" size="sm" trailingIcon={<ArrowRight />}>
                View reservation
              </ButtonLink>
            ) : null
          }
        >
          <p>
            Online payments are coming soon, so the reservation stays pending and isn&rsquo;t a confirmed job yet. The
            customer&rsquo;s contact details and exact address stay hidden until a booking is confirmed.
          </p>
        </Notice>
      );
    case "withdrawn":
      return (
        <Notice tone="info" title="You withdrew this quote">
          <p>
            {quote.withdrawnAt ? `Withdrawn ${formatDateTime(quote.withdrawnAt, quote.timeZone)}. ` : null}Its time slot is
            free again. You can send a new quote while the request is open.
          </p>
        </Notice>
      );
    case "expired":
      return (
        <Notice tone="info" title="This quote expired">
          <p>It wasn&rsquo;t selected before it expired, so its time slot was released.</p>
        </Notice>
      );
    case "declined":
      return (
        <Notice tone="info" title="Not selected">
          <p>The customer chose another quote or cancelled the request.</p>
        </Notice>
      );
  }
}

/** The mechanic's own quote on this job: terms, itemized price and status. */
export function MyQuoteCard({
  quote,
  bookingId,
  booked = false,
  title = "Your quote",
  highlight = false,
}: {
  quote: MyQuoteDetail;
  bookingId: string | null;
  /** The booking made from this quote is confirmed or later. */
  booked?: boolean;
  title?: string;
  /** Glow (the active quote right after it was sent). */
  highlight?: boolean;
}) {
  const titleId = `quote-${quote.id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn("glass-lite relative overflow-hidden rounded-2xl", highlight ? "glow-border shadow-glow" : null)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon-violet/60 to-transparent" />
      <div className="flex flex-col gap-4 px-4 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-neon-violet/10 text-neon-violet ring-1 ring-neon-violet/30 [&_svg]:size-5">
            <Receipt />
          </span>
          <div className="min-w-0 space-y-1">
            <HudLabel tone="muted">Sent {formatDateTime(quote.createdAt, quote.timeZone)}</HudLabel>
            <h3 id={titleId} className="font-display text-lg font-semibold tracking-tight text-fg">
              {title}
            </h3>
            <Badge tone={quote.statusTone}>{quote.statusLabel}</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 sm:text-right">
          <HudLabel tone="muted">Customer total</HudLabel>
          <p className="font-mono text-2xl font-semibold tracking-tight text-fg tabular">
            <Money cents={quote.totalCents} />
          </p>
        </div>
      </div>
      <div className="space-y-6 px-4 pt-5 pb-5 sm:px-6 sm:pb-6">
        <StatusNotice quote={quote} bookingId={bookingId} booked={booked} />
        <DetailGrid>
          <DetailItem icon={<CalendarClock />} label="Offered time">
            {formatSlotRange(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}
          </DetailItem>
          <DetailItem icon={<Clock />} label="Estimated duration">
            {formatDuration(quote.estimatedDurationMinutes)}
          </DetailItem>
          <DetailItem icon={<Wrench />} label="Where">
            {quote.serviceModeLabel}
          </DetailItem>
          <DetailItem icon={<Package />} label="Parts">
            {quote.partsIncluded ? "Included in the price" : "Not included (labor only)"}
          </DetailItem>
          <DetailItem icon={<Hourglass />} label="Valid until">
            {formatDateTime(quote.expiresAt, quote.timeZone)}
          </DetailItem>
        </DetailGrid>
        <LineItems
          caption="Quote line items"
          lines={quote.items}
          totals={{
            laborCents: quote.laborCents,
            partsCents: quote.partsCents,
            taxCents: quote.taxCents,
            feeCents: quote.feeCents,
            totalCents: quote.totalCents,
          }}
        />
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold text-fg">What the price covers</h4>
            <p className="mt-1 whitespace-pre-line text-fg-muted">{quote.scope}</p>
          </div>
          {quote.exclusions ? (
            <div>
              <h4 className="font-semibold text-fg">Exclusions</h4>
              <p className="mt-1 whitespace-pre-line text-fg-muted">{quote.exclusions}</p>
            </div>
          ) : null}
          {quote.notes ? (
            <div>
              <h4 className="font-semibold text-fg">Notes for the customer</h4>
              <p className="mt-1 whitespace-pre-line text-fg-muted">{quote.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
      {quote.canWithdraw ? (
        <div className="flex justify-end border-t border-line bg-surface-2/40 px-4 py-3 sm:px-6">
          <ToastConfirmDialog
            trigger="Withdraw quote"
            tone="danger"
            title="Withdraw this quote?"
            description="The customer can no longer select it and its time slot is released. You can send a new quote while the request is open."
            confirmLabel="Withdraw quote"
            pendingLabel="Withdrawing…"
            action={withdrawQuoteAction}
            hiddenFields={{ quoteId: quote.id }}
            successToast={{ title: "Quote withdrawn", description: "Its time slot is free again." }}
          />
        </div>
      ) : null}
    </section>
  );
}
