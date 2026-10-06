import {
  CalendarClock,
  Car,
  ClipboardList,
  Clock,
  FilePen,
  LifeBuoy,
  MapPin,
  RefreshCw,
  Star,
  Truck,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import { cache, Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { BookingPhotos } from "@/components/media/booking-photos";
import { MechanicGalleryStrip } from "@/components/media/mechanic-gallery-strip";
import { AnimatedCheck } from "@/components/motion/animated-check";
import { SlideUp } from "@/components/motion/entrance";
import { Callout } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { DescriptionList } from "@/components/ui/description-list";
import { JumpLink } from "@/components/ui/jump-link";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastOnMount } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import type { CustomerBookingDetail } from "@/server/customer/booking-views";
import { getMyBooking } from "@/server/customer/reservations";

import { DetailGrid, DetailItem, Panel } from "../../_components/facts";
import { MechanicFacts, MechanicIdentity } from "../../_components/mechanic-profile";
import { PriceBreakdown } from "../../_components/price-breakdown";
import { ServiceAreaMap } from "../../_components/service-area-map";
import { StripSearchParam } from "../../_components/strip-search-param";
import { formatCalendarDate, formatDuration, formatSlotRange } from "../../_lib/display";
import { firstParam, loadOr404, recordIdOr404, recordTitle } from "../../_lib/load";
import { BookingProgress } from "./_components/booking-progress";
import { CancelReservationDialog } from "./_components/cancel-reservation-dialog";
import { ChangeOrders } from "./_components/change-orders";
import { ConsentRecord } from "./_components/consent-record";
import { ContactPanel } from "./_components/contact-panel";
import { InvoiceCard } from "./_components/invoice-card";
import { PaymentPanel } from "./_components/payment-panel";
import { ReviewSection } from "./_components/review-section";

type BookingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// One load per request render, shared by generateMetadata and the page.
const loadBooking = cache(async (id: string) => {
  const viewer = await requireRole("customer", `/bookings/${id}`);
  return getMyBooking(createAppContext(), viewer, id);
});

export async function generateMetadata({ params }: Pick<BookingPageProps, "params">): Promise<Metadata> {
  const title = await recordTitle((await params).id, async (id) => (await loadBooking(id)).title, "Your booking");
  return { title };
}

/** Booking states that come after a confirmed booking (only seeded bookings reach them while payments are off). */
const POST_BOOKING_STATUSES = new Set(["confirmed", "in_progress", "completed", "disputed"]);

function customerAddressText(booking: CustomerBookingDetail): string | null {
  const address = booking.serviceLocation.customerAddress;
  if (!address) return null;
  const line = [address.streetAddress, [address.city, address.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  return line || null;
}

function StatusNotice({ booking, justReserved }: { booking: CustomerBookingDetail; justReserved: boolean }) {
  if (booking.status === "pending_payment" && justReserved) {
    return (
      <section
        aria-labelledby="reserved-title"
        className="glass glow-border aurora relative flex flex-col items-center gap-5 overflow-hidden rounded-3xl px-5 py-7 text-center sm:flex-row sm:px-8 sm:text-left"
      >
        <ToastOnMount title="Reservation created" description="Online payments are coming soon: you weren't charged." />
        <StripSearchParam name="reserved" />
        <AnimatedCheck size={64} tone="success" />
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-success-700 uppercase">Reservation created</p>
          <h2 id="reserved-title" className="font-display text-2xl font-semibold tracking-tight text-fg">
            {booking.mechanic.displayName} has your reservation
          </h2>
          <p className="max-w-2xl text-pretty text-fg-muted">
            We told {booking.mechanic.displayName} about your reservation. Online payments are coming soon, so it
            isn&rsquo;t a confirmed booking yet and you haven&rsquo;t been charged.
          </p>
        </div>
      </section>
    );
  }
  if (booking.status === "cancelled") {
    return (
      <Callout
        tone="info"
        title="This reservation was cancelled"
        actions={
          <ButtonLink href={`/request?from=${booking.requestId}`} variant="secondary" size="sm" leadingIcon={<RefreshCw />}>
            Request again
          </ButtonLink>
        }
      >
        <p>
          {booking.progress.cancelledAt ? `Cancelled ${formatDateTime(booking.progress.cancelledAt, booking.timeZone)}. ` : null}
          You weren&rsquo;t charged, so there&rsquo;s nothing to refund.
          {booking.progress.cancelReason ? ` Reason: ${booking.progress.cancelReason}` : null}
        </p>
      </Callout>
    );
  }
  const awaitingDecision = booking.changeOrders.filter((order) => order.canDecide).length;
  if (awaitingDecision > 0) {
    return (
      <Callout
        tone="warning"
        title={awaitingDecision === 1 ? "Extra work needs your approval" : `${awaitingDecision} extra jobs need your approval`}
        actions={
          <JumpLink href="#change-orders" size="sm" leadingIcon={<FilePen />}>
            Review {awaitingDecision === 1 ? "the change order" : "the change orders"}
          </JumpLink>
        }
      >
        <p>
          {booking.mechanic.displayName} found more work than the quote covers. Nothing extra is done or charged
          unless you approve it.
        </p>
      </Callout>
    );
  }
  if (booking.canReview) {
    return (
      <Callout
        tone="success"
        title="The work is done: how did it go?"
        actions={
          <JumpLink href="#review" size="sm" leadingIcon={<Star />}>
            Write a review
          </JumpLink>
        }
      >
        <p>{booking.mechanic.displayName} completed this job. Your review helps other drivers choose.</p>
      </Callout>
    );
  }
  return null;
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const id = recordIdOr404((await params).id);
  const booking = await loadOr404(() => loadBooking(id));
  const justReserved = firstParam((await searchParams).reserved) === "1";
  const pending = booking.status === "pending_payment";
  const postBooking = POST_BOOKING_STATUSES.has(booking.status);
  const address = customerAddressText(booking);
  const confirmed = booking.progress.confirmedAt !== null;

  return (
    <PageContainer size="wide">
      <PageHeader
        back={{ href: "/bookings", label: "All bookings" }}
        eyebrow={confirmed ? "Booking" : "Reservation"}
        title={booking.title}
        meta={
          <>
            <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
            <span className="text-sm text-fg-muted">
              {confirmed ? "Booked" : "Reserved"} {formatDateTime(booking.createdAt, booking.timeZone)}
            </span>
          </>
        }
        actions={
          <>
            {booking.canCancel ? (
              <CancelReservationDialog bookingId={booking.id} mechanicName={booking.mechanic.displayName} />
            ) : null}
            <ButtonLink href={`/requests/${booking.requestId}`} variant="secondary" leadingIcon={<ClipboardList />}>
              View request
            </ButtonLink>
            <ButtonLink href={`/support?bookingId=${booking.id}`} variant="ghost" leadingIcon={<LifeBuoy />}>
              Get help
            </ButtonLink>
          </>
        }
      />

      <SlideUp className="mt-6 empty:hidden">
        <StatusNotice booking={booking} justReserved={justReserved} />
      </SlideUp>

      {/* Phones read the service summary, then payment and contact (the side column), then the
          rest; from 1024px the side column sits beside both. */}
      <div className="mt-8 grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <SlideUp className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Panel title="Service summary" titleId="service-title" eyebrow="Your mechanic" bodyClassName="space-y-6">
            <MechanicIdentity mechanic={booking.mechanic} size="lg" nameAs="h3" />
            <MechanicFacts mechanic={booking.mechanic} />
            <Suspense fallback={null}>
              <MechanicGalleryStrip mechanicId={booking.mechanic.id} />
            </Suspense>
            <DetailGrid className="border-t border-line pt-5">
              <DetailItem icon={<CalendarClock />} label="When">
                {formatSlotRange(booking.slotStartAt, booking.slotEndAt, booking.timeZone)}
              </DetailItem>
              <DetailItem icon={<Clock />} label="Estimated duration">
                About {formatDuration(booking.terms.estimatedDurationMinutes)}
              </DetailItem>
              <DetailItem icon={booking.serviceMode === "mobile" ? <Truck /> : <Warehouse />} label="Where">
                {booking.serviceLocation.label}
                {booking.serviceMode === "mobile" ? (
                  <span className="block text-fg-muted">{address ? `Your address: ${address}` : "Your address wasn't given yet."}</span>
                ) : booking.contactVisibility !== "visible" ? (
                  <span className="block text-fg-muted">The exact garage address is shared once the booking is confirmed.</span>
                ) : null}
              </DetailItem>
              <DetailItem icon={<MapPin />} label="Approximate area">
                {booking.request.areaLabel}
              </DetailItem>
              <DetailItem icon={<Car />} label="Vehicle">
                {booking.vehicleLabel}
              </DetailItem>
              <DetailItem icon={<Wrench />} label="Service">
                {booking.categoryName}
                <span className="block text-fg-muted">
                  Preferred {formatCalendarDate(booking.request.preferredDate)} · {booking.request.preferredWindowLabel}
                </span>
              </DetailItem>
            </DetailGrid>
            <blockquote className="rounded-2xl border-l-2 border-neon-cyan/70 bg-surface-2/50 px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">The problem you described</p>
              <p className="mt-1 text-sm whitespace-pre-line text-pretty text-fg">{booking.request.description}</p>
            </blockquote>
          </Panel>
        </SlideUp>

        <SlideUp
          as="aside"
          delay={0.1}
          aria-label="Payment, contact and progress"
          className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <PaymentPanel booking={booking} />
          <ContactPanel booking={booking} />
          <BookingProgress booking={booking} />
          <ConsentRecord consent={booking.consent} timeZone={booking.timeZone} />
        </SlideUp>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          {booking.status !== "cancelled" ? (
            <SlideUp delay={0.06}>
              <Panel title="Service area" titleId="booking-map-title" eyebrow="Approximate">
                <ServiceAreaMap
                  requestArea={booking.request.approxLocation}
                  requestAreaLabel={booking.request.areaLabel}
                  mechanic={booking.mechanic}
                  mode={booking.serviceMode === "mobile" ? "mobile" : "garage"}
                  confirmed={booking.contactVisibility === "visible"}
                />
              </Panel>
            </SlideUp>
          ) : null}

          <Panel
            title="Itemized price"
            titleId="price-title"
            eyebrow="Frozen at booking"
            description={`Frozen ${formatDateTime(booking.terms.snapshotTakenAt, booking.timeZone)} from the quote you accepted. It can't change; extra work needs a change order.`}
            bodyClassName="space-y-5"
          >
            <PriceBreakdown
              caption="Itemized price of this booking"
              lines={booking.lineItems}
              totals={booking.money}
              currency={booking.money.currency}
              partsIncluded={booking.terms.partsIncluded}
              platformFee={{ bps: booking.money.platformFeeBps, cents: booking.money.platformFeeCents }}
              totalLabel={pending ? "You pay" : "Total"}
              animateTotal
            />
            <DescriptionList
              items={[
                { term: "What's included", description: <p className="whitespace-pre-line">{booking.terms.scope}</p> },
                ...(booking.terms.exclusions
                  ? [{ term: "Not included", description: <p className="whitespace-pre-line">{booking.terms.exclusions}</p> }]
                  : []),
                ...(booking.terms.notes
                  ? [{ term: "Notes", description: <p className="whitespace-pre-line">{booking.terms.notes}</p> }]
                  : []),
                { term: "Quote sent", description: formatDateTime(booking.terms.quotedAt, booking.timeZone) },
              ]}
            />
          </Panel>

          {postBooking ? <ChangeOrders booking={booking} /> : null}
          {postBooking ? (
            <Suspense fallback={<Skeleton className="h-48 rounded-3xl" />}>
              <BookingPhotos bookingId={booking.id} viewerRole="customer" />
            </Suspense>
          ) : null}
          {booking.invoice ? <InvoiceCard invoice={booking.invoice} timeZone={booking.timeZone} /> : null}
          {postBooking ? <ReviewSection booking={booking} /> : null}
        </div>
      </div>
    </PageContainer>
  );
}
