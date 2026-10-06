import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { NotFound } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Booking not found" };

/** Unknown booking ids and other customers' bookings: the page never says which. */
export default function BookingNotFound() {
  return (
    <PageContainer size="narrow" padY={false} className="py-16 text-center sm:py-20">
      <NotFound decorative className="mx-auto w-48 sm:w-56" />
      <p className="mt-6 font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">Error 404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
        Booking not found
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
        You can open only your own reservations and bookings. The link may be mistyped, or it belongs to a different
        account.
      </p>
      <div className="mt-8 flex justify-center">
        <ButtonLink href="/bookings" leadingIcon={<CalendarCheck />}>
          See your bookings
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
