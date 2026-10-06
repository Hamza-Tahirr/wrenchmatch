import { Activity, IdCard, Lock, ShieldCheck } from "lucide-react";

import { pluralize } from "@/lib/format";
import type { AdminMechanicDetail } from "@/server/admin/mechanics";

import { InsuranceBadge, NeonChip } from "../../../_components/badges";
import { FactGrid, Panel } from "../../../_components/console";
import { Timestamp } from "../../../_components/timestamp";
import { mechanicModeLabel, ratingLabel } from "../../../_lib/display";

/** Public profile fields (what customers see on quotes) and account facts. */
export function ProfileCard({ mechanic, timeZone }: { mechanic: AdminMechanicDetail; timeZone: string }) {
  const { profile, account } = mechanic;
  return (
    <Panel title="Public profile" icon={<IdCard />} description="What customers see next to this mechanic's quotes.">
      <div className="space-y-4">
        {profile.bio ? (
          <p className="rounded-xl border-l-2 border-neon-cyan/50 bg-fg/[0.025] px-3 py-2 text-sm text-pretty whitespace-pre-line text-fg-muted">
            {profile.bio}
          </p>
        ) : null}
        <FactGrid
          columns={2}
          items={[
            { term: "Experience", description: `${pluralize(profile.yearsExperience, "year")}` },
            {
              term: "New jobs",
              description: profile.acceptingJobs ? (
                <NeonChip tone="success" pulse>
                  Accepting
                </NeonChip>
              ) : (
                <NeonChip tone="neutral">Paused by the mechanic</NeonChip>
              ),
            },
            {
              term: "Service mode",
              description: `${mechanicModeLabel(profile.serviceMode)}${
                profile.serviceMode !== "garage" ? `, up to ${profile.travelRadiusMiles} mi` : ""
              }`,
            },
            { term: "Time zone", description: profile.timeZone },
            { term: "Base area", description: `${profile.baseArea} (approximate)`, wide: true },
            {
              term: "Certifications",
              description: profile.certifications ?? <span className="text-fg-subtle">None listed</span>,
              wide: true,
            },
            { term: "Account email", description: <span className="font-mono text-xs wrap-anywhere">{account.email}</span>, wide: true },
            { term: "Account created", description: <Timestamp iso={account.createdAt} timeZone={timeZone} format="date" /> },
            {
              term: "Application",
              description: profile.submittedAt ? (
                <>
                  Submitted <Timestamp iso={profile.submittedAt} timeZone={timeZone} format="date" />
                  {profile.approvedAt ? (
                    <>
                      , approved <Timestamp iso={profile.approvedAt} timeZone={timeZone} format="date" />
                    </>
                  ) : null}
                </>
              ) : (
                "Not submitted yet"
              ),
              wide: true,
            },
            ...(account.disabledAt
              ? [{ term: "Account disabled", description: <Timestamp iso={account.disabledAt} timeZone={timeZone} /> }]
              : []),
          ]}
        />
      </div>
    </Panel>
  );
}

/** Insurance standing (matching and approval depend on it). */
export function InsuranceCard({ mechanic }: { mechanic: AdminMechanicDetail }) {
  const { insurance } = mechanic;
  return (
    <Panel title="Insurance" icon={<ShieldCheck />} tone={insurance.tone === "danger" ? "danger" : insurance.tone === "warning" ? "warning" : "success"}>
      <div className="space-y-4">
        <InsuranceBadge insurance={insurance} />
        <FactGrid
          columns={2}
          items={[
            { term: "Provider", description: insurance.provider ?? <span className="text-fg-subtle">Not recorded</span> },
            {
              term: "Policy number",
              description: insurance.policyNumberOnFile ? (
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                  On file (reveal to see it)
                </span>
              ) : (
                <span className="text-fg-subtle">Not on file</span>
              ),
            },
            {
              term: "Expires",
              wide: true,
              description: insurance.expiresOn ? (
                <>
                  {insurance.label}
                  {insurance.daysUntilExpiry !== null && insurance.daysUntilExpiry >= 0 && insurance.state === "valid"
                    ? ` (${pluralize(insurance.daysUntilExpiry, "day")} left)`
                    : ""}
                </>
              ) : (
                <span className="text-fg-subtle">Not recorded</span>
              ),
            },
          ]}
        />
        <p className="text-xs text-fg-subtle">
          Insurance details are typed in by the mechanic and are not verified with the insurer. Check the uploaded
          certificate.
        </p>
      </div>
    </Panel>
  );
}

/** Marketplace activity; sample reviews never count toward the rating. */
export function ActivityCard({ mechanic }: { mechanic: AdminMechanicDetail }) {
  const { stats } = mechanic;
  const tiles = [
    { label: "Jobs matched", value: String(stats.jobsMatched) },
    { label: "Jobs quoted", value: String(stats.jobsQuoted) },
    { label: "Quotes sent", value: String(stats.quotesSent), hint: `${stats.activeQuotes} active` },
    { label: "Bookings", value: String(stats.bookings), hint: `${stats.confirmedBookings} confirmed jobs` },
  ];
  return (
    <Panel title="Marketplace activity" icon={<Activity />} tone="violet">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-line bg-fg/[0.025] p-3">
              <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{tile.label}</dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-fg">
                {tile.value}
                {tile.hint ? <span className="mt-0.5 block font-sans text-xs font-normal text-fg-subtle">{tile.hint}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <FactGrid
          columns={2}
          items={[
            { term: "Rating", description: ratingLabel(stats.genuineAverageRating, stats.genuineReviewCount) },
            {
              term: "Sample reviews",
              description: stats.sampleReviewCount > 0 ? `${stats.sampleReviewCount} (never counted)` : "None",
            },
          ]}
        />
      </div>
    </Panel>
  );
}
