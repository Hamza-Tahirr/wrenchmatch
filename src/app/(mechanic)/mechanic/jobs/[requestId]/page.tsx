import { ShieldAlert, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessDenied, Success } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { AnimatedCheck } from "@/components/motion/animated-check";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { ToastOnMount } from "@/components/ui/toast";
import { formatMiles } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import { getJobDetail, type JobDetail } from "@/server/mechanic/jobs";

import { AreaMap } from "../../_components/area-map";
import { EmptyPanel, HudLabel, MechanicHero } from "../../_components/hud";
import { JumpLink } from "@/components/ui/jump-link";
import { requestModeText } from "../../_lib/display";
import { AVAILABILITY_TONE } from "../../_lib/map-data";
import { JobDetailsCard } from "./_components/job-details-card";
import { PhotosSection } from "./_components/photos-section";
import { PrivacyCard } from "./_components/privacy-card";
import { QuoteSection } from "./_components/quote-section";
import { StatusCard } from "./_components/status-card";

export const metadata: Metadata = { title: "Job details" };

type JobDetailPageProps = {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A matched mechanic whose account isn't approved sees why, and no request details. */
function NotEligible({ message }: { message: string }) {
  return (
    <PageContainer size="narrow">
      <MechanicHero back={{ href: "/mechanic/jobs", label: "Job board" }} eyebrow="Job details" title="Job details aren't available" />
      <EmptyPanel
        className="mt-6"
        titleAs="h2"
        art={<AccessDenied decorative className="w-44 sm:w-52" />}
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldX aria-hidden="true" className="size-5 text-warning-600" />
            Your account can&rsquo;t open jobs right now
          </span>
        }
        action={
          <>
            <ButtonLink href="/mechanic/profile">Go to your profile</ButtonLink>
            <ButtonLink href="/mechanic/jobs" variant="secondary">
              Back to the job board
            </ButtonLink>
          </>
        }
      >
        <p>{message}</p>
      </EmptyPanel>
    </PageContainer>
  );
}

/** The confirmation after sending a quote (the redirect lands here with ?quote=sent). */
function QuoteSentPanel({ job }: { job: JobDetail }) {
  return (
    <section
      aria-labelledby="quote-sent-title"
      className="glass glow-border relative isolate mt-6 overflow-hidden rounded-3xl p-5 sm:p-6"
    >
      <ToastOnMount
        title="Quote sent"
        description={`The customer was notified about your quote for the ${job.vehicle.label}.`}
      />
      <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-success-600/15 blur-3xl" />
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <div aria-hidden="true" className="relative shrink-0 animate-scale-in">
          <Success decorative className="w-40" />
          <AnimatedCheck size={44} className="absolute right-0 bottom-3" />
        </div>
        <div role="status" className="min-w-0 space-y-2">
          <HudLabel>Transmission complete</HudLabel>
          <h2 id="quote-sent-title" className="font-display text-2xl font-semibold tracking-tight text-fg">
            Quote sent
          </h2>
          <p className="max-w-2xl text-sm text-fg-muted sm:text-base">
            The customer was notified and can compare it with other quotes. Your offered time is held until the quote
            expires.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            <JumpLink href="#job-quote-title" size="sm">
              Review your quote
            </JumpLink>
            <ButtonLink href="/mechanic/jobs?tab=quotes" size="sm" variant="secondary">
              All your quotes
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function JobDetailPage({ params, searchParams }: JobDetailPageProps) {
  const { requestId } = await params;
  const query = await searchParams;
  const viewer = await requireRole("mechanic", `/mechanic/jobs/${requestId}`);
  let job: JobDetail;
  try {
    job = await getJobDetail(createAppContext(), viewer, requestId);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    if (isDomainError(error) && error.code === "mechanic_not_eligible") return <NotEligible message={error.userMessage} />;
    throw error;
  }
  const quoteSent = query.quote === "sent" && job.myQuote?.status === "submitted";
  const booked = job.availability === "booked_with_you";

  return (
    <PageContainer size="wide">
      <MechanicHero
        back={{ href: "/mechanic/jobs", label: "Job board" }}
        eyebrow={job.category.name}
        title={job.vehicle.label}
        meta={
          <>
            <Badge tone={job.availabilityTone}>{job.availabilityLabel}</Badge>
            {job.category.safetySensitive ? (
              <Badge tone="warning" icon={<ShieldAlert />}>
                Safety-critical
              </Badge>
            ) : null}
            <span className="inline-flex items-center rounded-full border border-neon-violet/40 bg-neon-violet/10 px-2.5 py-0.5 font-mono text-xs text-fg tabular">
              {formatMiles(job.distanceMiles)} from your base
            </span>
          </>
        }
        description={`${job.areaLabel} · approximate area (ZIP center). ${job.preferredTimeLabel}.`}
      />

      {quoteSent ? <QuoteSentPanel job={job} /> : null}

      {/* DOM order is the phone order (response, the job, then the privacy note); on wide screens
          the response and the privacy note share the right column. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8">
        <div className="animate-slide-up lg:col-start-2 lg:row-start-1">
          <StatusCard job={job} />
        </div>
        <div className="stagger-children min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <AreaMap
            title="Where the job is"
            description="ZIP-center areas only: the exact address is shared after a confirmed booking."
            approxPoint={job.approxPoint}
            areaLabel={job.areaLabel}
            distanceMiles={job.distanceMiles}
            base={job.base}
            tone={AVAILABILITY_TONE[job.availability]}
            pulse={job.availability !== "unavailable"}
            footer={
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <HudLabel tone="muted">Service</HudLabel>
                {requestModeText(job.serviceMode, job.maxGarageDistanceMiles)}
              </p>
            }
          />
          <JobDetailsCard job={job} />
          <PhotosSection job={job} />
          <QuoteSection job={job} justSent={quoteSent} />
        </div>
        {/* Wide screens: stays in view beside the long quote form. */}
        <aside aria-label="Privacy" className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2">
          <PrivacyCard booked={booked} />
        </aside>
      </div>
    </PageContainer>
  );
}
