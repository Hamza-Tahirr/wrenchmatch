import { CalendarCheck, Inbox, Receipt, Star, UserRound } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NoBookings, NoJobs, NoQuotes, NoRequests } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import type { MapLegendItem } from "@/components/map/map-legend";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMiles } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { listMyJobs, type JobBoard, type JobCard as JobCardData, type MyQuoteSummary } from "@/server/mechanic/jobs";

import { EligibilityCallout } from "../_components/eligibility-callout";
import { EmptyPanel, HudLabel, LiveDot, MechanicHero, NeonDivider } from "../_components/hud";
import { JobCard } from "../_components/job-card";
import { bearingDegrees, RadarArt, type RadarBlip } from "../_components/radar-art";
import { AVAILABILITY_TONE, BOOKING_TONE, QUOTE_TONE, type MapItem } from "../_lib/map-data";
import { BoardShell, type BoardMapView } from "./_components/board-shell";
import { BoardStats } from "./_components/board-stats";
import { isBoardTab, type BoardTab, type BoardTabItem } from "./_components/board-tab-keys";
import { BookingListItem } from "./_components/booking-list-item";
import { QuoteListItem } from "./_components/quote-list-item";

export const metadata: Metadata = { title: "Job board" };

type JobBoardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readTab(value: string | string[] | undefined): BoardTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return isBoardTab(raw) ? raw : "new";
}

const ACTIVE_BOOKING_STATUSES = new Set(["pending_payment", "confirmed", "in_progress"]);

/** Jobs the mechanic can still act on or is waiting on; booked and closed ones go below. */
const OPEN_JOB_AVAILABILITY = new Set<JobCardData["availability"]>(["open", "quoted_by_you", "selected_pending_payment"]);

/** Submitted quotes (they hold a time slot), then reserved ones, then the rest; newest first within each. */
function activeQuotesFirst(quotes: readonly MyQuoteSummary[]): MyQuoteSummary[] {
  const rank = (quote: MyQuoteSummary) => (quote.status === "submitted" ? 0 : quote.status === "selected" ? 1 : 2);
  return [...quotes].sort((a, b) => rank(a) - rank(b));
}

function JobCardGrid({ jobs, label }: { jobs: readonly JobCardData[]; label: string }) {
  return (
    <ul aria-label={label} className="stagger-children grid grid-cols-1 gap-4 2xl:grid-cols-2">
      {jobs.map((job) => (
        <JobCard key={job.requestId} job={job} />
      ))}
    </ul>
  );
}

type SplitCopy = {
  /** Prefix of the section heading ids. */
  id: string;
  /** Accessible name of the list when nothing is closed. */
  allLabel: string;
  openTitle: string;
  openLabel: string;
  openEmpty: string;
  closedTitle: string;
  closedHint: string;
  closedLabel: string;
};

const NEW_COPY: SplitCopy = {
  id: "new",
  allLabel: "New job matches",
  openTitle: "Open for quotes",
  openLabel: "New job matches open for quotes",
  openEmpty: "No new matches are open for quotes right now. You get a notification when one arrives.",
  closedTitle: "No longer open",
  closedHint: "Another mechanic was chosen or the customer closed the request. There is nothing to do on these.",
  closedLabel: "New matches that are no longer open",
};

const INTERESTED_COPY: SplitCopy = {
  id: "interested",
  allLabel: "Jobs you're interested in or quoted",
  openTitle: "Open jobs",
  openLabel: "Open jobs you're interested in or quoted",
  openEmpty: "No open jobs here right now. New matches appear in the first tab.",
  closedTitle: "Booked and closed",
  closedHint: "Booked with you, or no longer open for quotes. Bookings have their own tab.",
  closedLabel: "Booked and closed jobs",
};

