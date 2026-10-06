import { CalendarClock, Car, ClipboardList, FileText, Gauge, Hourglass, MapPin, ShieldAlert, Wrench } from "lucide-react";

import { formatDateTime, formatMiles } from "@/lib/format";
import type { JobDetail } from "@/server/mechanic/jobs";

import { DetailGrid, DetailItem } from "../../../_components/facts";
import { HudLabel, Panel } from "../../../_components/hud";
import { requestModeText } from "../../../_lib/display";

const MILEAGE = new Intl.NumberFormat("en-US");

/** The request's coarse details: never the customer's contact details or exact address. */
export function JobDetailsCard({ job }: { job: JobDetail }) {
  return (
    <Panel id="job-details" title="Job details" description={job.category.shortDescription} icon={<FileText />} bodyClassName="space-y-6">
      {job.category.customerNotice ? (
        <div
          className={
            job.category.safetySensitive
              ? "flex gap-3 rounded-xl border border-warning-600/35 bg-warning-600/8 p-4"
              : "flex gap-3 rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 p-4"
          }
        >
          <ShieldAlert aria-hidden="true" className={job.category.safetySensitive ? "mt-0.5 size-5 shrink-0 text-warning-600" : "mt-0.5 size-5 shrink-0 text-neon-cyan"} />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-fg">Category note</p>
            <p className="text-sm text-fg-muted">{job.category.customerNotice}</p>
          </div>
        </div>
      ) : null}
      <figure className="relative overflow-hidden rounded-xl border border-line bg-surface-2/60 p-4 sm:p-5">
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-gradient-to-b from-neon-cyan via-neon-blue to-neon-violet" />
        <figcaption>
          <HudLabel tone="muted">Customer&rsquo;s description</HudLabel>
        </figcaption>
        <blockquote className="mt-2 text-sm leading-relaxed whitespace-pre-line text-fg">{job.description}</blockquote>
      </figure>
      <DetailGrid>
        <DetailItem icon={<Car />} label="Vehicle">
          {job.vehicle.label}
        </DetailItem>
        <DetailItem icon={<Gauge />} label="Mileage">
          <span className="font-mono tabular">{MILEAGE.format(job.mileage)}</span> miles
        </DetailItem>
        <DetailItem icon={<Car />} label="Drivable">
          {job.drivable ? "Yes, the car can be driven" : "No, the car can't be driven"}
        </DetailItem>
        <DetailItem icon={<Wrench />} label="Service requested">
          {requestModeText(job.serviceMode, job.maxGarageDistanceMiles)}
        </DetailItem>
        <DetailItem icon={<MapPin />} label="Area">
          {job.areaLabel}
          <span className="block text-fg-muted">{formatMiles(job.distanceMiles)} from your base ZIP (center to center)</span>
        </DetailItem>
        <DetailItem icon={<CalendarClock />} label="Preferred time">
          {job.preferredTimeLabel}
          <span className="block text-fg-muted">In the customer&rsquo;s local time</span>
        </DetailItem>
        {job.submittedAt ? (
          <DetailItem icon={<ClipboardList />} label="Requested">
            {formatDateTime(job.submittedAt, job.timeZone)}
          </DetailItem>
        ) : null}
        {job.expiresAt ? (
          <DetailItem icon={<Hourglass />} label="Open for quotes until">
            {formatDateTime(job.expiresAt, job.timeZone)}
          </DetailItem>
        ) : null}
      </DetailGrid>
    </Panel>
  );
}
