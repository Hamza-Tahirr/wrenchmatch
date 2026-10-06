import { ArrowDown, ArrowLeft, CalendarCheck, CalendarClock, Car, Clock, MapPin, ScrollText, Truck, Warehouse } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MechanicGalleryStrip } from "@/components/media/mechanic-gallery-strip";
import { SlideUp } from "@/components/motion/entrance";
import { Callout } from "@/components/ui/alert";
import { ButtonContent, buttonClasses } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { formatCents } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { getReservationPreview } from "@/server/customer/reservations";

import { ExpiryCountdown } from "../../../../_components/expiry-countdown";
import { DetailGrid, DetailItem, Panel } from "../../../../_components/facts";
import { MechanicFacts, MechanicIdentity } from "../../../../_components/mechanic-profile";
import { PaymentsSoon } from "../../../../_components/payments-soon";
import { CountingMoney, PriceBreakdown } from "../../../../_components/price-breakdown";
import { ServiceAreaMap } from "../../../../_components/service-area-map";
import { StickyActionBar } from "../../../../_components/sticky-action-bar";
import { formatBps, formatDuration, formatSlotRange } from "../../../../_lib/display";
import { loadOr404, recordIdOr404 } from "../../../../_lib/load";
import { quoteTerms } from "../../_components/quote-card";
import { ReserveForm } from "./_components/reserve-form";

export const metadata: Metadata = { title: "Review and reserve" };

type SelectQuotePageProps = {
  params: Promise<{ id: string; quoteId: string }>;
};

const STEPS = ["Review", "Agree", "Reserve"] as const;