/** Jobs still open to act on first; booked, taken and closed ones below a divider. */
function SplitJobs({ jobs, copy }: { jobs: readonly JobCardData[]; copy: SplitCopy }) {
  const open = jobs.filter((job) => OPEN_JOB_AVAILABILITY.has(job.availability));
  const closed = jobs.filter((job) => !OPEN_JOB_AVAILABILITY.has(job.availability));
  if (closed.length === 0) return <JobCardGrid jobs={open} label={copy.allLabel} />;
  return (
    <div className="space-y-8">
      <section aria-labelledby={`${copy.id}-open-title`} className="space-y-4">
        <h2 id={`${copy.id}-open-title`} className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          {copy.openTitle} <span className="font-mono text-sm font-normal text-fg-subtle">({open.length})</span>
        </h2>
        {open.length > 0 ? (
          <JobCardGrid jobs={open} label={copy.openLabel} />
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong bg-surface/40 px-4 py-6 text-center text-sm text-fg-muted">
            {copy.openEmpty}
          </p>
        )}
      </section>
      <NeonDivider />
      <section aria-labelledby={`${copy.id}-closed-title`} className="space-y-4">
        <div className="space-y-1">
          <h2 id={`${copy.id}-closed-title`} className="flex items-center gap-2 font-display text-base font-semibold text-fg">
            {copy.closedTitle} <span className="font-mono text-sm font-normal text-fg-subtle">({closed.length})</span>
          </h2>
          <p className="text-sm text-fg-muted">{copy.closedHint}</p>
        </div>
        <JobCardGrid jobs={closed} label={copy.closedLabel} />
      </section>
    </div>
  );
}

function PausedState() {
  return (
    <EmptyPanel
      art={<NoJobs decorative className="w-44 sm:w-52" />}
      title="No job matches while your account can't take jobs"
      action={
        <ButtonLink href="/mechanic/profile" variant="secondary">
          Go to your profile
        </ButtonLink>
      }
    >
      Matched repair requests appear here as soon as your account can take jobs again. The notice above says what to do.
      Your quotes and bookings stay in their tabs.
    </EmptyPanel>
  );
}

function panelsFor(board: JobBoard): Record<BoardTab, ReactNode> {
  const eligible = board.eligibility.canReceiveJobs;
  return {
    new: !eligible ? (
      <PausedState />
    ) : board.newMatches.length > 0 ? (
      <SplitJobs jobs={board.newMatches} copy={NEW_COPY} />
    ) : (
      <EmptyPanel
        art={<NoJobs decorative className="w-44 sm:w-52" />}
        title="No new matches right now"
        action={
          <ButtonLink href="/mechanic/profile" variant="secondary">
            Review services and availability
          </ButtonLink>
        }
      >
        When a customer nearby asks for a service you offer, for a make you service, at a time you&rsquo;re available, the
        job appears here and you get a notification.
      </EmptyPanel>
    ),
    interested: !eligible ? (
      <PausedState />
    ) : board.interested.length > 0 ? (
      <SplitJobs jobs={board.interested} copy={INTERESTED_COPY} />
    ) : (
      <EmptyPanel
        art={<NoRequests decorative className="w-44 sm:w-52" />}
        title="Nothing saved yet"
        action={
          <ButtonLink href="/mechanic/jobs?tab=new" variant="secondary">
            See new matches
          </ButtonLink>
        }
      >
        Open a new match and press Interested to keep it here while you prepare a quote. Jobs you quote also stay here.
      </EmptyPanel>
    ),
    quotes:
      board.quotes.length > 0 ? (
        <ul aria-label="Your quotes: active first, then newest first" className="stagger-children space-y-4">
          {activeQuotesFirst(board.quotes).map((quote) => (
            <QuoteListItem
              key={quote.id}
              quote={quote}
              booking={board.bookings.find((booking) => booking.id === quote.bookingId) ?? null}
            />
          ))}
        </ul>
      ) : (
        <EmptyPanel art={<NoQuotes decorative className="w-44 sm:w-52" />} title="No quotes yet">
          Quotes you send appear here with their status. A submitted quote holds its time slot until it expires.
        </EmptyPanel>
      ),
    bookings:
      board.bookings.length > 0 ? (
        <ul aria-label="Your bookings" className="stagger-children space-y-4">
          {board.bookings.map((booking) => (
            <BookingListItem key={booking.id} booking={booking} />
          ))}
        </ul>
      ) : (
        <EmptyPanel art={<NoBookings decorative className="w-44 sm:w-52" />} title="No bookings yet">
          When a customer selects your quote, the reservation appears here. It stays pending until the customer pays, and
          online payments are coming soon.
        </EmptyPanel>
      ),
  };
}

