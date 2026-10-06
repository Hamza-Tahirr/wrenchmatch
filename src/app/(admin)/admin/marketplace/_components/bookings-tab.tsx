import { WalletCards } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/ui/money";
import { BOOKING_STATUS_INFO, BOOKING_STATUSES, type BookingStatus } from "@/lib/domain";
import type { AdminBookingListItem } from "@/server/admin/booking-items";
import type { Paged } from "@/server/admin/types";

import { BookingInterventions, PAYMENTS_NOT_LIVE } from "../../_components/booking-interventions";
import { BookingStatusBadge, PayoutStatusBadge } from "../../_components/badges";
import { ConsoleEmpty, ConsoleNote } from "../../_components/console";
import { SegmentedLinks } from "../../_components/segmented-links";
import { Timestamp } from "../../_components/timestamp";
import { AdminPagination } from "../../_components/touch";
import { quoteModeLabel, slotLabel, withQuery } from "../../_lib/display";

function MoneyFact({ label, cents, currency, emphasis = false }: { label: string; cents: number; currency: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">{label}</dt>
      <dd className={emphasis ? "font-mono text-lg font-semibold text-neon-cyan tabular" : "font-mono text-fg tabular"}>
        <Money cents={cents} currency={currency} />
      </dd>
    </div>
  );
}