export default async function SelectQuotePage({ params }: SelectQuotePageProps) {
  const raw = await params;
  const requestId = recordIdOr404(raw.id);
  const quoteId = recordIdOr404(raw.quoteId);
  const viewer = await requireRole("customer", `/requests/${requestId}/select/${quoteId}`);
  const ctx = createAppContext();
  const preview = await loadOr404(() => getReservationPreview(ctx, viewer, quoteId));
  if (preview.request.id !== requestId) notFound();

  const { request, quote, money } = preview;
  const backHref = `/requests/${request.id}#quotes`;
  const mechanicName = quote.mechanic.displayName;
  const now = ctx.now.toISOString();
  const alreadyReserved = preview.existingBookingId !== null;
  const reservable = quote.isSelectable && !alreadyReserved;

  return (
    <PageContainer size="wide">
      <PageHeader
        back={{ href: backHref, label: "Back to quotes" }}
        eyebrow={request.title}
        title={
          reservable ? (
            <>
              Review and <span className="holo-text">reserve</span>
            </>
          ) : (
            "Quote details"
          )
        }
        description={
          reservable
            ? `Check the details of ${mechanicName}'s quote, then reserve it. The price comes from the quote's saved line items, and you won't be charged.`
            : alreadyReserved
              ? `You've reserved ${mechanicName}'s quote. Its details are below for reference.`
              : `${mechanicName}'s quote can't be reserved any more. Its details are below for reference.`
        }
      />

      {reservable ? (
        <ol aria-label="Reserving takes three steps" className="mt-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-wide uppercase sm:gap-2">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5 sm:gap-2">
              <span className="glass-lite inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-fg-muted sm:gap-2 sm:pr-3">
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-brand-600 font-mono text-xs text-on-brand">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < STEPS.length - 1 ? <span aria-hidden="true" className="h-px w-3 bg-line-strong sm:w-6" /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {alreadyReserved ? (
        <Callout
          tone="info"
          title="You've already reserved this quote"
          className="mt-6"
          actions={
            <ButtonLink href={`/bookings/${preview.existingBookingId}`} size="sm" leadingIcon={<CalendarCheck />}>
              View your reservation
            </ButtonLink>
          }
        >
          <p>There&rsquo;s nothing more to do here.</p>
        </Callout>
      ) : null}
      {!reservable && !alreadyReserved ? (
        <Callout
          tone="danger"
          title="This quote can't be reserved"
          className="mt-6"
          actions={
            <ButtonLink href={backHref} variant="secondary" size="sm" leadingIcon={<ArrowLeft />}>
              Back to your quotes
            </ButtonLink>
          }
        >
          <p>{quote.unavailableReason ?? "It's no longer available."}</p>
        </Callout>
      ) : null}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <SlideUp
          as="aside"
          aria-label="Reservation summary"
          className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
        >
          <div className="glass glow-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
            <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-neon-cyan/15 blur-3xl" />
            <p className="font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">
              {reservable ? "You pay" : "Quoted total"}
            </p>
            <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-fg tabular text-glow sm:text-5xl">
              <CountingMoney cents={money.totalCents} currency={money.currency} />
            </p>
            <p className="mt-1 text-sm text-fg-muted">Labor, parts, taxes and fees included</p>
            <p className="mt-4 rounded-2xl border border-line bg-surface-2/60 p-3 text-sm text-pretty text-fg-muted">
              Platform fee (provisional, {formatBps(money.platformFeeBps)} of labor):{" "}
              <strong className="font-mono font-semibold text-fg tabular">{formatCents(money.platformFeeCents, money.currency)}</strong>{" "}
              – included in your total and deducted from the mechanic&rsquo;s payout.
            </p>
            {quote.status === "submitted" ? (
              <ExpiryCountdown
                expiresAt={quote.expiresAt}
                startedAt={quote.quotedAt}
                now={now}
                timeZone={quote.timeZone}
                className="mt-4"
              />
            ) : null}
          </div>
          <PaymentsSoon title={preview.payment.label} checkoutLabel="Pay securely online" id="reserve-payments">
            <p>{preview.payment.description}</p>
          </PaymentsSoon>
        </SlideUp>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <SlideUp>
            <Panel title="The service" titleId="reserve-service-title" eyebrow="Step 1 · Review" bodyClassName="space-y-6">
              <MechanicIdentity mechanic={quote.mechanic} size="lg" nameAs="h3" />
              <MechanicFacts mechanic={quote.mechanic} />
              <Suspense fallback={null}>
                <MechanicGalleryStrip mechanicId={quote.mechanic.id} />
              </Suspense>
              <DetailGrid className="border-t border-line pt-5">
                <DetailItem icon={<CalendarClock />} label="When">
                  {formatSlotRange(quote.slotStartAt, quote.slotEndAt, quote.timeZone)}
                </DetailItem>
                <DetailItem icon={<Clock />} label="Estimated duration">
                  About {formatDuration(quote.estimatedDurationMinutes)}
                </DetailItem>
                <DetailItem icon={quote.serviceMode === "mobile" ? <Truck /> : <Warehouse />} label="Where">
                  {quote.serviceMode === "mobile" ? "At your location (mobile service)" : "At the mechanic's garage"}
                  <span className="block text-fg-muted">
                    {quote.serviceMode === "mobile"
                      ? `Your address is shared with ${mechanicName} only once the booking is confirmed.`
                      : `${quote.mechanic.areaLabel}. The exact address is shared once the booking is confirmed.`}
                  </span>
                </DetailItem>
                <DetailItem icon={<MapPin />} label="Your area">
                  {request.areaLabel}
                </DetailItem>
                <DetailItem icon={<Car />} label="Vehicle">
                  {request.vehicle.label}
                </DetailItem>
              </DetailGrid>
            </Panel>
          </SlideUp>

          <SlideUp delay={0.06}>
            <Panel title="Service area" titleId="reserve-map-title" eyebrow="Approximate">
              <ServiceAreaMap
                requestArea={preview.requestArea}
                requestAreaLabel={request.areaLabel}
                mechanic={quote.mechanic}
                mode={quote.serviceMode === "mobile" ? "mobile" : "garage"}
              />
            </Panel>
          </SlideUp>

          <SlideUp delay={0.1}>
            <Panel
              title="Itemized price"
              titleId="reserve-price-title"
              eyebrow="Computed on the server"
              description="From the quote's saved line items: nothing on this page can change the price."
            >
              <PriceBreakdown
                caption={`Itemized price of ${mechanicName}'s quote`}
                lines={quote.lineItems}
                totals={quote.totals}
                currency={quote.currency}
                partsIncluded={quote.partsIncluded}
                platformFee={{ bps: money.platformFeeBps, cents: money.platformFeeCents }}
                totalLabel={reservable ? "You pay" : "Total"}
                animateTotal
              />
            </Panel>
          </SlideUp>

          <Panel title="Scope and terms" titleId="reserve-terms-title" eyebrow="What you agree to" bodyClassName="space-y-5">
            <DescriptionList items={quoteTerms(quote)} />
            <div className="rounded-2xl border border-line bg-surface-2/50 p-4 text-sm text-fg-muted">
              <h3 className="flex items-center gap-2 font-semibold text-fg">
                <ScrollText aria-hidden="true" className="size-4 text-neon-cyan" />
                Provisional cancellation policy
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>While online payments are coming soon, you can cancel a pending reservation at any time from its page.</li>
                <li>Nothing has been charged, so there is nothing to refund. The mechanic is told and their time slot is freed.</li>
                <li>
                  Cancelling a reservation also closes this request; to choose a different quote afterwards, send a new
                  request.
                </li>
                <li>The final cancellation and refund policy will be written and reviewed before payments launch.</li>
              </ul>
            </div>
            <p className="text-sm text-fg-muted">
              If the mechanic finds a hidden fault, any extra work needs a separate estimate (a change order) that you
              approve first.
            </p>
          </Panel>

          {/* When the quote can't be reserved, the notice under the header says why instead. */}
          {reservable ? (
            <div id="reserve" className="scroll-mt-24">
              <Panel
                title="Agree and reserve"
                titleId="reserve-confirm-title"
                eyebrow="Steps 2 and 3"
                className="glow-border"
              >
                <ReserveForm
                  quoteId={quote.id}
                  backHref={backHref}
                  consents={preview.consents}
                  submitLabel={`Reserve ${mechanicName}'s quote`}
                />
              </Panel>
            </div>
          ) : null}
        </div>
      </div>

      {/* Phones and tablets: the total and a way to the agreements stay one tap away. */}
      {reservable ? (
        <StickyActionBar targetId="reserve" label="Reserve this quote">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-subtle">You pay · not charged now</p>
            <p className="font-mono text-lg font-semibold text-fg tabular">
              <Money cents={money.totalCents} currency={money.currency} />
            </p>
          </div>
          <a href="#reserve" className={buttonClasses({ size: "lg", className: "shrink-0" })}>
            <ButtonContent trailingIcon={<ArrowDown />}>Agree &amp; reserve</ButtonContent>
          </a>
        </StickyActionBar>
      ) : null}
    </PageContainer>
  );
}
