import { Ban, CreditCard, Receipt, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { NoBookings } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { milesBetween } from "@/components/map/geo";
import { BookingPhotos } from "@/components/media/booking-photos";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import { getMyBooking, type MyBookingDetail } from "@/server/mechanic/bookings";

import { AreaMap } from "../../_components/area-map";
import { EmptyPanel, MechanicHero } from "../../_components/hud";
import { TAP_BUTTONS } from "../../_components/tap";
import { formatSlotRange } from "../../_lib/display";
import { BOOKING_TONE } from "../../_lib/map-data";
import { BookingTimeline } from "./_components/booking-timeline";
import { wasConfirmed } from "./_components/booking-state";
import { ChangeOrdersSection } from "./_components/change-orders-section";
import { CustomerCard } from "./_components/customer-card";
import { InvoiceSection } from "./_components/invoice-section";
import { JobTermsCard } from "./_components/job-terms-card";
import { MediaSection } from "./_components/media-section";
import { NextStepCard } from "./_components/next-step-card";
import { HelpCard, PayoutCard, ScheduleCard } from "./_components/side-cards";

export const metadata: Metadata = { title: "Booking" };

type BookingPageProps = { params: Promise<{ id: string }> };

function StatusNotice({ tone, icon, title, children }: { tone: "warning" | "danger" | "info"; icon: ReactNode; title: string; children: ReactNode }) {
  const styles = {
    warning: "border-warning-600/40 [&_svg]:text-warning-600",
    danger: "border-danger-600/40 [&_svg]:text-danger-600",
    info: "border-neon-cyan/30 [&_svg]:text-neon-cyan",
  }[tone];
  return (
    <div role="note" className={`glass-lite flex gap-3 rounded-2xl border p-4 sm:p-5 ${styles}`}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-fg">{title}</p>
        <div className="text-sm text-fg-muted">{children}</div>
      </div>
    </div>
  );
}

function hasStatusNotice(booking: MyBookingDetail): boolean {
  return booking.status === "pending_payment" || booking.status === "cancelled" || booking.status === "disputed";
}

function StatusNotices({ booking }: { booking: MyBookingDetail }) {
  if (booking.status === "pending_payment") {
    return (
      <StatusNotice tone="warning" icon={<CreditCard />} title="The customer reserved this quote - awaiting their payment">
        <p>
          The reservation stays pending until the customer pays, and online payments are coming soon. It isn&rsquo;t a
          confirmed job yet: don&rsquo;t travel or buy parts for it.
        </p>
      </StatusNotice>
    );
  }
  if (booking.status === "cancelled") {
    return (
      <StatusNotice tone="info" icon={<Ban />} title={wasConfirmed(booking) ? "This booking was cancelled" : "This reservation was cancelled"}>
        <p>
          {booking.cancelledAt ? `Cancelled ${formatDateTime(booking.cancelledAt, booking.timeZone)}. ` : null}
          {booking.cancelReason ? `Reason: ${booking.cancelReason}` : null}
        </p>
      </StatusNotice>
    );
  }
  if (booking.status === "disputed") {
    return (
      <StatusNotice tone="danger" icon={<TriangleAlert />} title="This booking is disputed">
        <p>An admin is reviewing it. The payout is on hold until the dispute is resolved.</p>
      </StatusNotice>
    );
  }
  return null;
}

export default async function MechanicBookingPage({ params }: BookingPageProps) {
  const { id } = await params;
  const viewer = await requireRole("mechanic", `/mechanic/bookings/${id}`);
  let booking: MyBookingDetail;
  try {
    booking = await getMyBooking(createAppContext(), viewer, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const confirmed = wasConfirmed(booking);
  const distanceMiles = booking.base ? milesBetween(booking.base.point, booking.approxPoint) : 0;

  return (
    <PageContainer size="wide">
      <MechanicHero
        back={{ href: "/mechanic/jobs?tab=bookings", label: "Bookings" }}
        eyebrow={booking.categoryName}
        title={booking.request.vehicle.label}
        meta={
          <>
            <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
            {booking.payout.status !== "not_eligible" ? <Badge tone={booking.payout.tone}>Payout: {booking.payout.label}</Badge> : null}
          </>
        }
        description={`${formatSlotRange(booking.slotStartAt, booking.slotEndAt, booking.timeZone)} · ${booking.serviceLocation}`}
      />

      {hasStatusNotice(booking) ? (
        <div className="mt-6">
          <StatusNotices booking={booking} />
        </div>
      ) : null}

      {/* DOM order is the phone order (the next step first, then progress and the job, then
          schedule/payout/help); on wide screens the next step and the side cards share the
          right column. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8">
        <div className="animate-slide-up lg:col-start-2 lg:row-start-1">
          <NextStepCard booking={booking} />
        </div>

        <div className="stagger-children min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <BookingTimeline booking={booking} />
          <CustomerCard booking={booking} />
          <AreaMap
            title="Service area"
            description={
              booking.customer
                ? "ZIP-center area only. The exact address is in the customer card above."
                : "ZIP-center area only: the exact address is shared after a confirmed booking."
            }
            approxPoint={booking.approxPoint}
            areaLabel={booking.areaLabel}
            distanceMiles={distanceMiles}
            base={booking.base}
            tone={BOOKING_TONE[booking.status]}
            pulse={booking.status === "confirmed" || booking.status === "in_progress"}
          />
          <JobTermsCard booking={booking} />
          <MediaSection booking={booking} />
          {confirmed ? (
            <div className={TAP_BUTTONS}>
              <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
                <BookingPhotos bookingId={booking.id} viewerRole="mechanic" />
              </Suspense>
            </div>
          ) : null}
          {booking.status === "pending_payment" ? (
            <EmptyPanel
              titleAs="h2"
              art={<NoBookings decorative className="w-40 sm:w-48" />}
              title={
                <span className="inline-flex items-center gap-2">
                  <Receipt aria-hidden="true" className="size-5 text-neon-cyan" />
                  Job tools unlock after a confirmed booking
                </span>
              }
            >
              Starting, completing, before and after photos, change orders and the final invoice become available once the
              customer pays and the booking is confirmed. Online payments are coming soon.
            </EmptyPanel>
          ) : confirmed ? (
            <>
              <ChangeOrdersSection booking={booking} />
              <InvoiceSection booking={booking} />
            </>
          ) : null}
        </div>

        <aside aria-label="Schedule, payout and help" className="space-y-6 lg:col-start-2 lg:row-start-2">
          <ScheduleCard booking={booking} />
          <PayoutCard booking={booking} />
          <HelpCard bookingId={booking.id} />
        </aside>
      </div>
    </PageContainer>
  );
}