function BookingCard({ booking }: { booking: AdminBookingListItem }) {
  const summary = `${booking.vehicle} · ${booking.categoryName}`;
  return (
    <li>
      <article aria-labelledby={`booking-${booking.id}`} className="glass-lite card-hover relative space-y-4 rounded-2xl p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-violet/60 to-transparent"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 id={`booking-${booking.id}`} className="font-display text-base font-semibold text-fg">
              <Link href={`/admin/requests/${booking.requestId}`} className="underline-offset-4 transition-colors hover:text-neon-cyan hover:underline">
                {summary}
              </Link>
            </h3>
            <p className="text-sm text-fg-muted">
              <Link
                href={`/admin/mechanics/${booking.mechanic.id}`}
                className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
              >
                {booking.mechanic.displayName}
              </Link>{" "}
              for {booking.customer.displayName} · {quoteModeLabel(booking.serviceMode)} · {booking.areaLabel}
            </p>
            <p className="text-xs text-fg-subtle">{slotLabel(booking.slotStartAt, booking.slotEndAt, booking.timeZone)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <BookingStatusBadge status={booking.status} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <MoneyFact label="Customer total" cents={booking.totalCents} currency={booking.currency} emphasis />
          <MoneyFact label="Platform fee" cents={booking.platformFeeCents} currency={booking.currency} />
          <MoneyFact label="Mechanic payout" cents={booking.mechanicPayoutCents} currency={booking.currency} />
          <div>
            <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Payout status</dt>
            <dd className="mt-0.5">
              <PayoutStatusBadge status={booking.payoutStatus} />
            </dd>
          </div>
        </dl>
        {booking.cancelReason ? (
          <p className="rounded-xl border-l-2 border-danger-400/60 bg-fg/[0.03] px-3 py-2 text-sm text-fg-muted">
            <span className="font-medium text-fg">Cancelled:</span> {booking.cancelReason}
          </p>
        ) : null}
        <div className="border-t border-line pt-3">
          <BookingInterventions booking={booking} summary={summary} />
        </div>
      </article>
    </li>
  );
}

export function BookingsTab({
  page,
  status,
  bookedOnly,
}: {
  page: Paged<AdminBookingListItem>;
  status?: BookingStatus;
  bookedOnly: boolean;
}) {
  const href = (overrides: { status?: BookingStatus | null; bookedOnly?: boolean; page?: number }) =>
    withQuery("/admin/marketplace", {
      tab: "bookings",
      status: overrides.status === null ? undefined : (overrides.status ?? status),
      booked: overrides.bookedOnly ?? bookedOnly,
      page: overrides.page,
    });
  return (
    <div className="space-y-4">
      <ConsoleNote icon={<WalletCards />}>
        Admins can mark a confirmed job disputed, hold or release its payout, or cancel it. Reservations waiting for payment
        stay as they are: online payments are coming soon, and refunds and payouts are available once they launch.
      </ConsoleNote>
      <div className="flex flex-col gap-3">
        <SegmentedLinks
          label="Booking type"
          variant="segmented"
          current={bookedOnly ? "booked" : "all"}
          links={[
            { key: "all", label: "Every booking", href: href({ bookedOnly: false, page: 1 }) },
            { key: "booked", label: "Confirmed jobs", href: href({ bookedOnly: true, page: 1 }) },
          ]}
        />
        <SegmentedLinks
          label="Booking status"
          current={status ?? "all"}
          links={[
            { key: "all", label: "All statuses", href: href({ status: null, page: 1 }) },
            ...BOOKING_STATUSES.map((value) => ({
              key: value,
              label: BOOKING_STATUS_INFO[value].label,
              href: href({ status: value, page: 1 }),
            })),
          ]}
        />
      </div>
      {page.items.length > 0 ? (
        <ul className="stagger-children space-y-4" aria-label="Bookings, newest first">
          {page.items.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </ul>
      ) : (
        <ConsoleEmpty illustration="no-bookings" title="No bookings in this view">
          Reservations appear when customers select a quote; confirmed jobs appear here with their admin actions.
        </ConsoleEmpty>
      )}
      {page.totalPages > 1 ? (
        <AdminPagination
          label="Booking pages"
          page={page.page}
          totalPages={page.totalPages}
          prevHref={page.page > 1 ? href({ page: page.page - 1 }) : null}
          nextHref={page.page < page.totalPages ? href({ page: page.page + 1 }) : null}
        />
      ) : null}
    </div>
  );
}

export function ReservationsTab({ reservations, timeZone, now }: { reservations: readonly AdminBookingListItem[]; timeZone: string; now: Date }) {
  return (
    <div className="space-y-4">
      <ConsoleNote icon={<WalletCards />} tone="warning" title="Online payments are coming soon">
        These reservations stay pending payment: nothing can confirm them yet (a database rule enforces it), nothing was
        charged, and contact details stay hidden from both parties.
      </ConsoleNote>
      {reservations.length > 0 ? (
        <ul className="stagger-children space-y-4" aria-label="Reservations pending payment, oldest first">
          {reservations.map((booking) => (
            <li key={booking.id}>
              <article
                aria-labelledby={`reservation-${booking.id}`}
                className="glass-lite card-hover flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5"
              >
                <div className="min-w-0 space-y-1">
                  <h3 id={`reservation-${booking.id}`} className="font-display text-base font-semibold text-fg">
                    <Link
                      href={`/admin/requests/${booking.requestId}`}
                      className="underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                    >
                      {booking.vehicle} · {booking.categoryName}
                    </Link>
                  </h3>
                  <p className="text-sm text-fg-muted">
                    {booking.customer.displayName} reserved{" "}
                    <Link
                      href={`/admin/mechanics/${booking.mechanic.id}`}
                      className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
                    >
                      {booking.mechanic.displayName}
                    </Link>
                    &rsquo;s quote <Timestamp iso={booking.createdAt} timeZone={timeZone} format="relative" now={now} />
                  </p>
                  <p className="text-xs text-fg-subtle">{slotLabel(booking.slotStartAt, booking.slotEndAt, booking.timeZone)}</p>
                  <p className="text-xs text-fg-subtle">{PAYMENTS_NOT_LIVE}</p>
                </div>
                <div className="shrink-0 space-y-1 sm:text-right">
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <BookingStatusBadge status={booking.status} />
                  </div>
                  <p className="font-mono text-xl font-semibold text-neon-cyan text-glow tabular">
                    <Money cents={booking.totalCents} currency={booking.currency} />
                  </p>
                  <p className="text-xs text-fg-subtle">
                    incl. platform fee <Money cents={booking.platformFeeCents} currency={booking.currency} className="font-mono" />
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <ConsoleEmpty illustration="no-bookings" title="No reservations waiting for payment">
          When a customer selects a quote, the reservation waits here as pending payment.
        </ConsoleEmpty>
      )}
    </div>
  );
}
