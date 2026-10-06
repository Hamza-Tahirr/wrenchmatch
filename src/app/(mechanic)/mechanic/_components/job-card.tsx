import { ArrowRight, CalendarClock, Camera, Car, Gauge, MapPin, ShieldAlert, Sparkles, Video, Wrench } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/cn";
import { formatDateTime, pluralize } from "@/lib/format";
import type { JobCard as JobCardData } from "@/server/mechanic/jobs";

import { areaWithDistance, requestModeText } from "../_lib/display";
import { FactChip, HudLabel } from "./hud";
import { LocateButton, SelectableCard } from "./selectable-card";
import { CARD_LAYER, CARD_LINK, TAP } from "./tap";

const MILEAGE = new Intl.NumberFormat("en-US");

/** The colored edge of a card, by the job's availability (decorative; the badge says it). */
const EDGE: Readonly<Record<JobCardData["availability"], string>> = {
  open: "from-neon-cyan/0 via-neon-cyan to-neon-cyan/0",
  quoted_by_you: "from-neon-violet/0 via-neon-violet to-neon-violet/0",
  selected_pending_payment: "from-warning-600/0 via-warning-600 to-warning-600/0",
  booked_with_you: "from-success-600/0 via-success-600 to-success-600/0",
  unavailable: "from-fg-subtle/0 via-fg-subtle/60 to-fg-subtle/0",
};

/**
 * One matched job on the board: coarse request details only (no contact, no exact address).
 * The whole card opens the job (its title link covers it); "Show on map" and "View job" sit
 * above that link.
 */
export function JobCard({ job }: { job: JobCardData }) {
  const href = `/mechanic/jobs/${job.requestId}`;
  const unavailable = job.availability === "unavailable";
  const isNew = job.matchStatus === "notified" && !unavailable;
  return (
    <SelectableCard id={job.requestId} className={cn("flex flex-col", unavailable ? "opacity-80" : null)}>
      <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r", EDGE[job.availability])} />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={job.availabilityTone}>{job.availabilityLabel}</Badge>
          {isNew ? (
            <Badge tone="info" icon={<Sparkles />}>
              New match
            </Badge>
          ) : null}
          {job.safetySensitive ? (
            <Badge tone="warning" icon={<ShieldAlert />}>
              Safety-critical
            </Badge>
          ) : null}
        </div>
        <div className="min-w-0">
          <HudLabel>{job.categoryName}</HudLabel>
          <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-fg">
            <Link href={href} className={CARD_LINK}>
              {job.vehicle.label}
            </Link>
          </h3>
        </div>
        <p className="line-clamp-3 text-sm text-pretty text-fg-muted sm:line-clamp-none">{job.descriptionExcerpt}</p>
        <ul aria-label="Job facts" className="mt-auto flex flex-wrap gap-2 pt-1">
          <FactChip icon={<MapPin />}>{areaWithDistance(job.areaLabel, job.distanceMiles)}</FactChip>
          <FactChip icon={<CalendarClock />}>{job.preferredTimeLabel}</FactChip>
          <FactChip icon={<Wrench />}>{requestModeText(job.serviceMode)}</FactChip>
          <FactChip icon={<Gauge />}>{MILEAGE.format(job.mileage)} mi</FactChip>
          <FactChip icon={<Car />}>{job.drivable ? "Drivable" : "Not drivable"}</FactChip>
          {job.photoCount > 0 ? <FactChip icon={<Camera />}>{pluralize(job.photoCount, "photo")}</FactChip> : null}
          {job.hasVideo ? <FactChip icon={<Video />}>Video after booking</FactChip> : null}
        </ul>
      </div>
      <div className="flex flex-col gap-3 border-t border-line bg-surface-2/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-xs text-fg-subtle">
          {job.myQuote ? (
            <p>
              Your quote{" "}
              <Money cents={job.myQuote.totalCents} className="font-mono text-sm font-semibold text-fg tabular-nums" />
            </p>
          ) : (
            <p>
              Matched <time dateTime={job.matchedAt}>{formatDateTime(job.matchedAt, job.timeZone)}</time>
            </p>
          )}
        </div>
        <div className={cn(CARD_LAYER, "flex items-center gap-2")}>
          <LocateButton id={job.requestId} label={job.vehicle.label} />
          <ButtonLink
            href={href}
            variant={unavailable ? "ghost" : "secondary"}
            trailingIcon={<ArrowRight />}
            aria-label={`View job: ${job.vehicle.label}, ${job.categoryName}`}
            className={cn("flex-1 sm:flex-none", TAP)}
          >
            View job
          </ButtonLink>
        </div>
      </div>
    </SelectableCard>
  );
}