function legendFor(items: readonly MapItem[], labels: Readonly<Record<string, string>>): MapLegendItem[] {
  const seen = new Map<string, MapLegendItem>();
  for (const item of items) {
    const label = labels[item.tone];
    if (label && !seen.has(item.tone)) seen.set(item.tone, { tone: item.tone, label });
  }
  return [...seen.values()];
}

const JOB_LEGEND: Readonly<Record<string, string>> = {
  cyan: "Open",
  violet: "Quoted by you",
  warning: "Payment pending",
  success: "Booked with you",
  neutral: "Closed",
};

function mapsFor(board: JobBoard): Record<BoardTab, BoardMapView> {
  const jobItems = (jobs: readonly JobCardData[]): MapItem[] =>
    jobs.map((job) => ({
      id: job.requestId,
      lat: job.approxPoint.lat,
      lng: job.approxPoint.lng,
      title: job.vehicle.label,
      detail: `${job.availabilityLabel} · ${job.areaLabel} · ${formatMiles(job.distanceMiles)} away`,
      tone: AVAILABILITY_TONE[job.availability],
      href: `/mechanic/jobs/${job.requestId}`,
      hrefLabel: "View job",
    }));
  const newItems = board.eligibility.canReceiveJobs ? jobItems(board.newMatches) : [];
  const interestedItems = board.eligibility.canReceiveJobs ? jobItems(board.interested) : [];
  const quoteItems: MapItem[] = board.quotes.map((quote) => ({
    id: quote.id,
    lat: quote.approxPoint.lat,
    lng: quote.approxPoint.lng,
    title: quote.vehicleLabel,
    detail: `Quote: ${quote.statusLabel.toLowerCase()} · ${quote.areaLabel}`,
    tone: QUOTE_TONE[quote.status],
    href: quote.bookingId ? `/mechanic/bookings/${quote.bookingId}` : `/mechanic/jobs/${quote.requestId}`,
    hrefLabel: quote.bookingId ? "View booking" : "View job",
  }));
  const bookingItems: MapItem[] = board.bookings.map((booking) => ({
    id: booking.id,
    lat: booking.approxPoint.lat,
    lng: booking.approxPoint.lng,
    title: booking.vehicleLabel,
    detail: `${booking.statusLabel} · ${booking.areaLabel}`,
    tone: BOOKING_TONE[booking.status],
    href: `/mechanic/bookings/${booking.id}`,
    hrefLabel: "Open booking",
  }));
  return {
    new: { label: "Map of new job matches (approximate areas)", items: newItems, legend: legendFor(newItems, JOB_LEGEND) },
    interested: {
      label: "Map of jobs you're interested in or quoted (approximate areas)",
      items: interestedItems,
      legend: legendFor(interestedItems, JOB_LEGEND),
    },
    quotes: {
      label: "Map of your quotes (approximate areas)",
      items: quoteItems,
      legend: legendFor(quoteItems, { violet: "Active quote", success: "Selected", neutral: "Closed" }),
    },
    bookings: {
      label: "Map of your bookings (approximate areas)",
      items: bookingItems,
      legend: legendFor(bookingItems, {
        warning: "Payment pending",
        cyan: "Confirmed",
        blue: "In progress",
        success: "Completed",
        danger: "Disputed",
        neutral: "Cancelled",
      }),
    },
  };
}

function radarBlips(board: JobBoard): RadarBlip[] {
  const base = board.base;
  if (!base) return [];
  const reach = Math.max(base.travelRadiusMiles, 10);
  const jobs = [...board.newMatches, ...board.interested];
  return jobs.map((job) => ({
    bearing: bearingDegrees(base.point, job.approxPoint),
    distance: job.distanceMiles / reach,
    tone:
      job.availability === "open"
        ? "cyan"
        : job.availability === "quoted_by_you"
          ? "violet"
          : job.availability === "booked_with_you"
            ? "success"
            : job.availability === "selected_pending_payment"
              ? "warning"
              : "neutral",
  }));
}

