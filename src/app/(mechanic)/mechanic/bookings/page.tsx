import { redirect } from "next/navigation";

/** Bookings are listed on the job board's Bookings tab. */
export default function MechanicBookingsPage() {
  redirect("/mechanic/jobs?tab=bookings");
}
