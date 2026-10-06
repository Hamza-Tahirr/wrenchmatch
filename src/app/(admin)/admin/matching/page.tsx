import { ArrowRight, BarChart3, MapPinned, Radar, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";
import { formatDate, pluralize } from "@/lib/format";
import { listMatchingFailures, type MatchingFailure } from "@/server/admin/matching";

import { NeonChip, RequestStatusBadge } from "../_components/badges";
import { BarList } from "../_components/bar-list";
import { ConsoleEmpty, ConsoleHeader, ConsoleNote, Panel, SectionHeading } from "../_components/console";
import { InlineAction } from "../_components/inline-action";
import { MapFocusButton } from "../_components/maps/map-focus-button";
import { MatchingMap } from "../_components/maps/matching-map";
import { Timestamp } from "../_components/timestamp";
import { requestModeLabel, windowLabel } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";
import { rerunMatchingAction } from "../requests/[id]/actions";

export const metadata: Metadata = { title: "Matching failures" };

function FailureCard({ failure, now }: { failure: MatchingFailure; now: Date }) {
  const { request, rerun } = failure;
  const title = `${request.vehicle} · ${request.categoryName}`;
  return (
    <li>
      <article aria-labelledby={`failure-${request.id}`} className="glass-lite card-hover relative space-y-4 rounded-2xl p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-danger-500/60 to-transparent"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 id={`failure-${request.id}`} className="font-display text-base font-semibold text-fg">
              <Link href={`/admin/requests/${request.id}`} className="underline-offset-4 transition-colors hover:text-neon-cyan hover:underline">
                {title}
              </Link>
            </h3>
            <p className="text-sm text-fg-muted">
              {request.customer.displayName} · {request.areaLabel} · {requestModeLabel(request.serviceMode)} · preferred{" "}
              {formatDate(request.preferredDate)}, {windowLabel(request.preferredWindow)}
            </p>
            <p className="text-xs text-fg-subtle">
              Submitted{" "}
              {request.submittedAt ? (
                <Timestamp iso={request.submittedAt} timeZone={request.timeZone} format="relative" now={now} />
              ) : (
                "—"
              )}
              {failure.lastEvaluatedAt ? (
                <>
                  {" "}
                  · last matched <Timestamp iso={failure.lastEvaluatedAt} timeZone={request.timeZone} format="relative" now={now} />
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <NeonChip tone={request.matchedCount === 0 ? "danger" : "warning"} pulse>
              {request.matchedCount === 0 ? "Nobody notified" : `${request.matchedCount} notified`}
            </NeonChip>
            <RequestStatusBadge status={request.status} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-fg-muted">
            Last run: {pluralize(failure.evaluatedCount, "mechanic")} evaluated, {failure.eligibleCount} eligible.
            {failure.reasons.length > 0 ? " Why the others were left out:" : ""}
          </p>
          {failure.reasons.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Exclusion reasons and how many mechanics each excluded">
              {failure.reasons.map((reason) => (
                <li key={reason.code} title={reason.explanation}>
                  <NeonChip tone="neutral">
                    {reason.label} <span className="font-mono font-semibold text-fg tabular">× {reason.count}</span>
                  </NeonChip>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-fg/[0.025] p-3.5 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-fg-muted">
            {rerun.allowed ? (
              rerun.wouldNotify > 0 ? (
                <>
                  <strong className="font-semibold text-success-700">
                    Re-running now would notify {pluralize(rerun.wouldNotify, "mechanic")}
                  </strong>{" "}
                  ({rerun.eligibleNow} eligible with today&rsquo;s data).
                </>
              ) : (
                <>
                  Re-running now would notify nobody new ({rerun.eligibleNow} eligible with today&rsquo;s data). Approve or
                  recruit a mechanic who fits first.
                </>
              )
            ) : (
              rerun.blockedReason
            )}
          </p>
          {/* Phones: re-run across the top, the map and details links side by side under it. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-start">
            {rerun.allowed ? (
              <InlineAction
                className="col-span-2"
                buttonClassName="max-sm:w-full"
                action={rerunMatchingAction}
                hiddenFields={{ requestId: request.id }}
                icon={<RefreshCw />}
                pendingText="Re-running…"
                variant={rerun.wouldNotify > 0 ? "primary" : "secondary"}
                ariaLabel={`Re-run matching for ${title}`}
                result="toast"
              >
                Re-run matching
              </InlineAction>
            ) : null}
            <MapFocusButton requestId={request.id} title={title} />
            <ButtonLink
              href={`/admin/requests/${request.id}`}
              size="sm"
              variant="secondary"
              trailingIcon={<ArrowRight />}
              aria-label={`Open ${title}`}
              className={TAP_TARGET}
            >
              Details
            </ButtonLink>
          </div>
        </div>
      </article>
    </li>
  );
}

export default async function MatchingPage() {
  const { viewer, ctx } = await adminPage("/admin/matching");
  const report = await listMatchingFailures(ctx, viewer);

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Matching"
        title="Matching failures"
        description={`Requests waiting for quotes that reached fewer than ${report.threshold} mechanics, longest-waiting first, with the reasons other mechanics were left out.`}
        meta={
          report.requests.length > 0 ? (
            <NeonChip tone="danger" pulse>
              {pluralize(report.requests.length, "request")} {report.requests.length === 1 ? "needs" : "need"} follow-up
            </NeonChip>
          ) : (
            <NeonChip tone="success">No follow-up needed</NeonChip>
          )
        }
      />

      <ConsoleNote icon={<MapPinned />} title="How distances and matching work">
        <p>
          Distances are approximate: they are measured between ZIP-area centers (the US Census reference point of each ZIP),
          never between exact addresses, and no paid geocoder is used. A mobile request needs the customer&rsquo;s ZIP within
          the mechanic&rsquo;s travel radius; a garage request needs the mechanic&rsquo;s base ZIP within the customer&rsquo;s
          maximum garage distance.
        </p>
        <p>
          A mechanic must also be approved, accepting jobs, insured through the preferred date, offer the category
          (safety-approved for brakes and suspension), service the make and have weekly hours in the preferred window. At most{" "}
          {report.maxMechanicsNotified} of the closest eligible mechanics are notified.
        </p>
      </ConsoleNote>

      {report.requests.length === 0 ? (
        <ConsoleEmpty
          illustration="success"
          title="No matching failures"
          action={
            <ButtonLink href="/admin/requests?status=active" variant="secondary" className={TAP_TARGET}>
              Requests waiting for quotes
            </ButtonLink>
          }
        >
          Every request waiting for quotes reached at least {report.threshold} mechanics.
        </ConsoleEmpty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel
              title="Diagnostics map"
              icon={<Radar />}
              variant="glass"
              tone="danger"
              description="Focus a request to see every mechanic its last run evaluated: base area, travel radius and result."
            >
              <MatchingMap
                failures={report.requests.map((failure) => ({
                  request: {
                    id: failure.request.id,
                    title: `${failure.request.vehicle} · ${failure.request.categoryName}`,
                    areaLabel: failure.request.areaLabel,
                    location: failure.location,
                    serviceMode: failure.request.serviceMode,
                    maxGarageDistanceMiles: failure.maxGarageDistanceMiles,
                  },
                  matchedCount: failure.request.matchedCount,
                  evaluations: failure.evaluations,
                }))}
              />
            </Panel>
            <Panel
              title="Why mechanics were left out"
              icon={<BarChart3 />}
              description={`How many mechanic evaluations each rule failed, across ${
                report.requests.length === 1 ? "the request below" : `the ${report.requests.length} requests below`
              } (one mechanic can fail several rules).`}
            >
              {report.reasons.length > 0 ? (
                <BarList
                  label="Exclusion reasons, most common first"
                  rows={report.reasons.map((reason) => ({
                    key: reason.code,
                    label: reason.label,
                    hint: reason.explanation,
                    value: reason.count,
                    unit: "mechanic evaluations",
                  }))}
                />
              ) : (
                <p className="text-sm text-fg-subtle">No exclusions were recorded in the last matching runs.</p>
              )}
            </Panel>
          </div>

          <section aria-labelledby="failures-title" className="space-y-4">
            <SectionHeading id="failures-title" count={report.requests.length}>
              Requests needing follow-up
            </SectionHeading>
            <ul className="stagger-children space-y-4">
              {report.requests.map((failure) => (
                <FailureCard key={failure.request.id} failure={failure} now={ctx.now} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
