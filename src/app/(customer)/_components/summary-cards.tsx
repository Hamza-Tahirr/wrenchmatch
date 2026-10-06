import { ArrowUpRight, CalendarClock, FilePen, MapPin, Receipt, Star, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatDate, pluralize } from "@/lib/format";
import type { CustomerBookingSummary } from "@/server/customer/booking-views";
import type { RequestSummary } from "@/server/customer/request-views";

import { formatSlotStart } from "../_lib/display";
import { Fact, FactList } from "./facts";

// Clickable summary cards for the request and booking lists (/quotes, /bookings, /account).
// Each card has one link (its title), stretched over the whole card.

function CardShell({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <li
      className={cn(
        "glass-lite card-hover group relative rounded-3xl p-5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-neon-cyan sm:p-6",
        highlight && "border-neon-cyan/35 shadow-[0_0_36px_-16px_var(--color-neon-cyan)]",
      )}
    >
      <ArrowUpRight
        aria-hidden="true"
        className="absolute top-5 right-5 size-5 text-fg-subtle transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neon-cyan"
      />
      {children}
    </li>
  );
}

function StretchedLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none">
      {children}
    </Link>
  );
}

function quoteCountsText(request: RequestSummary): string {
  if (request.quoteCount === 0) return "No quotes yet";
  const parts = [
    request.liveQuoteCount > 0 ? `${pluralize(request.liveQuoteCount, "quote")} to compare` : null,
    request.expiredQuoteCount > 0 ? `${request.expiredQuoteCount} expired` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  // Still taking quotes, with none live or expired: every quote so far was withdrawn.
  if (request.status === "open" || request.status === "quoted") {
    return `No quotes to compare yet · ${request.quoteCount} withdrawn`;
  }
  return `${pluralize(request.quoteCount, "quote")} received`;
}

/** A repair request in a list: status, match and quote counts, lowest price. */
export function RequestSummaryCard({ request, headingLevel = 3 }: { request: RequestSummary; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const actionable = request.status === "quoted" && request.liveQuoteCount > 0;
  return (
    <CardShell highlight={actionable}>
      <div className="flex flex-col gap-4 pr-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={request.statusTone}>{request.statusLabel}</Badge>
          </div>
          <Heading className="font-display text-lg font-semibold text-pretty text-fg">
            <StretchedLink href={`/requests/${request.id}`}>{request.title}</StretchedLink>
          </Heading>
          <FactList>
            <Fact icon={<MapPin />}>{request.areaLabel}</Fact>
            <Fact icon={<CalendarClock />}>Sent {formatDate(request.submittedAt ?? request.createdAt, request.timeZone)}</Fact>
            <Fact icon={<Users />}>
              {request.matchedCount > 0
                ? `Sent to ${pluralize(request.matchedCount, "mechanic")}`
                : request.status === "open"
                  ? "Nobody notified yet · our team was alerted"
                  : "Nobody was notified"}
            </Fact>
          </FactList>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className={cn("text-sm font-medium", actionable ? "text-brand-800" : "text-fg-muted")}>{quoteCountsText(request)}</p>
          {request.lowestLiveQuoteCents !== null ? (
            <p className="text-sm text-fg-subtle">
              from{" "}
              <Money cents={request.lowestLiveQuoteCents} className="font-mono text-lg font-semibold text-fg text-glow" />
            </p>
          ) : null}
          {request.booking ? (
            <p className="mt-1 text-sm text-fg-subtle">
              {request.booking.statusLabel} ·{" "}
              <Money cents={request.booking.totalCents} currency={request.booking.currency} className="font-mono text-fg" />
            </p>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}

/** A reservation or booking in a list: mechanic, slot, total and what needs attention. */
export function BookingSummaryCard({ booking, headingLevel = 3 }: { booking: CustomerBookingSummary; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <CardShell highlight={booking.pendingChangeOrderCount > 0 || booking.canReview}>
      <div className="flex flex-col gap-4 pr-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
            {booking.pendingChangeOrderCount > 0 ? (
              <Badge tone="warning" icon={<FilePen />}>
                {pluralize(booking.pendingChangeOrderCount, "change order")} to approve
              </Badge>
            ) : null}
            {booking.canReview ? (
              <Badge tone="info" icon={<Star />}>
                Review to write
              </Badge>
            ) : null}
            {booking.hasInvoice ? <Badge icon={<Receipt />}>Invoice</Badge> : null}
          </div>
          <Heading className="font-display text-lg font-semibold text-pretty text-fg">
            <StretchedLink href={`/bookings/${booking.id}`}>{booking.title}</StretchedLink>
          </Heading>
          <FactList>
            <Fact icon={<Users />}>{booking.mechanicDisplayName}</Fact>
            <Fact icon={<CalendarClock />}>{formatSlotStart(booking.slotStartAt, booking.timeZone)}</Fact>
            <Fact icon={<MapPin />}>{booking.serviceModeLabel}</Fact>
          </FactList>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="font-mono text-2xl font-semibold text-fg tabular text-glow">
            <Money cents={booking.totalCents} currency={booking.currency} />
          </p>
          <p className="text-xs text-fg-subtle">
            {booking.status === "pending_payment"
              ? "Payment pending · online payments coming soon"
              : booking.status === "cancelled"
                ? "Cancelled · not charged"
                : "Online payment: coming soon"}
          </p>
        </div>
      </div>
    </CardShell>
  );
}