export default async function JobBoardPage({ searchParams }: JobBoardPageProps) {
  const viewer = await requireRole("mechanic", "/mechanic/jobs");
  const tab = readTab((await searchParams).tab);
  const board = await listMyJobs(createAppContext(), viewer);
  const openNew = board.newMatches.filter((job) => OPEN_JOB_AVAILABILITY.has(job.availability)).length;
  const openInterested = board.interested.filter((job) => OPEN_JOB_AVAILABILITY.has(job.availability)).length;
  const activeQuotes = board.quotes.filter((quote) => quote.status === "submitted").length;
  const activeBookings = board.bookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status)).length;
  const noProfile = board.eligibility.reason === "no_profile";
  const receiving = board.eligibility.canReceiveJobs;

  // Tab badges show the same open/active numbers as the stat cards (closed items still appear,
  // grouped, inside each tab), so the two never disagree on one screen.
  const tabs: BoardTabItem[] = [
    { key: "new", label: "New matches", count: openNew },
    { key: "interested", label: "Interested", count: openInterested },
    { key: "quotes", label: "My quotes", count: activeQuotes },
    { key: "bookings", label: "Bookings", count: activeBookings },
  ];

  return (
    <PageContainer size="wide">
      <MechanicHero
        eyebrow="Mechanic console"
        title="Job board"
        meta={
          noProfile ? null : (
            <span
              className={
                receiving
                  ? "inline-flex items-center gap-2 rounded-full border border-success-600/40 bg-success-600/10 px-3 py-1 text-sm font-medium text-success-700"
                  : "inline-flex items-center gap-2 rounded-full border border-warning-600/40 bg-warning-600/10 px-3 py-1 text-sm font-medium text-warning-700"
              }
            >
              <LiveDot tone={receiving ? "success" : "warning"} />
              {receiving ? "Receiving matched jobs" : "Not receiving new jobs"}
            </span>
          )
        }
        description="Repair requests that fit your services, makes, area and hours. Customer contact details stay private until a booking is confirmed."
        actions={
          noProfile ? null : (
            <ButtonLink href="/mechanic/profile" variant="secondary" leadingIcon={<UserRound />}>
              Profile &amp; availability
            </ButtonLink>
          )
        }
        art={
          board.base ? (
            <div className="flex flex-col items-center gap-2">
              <RadarArt blips={radarBlips(board)} className="w-44 xl:w-52" />
              <HudLabel tone="muted">
                Base {board.base.zip} · {board.base.serviceMode === "garage" ? "garage" : `${board.base.travelRadiusMiles} mi radius`}
              </HudLabel>
            </div>
          ) : null
        }
      />

      <div className="mt-6 space-y-6">
        {noProfile ? (
          <EmptyPanel
            art={<NoJobs decorative className="w-48 sm:w-56" />}
            title="Your job board starts after your application"
            titleAs="h2"
            action={<ButtonLink href="/mechanic/apply">Start your application</ButtonLink>}
          >
            Tell us your services, service area, insurance and weekly hours. Once an admin approves you, matching repair
            requests appear here.
          </EmptyPanel>
        ) : (
          <>
            <EligibilityCallout eligibility={board.eligibility} />
            <BoardShell
              initialTab={tab}
              tabs={tabs}
              panels={panelsFor(board)}
              maps={mapsFor(board)}
              base={board.base}
              header={
                <BoardStats
                  stats={[
                    {
                      tab: "new",
                      label: "New matches",
                      value: openNew,
                      hint: receiving ? "Waiting for your response" : "Paused while you can't take jobs",
                      icon: <Inbox />,
                      tone: "cyan",
                    },
                    {
                      tab: "interested",
                      label: "Interested & quoted",
                      value: openInterested,
                      hint: "Open jobs you're working on",
                      icon: <Star />,
                      tone: "violet",
                    },
                    {
                      tab: "quotes",
                      label: "Active quotes",
                      value: activeQuotes,
                      hint: "Each holds its time slot",
                      icon: <Receipt />,
                      tone: "blue",
                    },
                    {
                      tab: "bookings",
                      label: "Active bookings",
                      value: activeBookings,
                      hint: "Reserved, confirmed or in progress",
                      icon: <CalendarCheck />,
                      tone: "success",
                    },
                  ]}
                />
              }
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
