import { ChevronDown, Radar, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { formatMiles, pluralize } from "@/lib/format";
import type { AdminRequestDetail, MatchReasonDetail } from "@/server/admin/requests";

import type { AdminFormAction } from "../../../_components/action-dialog";
import { JobMatchStatusBadge } from "../../../_components/badges";
import { ConsoleNote, Panel } from "../../../_components/console";
import { InlineAction } from "../../../_components/inline-action";
import { DiagnosticsPanel } from "../../../_components/maps/diagnostics-panel";
import { Timestamp } from "../../../_components/timestamp";

function uniqueReasons(request: AdminRequestDetail): MatchReasonDetail[] {
  const seen = new Map<string, MatchReasonDetail>();
  for (const evaluation of request.evaluations) {
    for (const reason of evaluation.reasons) seen.set(reason.code, reason);
  }
  return [...seen.values()];
}

/** The last matching run for a request: a diagnostics map linked to every evaluation, notified mechanics and a re-run. */
export function MatchingSection({
  request,
  action,
  maxNotified,
}: {
  request: AdminRequestDetail;
  action: AdminFormAction;
  maxNotified: number;
}) {
  const reasons = uniqueReasons(request);
  const lastRun = request.evaluations.reduce<string | null>(
    (latest, evaluation) => (latest === null || evaluation.evaluatedAt > latest ? evaluation.evaluatedAt : latest),
    null,
  );
  const waiting = request.status === "open" || request.status === "quoted";
  return (
    <Panel
      title="Matching diagnostics"
      icon={<Radar />}
      variant="glass"
      description={
        <>
          {pluralize(request.matchedCount, "mechanic")} notified (at most {maxNotified}, closest first).
          {lastRun ? (
            <>
              {" "}
              Last evaluated <Timestamp iso={lastRun} timeZone={request.timeZone} />.
            </>
          ) : null}{" "}
          Distances are approximate, between ZIP-area centers.
        </>
      }
    >
      <div className="space-y-6">
        {request.matchedCount === 0 && waiting ? (
          <ConsoleNote icon={<TriangleAlert />} tone="danger" title="No mechanic was notified">
            The customer was told honestly that nobody is available yet. Check the reasons below: approving a mechanic, a
            safety approval or a new pilot mechanic nearby can change the result, then re-run matching.
          </ConsoleNote>
        ) : null}

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-fg/[0.025] p-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-sm text-fg-muted">
            Re-running evaluates every mechanic again with today&rsquo;s data and notifies newly eligible ones (never the same
            mechanic twice). The customer is told when someone new is notified.
          </p>
          {request.rerunBlockedReason ? (
            <p className="max-w-sm text-sm font-medium text-fg">{request.rerunBlockedReason}</p>
          ) : (
            <InlineAction
              action={action}
              hiddenFields={{ requestId: request.id }}
              icon={<RefreshCw />}
              pendingText="Re-running matching…"
              variant="primary"
              className="shrink-0 sm:max-w-sm"
              buttonClassName="max-sm:w-full"
            >
              Re-run matching
            </InlineAction>
          )}
        </div>

        <DiagnosticsPanel
          request={{
            id: request.id,
            title: `${request.vehicle} · ${request.categoryName}`,
            areaLabel: request.areaLabel,
            location: request.location,
            serviceMode: request.serviceMode,
            maxGarageDistanceMiles: request.maxGarageDistanceMiles,
          }}
          evaluations={request.evaluations}
          maxNotified={maxNotified}
        />

        <div className="space-y-3">
          <h3 className="font-display text-sm font-semibold tracking-tight text-fg">Notified mechanics</h3>
          {request.jobMatches.length > 0 ? (
            <ol className="stagger-children divide-y divide-line rounded-2xl border border-line">
              {request.jobMatches.map((match) => (
                <li
                  key={match.mechanic.id}
                  className="relative flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-fg/[0.03]"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-success-50 font-mono text-xs font-semibold text-success-800 ring-1 ring-success-300/50">
                    <span className="sr-only">Rank </span>
                    {match.rank}
                  </span>
                  <Link
                    href={`/admin/mechanics/${match.mechanic.id}`}
                    className="font-medium text-brand-700 underline-offset-4 after:absolute after:inset-0 hover:text-neon-cyan hover:underline"
                  >
                    {match.mechanic.displayName}
                  </Link>
                  <JobMatchStatusBadge status={match.status} />
                  <span className="font-mono text-xs text-fg-subtle">{formatMiles(match.distanceMiles)}</span>
                  <span className="text-xs text-fg-subtle sm:ml-auto">
                    notified <Timestamp iso={match.notifiedAt} timeZone={request.timeZone} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-fg-subtle">Nobody has been notified about this request.</p>
          )}
        </div>

        {reasons.length > 0 ? (
          <details className="group rounded-2xl border border-line bg-fg/[0.02] text-sm">
            <summary className="flex min-h-11 list-none items-center justify-between gap-3 px-4 py-2.5 font-medium text-fg [&::-webkit-details-marker]:hidden">
              What these reasons mean
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-fg-subtle transition-transform duration-300 group-open:rotate-180"
              />
            </summary>
            <dl className="grid grid-cols-1 gap-3 px-4 pt-1 pb-4 sm:grid-cols-2">
              {reasons.map((reason) => (
                <div key={reason.code}>
                  <dt className="font-medium text-fg">{reason.label}</dt>
                  <dd className="text-fg-muted">{reason.explanation}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}
