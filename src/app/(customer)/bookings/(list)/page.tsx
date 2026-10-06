import { CalendarCheck, CalendarClock, CheckCheck, ClipboardList, Wrench } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NoBookings } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Stagger } from "@/components/motion/stagger";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import type { CustomerBookingSummary } from "@/server/customer/booking-views";
import { listMyBookings } from "@/server/customer/reservations";

import { PaymentsSoon } from "../../_components/payments-soon";
import { StatTiles } from "../../_components/stat-tiles";
import { BookingSummaryCard } from "../../_components/summary-cards";

export const metadata: Metadata = { title: "Bookings" };

function BookingList({ bookings }: { bookings: readonly CustomerBookingSummary[] }) {
  return (
    <Stagger as="ul" className="space-y-4">
      {bookings.map((booking) => (
        <BookingSummaryCard key={booking.id} booking={booking} />
      ))}
    </Stagger>
  );
}

function ListSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">{eyebrow}</p>
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold tracking-tight text-fg">
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-pretty text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default async function BookingsPage() {
  const viewer = await requireRole("customer", "/bookings");
  const bookings = await listMyBookings(createAppContext(), viewer);

  const pending = bookings.filter((booking) => booking.status === "pending_payment");
  const upcoming = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "in_progress");
  const done = bookings.filter((booking) => booking.status === "completed" || booking.status === "disputed");
  const cancelled = bookings.filter((booking) => booking.status === "cancelled");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Reservations"
        title={
          <>
            Your <span className="holo-text">bookings</span>
          </>
        }
        description="Reservations and bookings with their full price breakdown. Online payments are coming soon, so a new reservation stays pending and you won't be charged."
      />

      {bookings.length > 0 ? (
        <StatTiles
          label="Your bookings at a glance"
          className="mt-8"
          items={[
            { label: "Pending reservations", value: pending.length, icon: <CalendarClock />, tone: "warning", hint: "Awaiting online payments" },
            { label: "Upcoming", value: upcoming.length, icon: <Wrench />, hint: "Confirmed or in progress" },
            { label: "Completed", value: done.length, icon: <CheckCheck />, tone: "success" },
            { label: "Change orders to approve", value: bookings.reduce((sum, booking) => sum + booking.pendingChangeOrderCount, 0), icon: <ClipboardList />, tone: "violet" },
          ]}
        />
      ) : null}

      <div className="mt-10 space-y-12">
        {bookings.length === 0 ? (
          <EmptyState
            illustration={<NoBookings decorative className="w-44 sm:w-52" />}
            title="No reservations yet"
            body="When you choose a quote and reserve it, the reservation appears here with its full price breakdown."
            action={
              <ButtonLink href="/quotes" leadingIcon={<ClipboardList />}>
                See your quotes
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ListSection
              id="pending"
              eyebrow="Awaiting payment"
              title="Pending reservations"
              description="Reserved quotes. Online payments are coming soon, so these stay pending: contact details stay hidden until a booking is confirmed."
            >
              {pending.length > 0 ? (
                <>
                  <BookingList bookings={pending} />
                  <PaymentsSoon showCheckout={false} title="Online payments are coming soon" id="bookings-payments">
                    <p>You won&rsquo;t be charged now. Checkout opens on each reservation once online payments launch.</p>
                  </PaymentsSoon>
                </>
              ) : (
                <EmptyState
                  headingLevel={3}
                  illustration={<NoBookings decorative className="w-36" />}
                  title="No pending reservations"
                  body="Reserve a quote from one of your requests and it will show up here."
                  action={
                    <ButtonLink href="/quotes" variant="secondary" leadingIcon={<ClipboardList />}>
                      See your quotes
                    </ButtonLink>
                  }
                />
              )}
            </ListSection>
            {upcoming.length > 0 ? (
              <ListSection
                id="upcoming"
                eyebrow="Confirmed"
                title="Upcoming and in progress"
                description="Your mechanic's contact details, change orders and photos are on each booking."
              >
                <BookingList bookings={upcoming} />
              </ListSection>
            ) : null}
            {done.length > 0 ? (
              <ListSection
                id="completed"
                eyebrow="Done"
                title="Completed"
                description="Invoices and reviews for finished jobs."
              >
                <BookingList bookings={done} />
              </ListSection>
            ) : null}
            {cancelled.length > 0 ? (
              <ListSection id="cancelled" eyebrow="Archive" title="Cancelled" description="Reservations you cancelled. You weren't charged.">
                <BookingList bookings={cancelled} />
              </ListSection>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-10 flex items-start gap-2 text-sm text-fg-subtle">
        <CalendarCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Nothing on this page has been charged online: online payments are coming soon.
      </p>
    </PageContainer>
  );
}
