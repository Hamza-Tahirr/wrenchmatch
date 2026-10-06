import { ClipboardList } from "lucide-react";

import { NotFound } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button-link";

import { HudLabel } from "../../_components/hud";

/** Shown for unknown booking ids and for bookings of other mechanics. */
export default function MechanicBookingNotFound() {
  return (
    <PageContainer size="narrow" padY={false} className="py-12 text-center sm:py-16">
      <div className="glass aurora relative overflow-hidden rounded-3xl px-5 py-10 sm:px-10">
        <NotFound decorative className="mx-auto w-52 sm:w-60" />
        <HudLabel className="mt-4 block">No record on this channel</HudLabel>
        <h1 className="holo-text mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Booking not found</h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
          You can open only your own bookings. The link may be mistyped or belong to another account.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/mechanic/jobs?tab=bookings" leadingIcon={<ClipboardList />}>
            See your bookings
          </ButtonLink>
        </div>
      </div>
    </PageContainer>
  );
}
