import type { MyBookingDetail } from "@/server/mechanic/bookings";

/**
 * Whether the booking was ever confirmed. Only seeded fixtures can be while payments are not
 * connected, so a real reservation is pending payment or was cancelled before payment.
 */
export function wasConfirmed(booking: Pick<MyBookingDetail, "isDemoFixture" | "confirmedAt">): boolean {
  return booking.isDemoFixture || booking.confirmedAt !== null;
}
