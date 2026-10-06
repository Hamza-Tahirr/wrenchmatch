import { Activity } from "lucide-react";

import type { CustomerBookingDetail } from "@/server/customer/booking-views";

import { Panel } from "../../../_components/facts";
import { Timeline, type TimelineEntry } from "../../../_components/timeline";

function progressEntries(booking: CustomerBookingDetail): TimelineEntry[] {
  const { progress } = booking;
  const pending = booking.status === "pending_payment";
  const entries: TimelineEntry[] = [
    {
      id: "reserved",
      title: booking.isDemoFixture ? "Booked" : "Reserved",
      detail: pending ? "Payment pending: online payments are coming soon" : null,
      at: progress.reservedAt,
      tone: pending ? "warning" : "info",
    },
  ];

  if (booking.status === "cancelled") {
    entries.push({
      id: "cancelled",
      title: progress.confirmedAt ? "Booking cancelled" : "Reservation cancelled",
      detail: progress.cancelReason ? `Reason: ${progress.cancelReason}` : "You weren't charged.",
      at: progress.cancelledAt,
      tone: "neutral",
    });
    return entries;
  }

  entries.push(
    {
      id: "confirmed",
      title: "Confirmed",
      detail: progress.confirmedAt ? null : "Needs online payment, which is coming soon.",
      at: progress.confirmedAt,
      tone: "success",
      state: progress.confirmedAt ? "done" : "upcoming",
    },
    {
      id: "started",
      title: "Work started",
      at: progress.startedAt,
      tone: "info",
      state: progress.startedAt ? "done" : "upcoming",
    },
    {
      id: "completed",
      title: "Work completed",
      at: progress.completedAt,
      tone: "success",
      state: progress.completedAt ? "done" : "upcoming",
    },
  );
  if (booking.status === "disputed") {
    entries.push({ id: "disputed", title: "Disputed", detail: "Our team is looking into it.", tone: "danger" });
  }
  return entries;
}

/** Where the booking stands: reserved, confirmed, started, completed (or cancelled). */
export function BookingProgress({ booking }: { booking: CustomerBookingDetail }) {
  return (
    <Panel
      title="Progress"
      titleId="progress-title"
      eyebrow="Live status"
      actions={<Activity aria-hidden="true" className="size-5 text-neon-cyan" />}
    >
      <Timeline label="Booking progress" timeZone={booking.timeZone} entries={progressEntries(booking)} />
    </Panel>
  );
}
