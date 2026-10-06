"use client";

import { LocateFixed } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { MapView } from "@/components/map";
import { cn } from "@/lib/cn";
import type { AdminMatchEvaluation } from "@/server/admin/requests";

import { TAP_TARGET_SQUARE } from "../../_lib/ui";
import { MechanicStatusBadge, NeonChip, type ChipTone } from "../badges";
import {
  diagnosticsLayers,
  diagnosticsLegend,
  evaluationResult,
  RESULT_LABELS,
  type DiagnosticsRequest,
  type EvaluationResult,
} from "./diagnostics-layers";
import { MapKey } from "./map-key";

// The matching diagnostics map linked to the evaluation table: hovering or focusing a row
// flies the map to that mechanic's base area and opens its popup; clicking a marker lights up
// its row. Every point is a ZIP centroid (approximate).

const CHIP_TONES: Record<EvaluationResult, ChipTone> = { notified: "success", eligible: "info", excluded: "warning" };

const HOVER_DELAY_MS = 260;

function distanceText(miles: number | null): string {
  if (miles === null) return "Unknown";
  return miles < 1 ? "less than 1 mi" : `about ${Math.round(miles)} mi`;
}

export function DiagnosticsPanel({
  request,
  evaluations,
  maxNotified,
}: {
  request: DiagnosticsRequest;
  evaluations: readonly AdminMatchEvaluation[];
  maxNotified: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const mapAnchor = useRef<HTMLDivElement>(null);
  const layers = useMemo(() => diagnosticsLayers(request, evaluations), [request, evaluations]);
  const legend = useMemo(() => diagnosticsLegend(evaluations), [evaluations]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const hover = (id: string) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setSelectedId(id), HOVER_DELAY_MS);
  };
  const leave = () => window.clearTimeout(hoverTimer.current);
  const locate = (id: string) => {
    window.clearTimeout(hoverTimer.current);
    setSelectedId(id);
    const anchor = mapAnchor.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anchor.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }
  };

  return (
    <div className="space-y-5">
      <div ref={mapAnchor} className="space-y-2">
        <MapView
          label={`Matching map for ${request.title}: the request area and each evaluated mechanic's base area (approximate)`}
          points={layers.points}
          circles={layers.circles}
          lines={layers.lines}
          selectedId={selectedId}
          onSelect={setSelectedId}
          cluster={false}
          height="clamp(16rem, min(48vh, 95vw), 28rem)"
          listTitle="The request area and the mechanics evaluated"
          fitMaxZoom={11}
        />
        <MapKey items={legend} />
      </div>

      {evaluations.length === 0 ? (
        <p className="text-sm text-fg-subtle">This request has not been through matching.</p>
      ) : (
        <>
          {/* Wide screens: a table. Phones: cards. Both link to the map. */}
          <div role="region" aria-labelledby="evaluation-caption" tabIndex={0} className="hidden overflow-x-auto rounded-2xl border border-line sm:block">
            <table className="min-w-full text-sm">
              <caption id="evaluation-caption" className="sr-only">
                Matching evaluation: each mechanic&rsquo;s result, distance and the rules they failed. Hover or focus a row to
                show the mechanic on the map.
              </caption>
              <thead>
                <tr className="border-b border-line">
                  {["Mechanic", "Result", "Distance", "Why", ""].map((header, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.14em] whitespace-nowrap text-fg-subtle uppercase"
                    >
                      {header || <span className="sr-only">Map</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="stagger-children">
                {evaluations.map((evaluation) => {
                  const result = evaluationResult(evaluation);
                  const active = selectedId === evaluation.mechanic.id;
                  return (
                    <tr
                      key={evaluation.mechanic.id}
                      data-active={active || undefined}
                      onMouseEnter={() => hover(evaluation.mechanic.id)}
                      onMouseLeave={leave}
                      onFocus={() => setSelectedId(evaluation.mechanic.id)}
                      className="border-b border-line align-middle transition-[background-color,box-shadow] duration-200 last:border-b-0 hover:bg-fg/[0.035] data-[active]:bg-neon-cyan/[0.07] data-[active]:shadow-[inset_3px_0_0_0_var(--color-neon-cyan)]"
                    >
                      <th scope="row" className="px-4 py-3.5 text-left font-medium text-fg">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/mechanics/${evaluation.mechanic.id}`}
                            className="text-brand-700 underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                          >
                            {evaluation.mechanic.displayName}
                          </Link>
                          <MechanicStatusBadge status={evaluation.mechanicStatus} />
                        </span>
                      </th>
                      <td className="px-4 py-3.5">
                        <NeonChip tone={CHIP_TONES[result]}>{RESULT_LABELS[result]}</NeonChip>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap text-fg-muted tabular">
                        {distanceText(evaluation.distanceMiles)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Reasons evaluation={evaluation} result={result} maxNotified={maxNotified} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <LocateButton name={evaluation.mechanic.displayName} onClick={() => locate(evaluation.mechanic.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul aria-label="Matching evaluation, one card per mechanic" className="stagger-children space-y-3 sm:hidden">
            {evaluations.map((evaluation) => {
              const result = evaluationResult(evaluation);
              const active = selectedId === evaluation.mechanic.id;
              return (
                <li
                  key={evaluation.mechanic.id}
                  data-active={active || undefined}
                  className="glass-lite rounded-2xl p-4 transition-shadow duration-200 data-[active]:shadow-[var(--shadow-glow-sm)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <Link
                        href={`/admin/mechanics/${evaluation.mechanic.id}`}
                        className="font-medium text-brand-700 underline-offset-4 hover:underline"
                      >
                        {evaluation.mechanic.displayName}
                      </Link>
                      <div className="flex flex-wrap gap-1.5">
                        <NeonChip tone={CHIP_TONES[result]}>{RESULT_LABELS[result]}</NeonChip>
                        <MechanicStatusBadge status={evaluation.mechanicStatus} />
                      </div>
                    </div>
                    <LocateButton name={evaluation.mechanic.displayName} onClick={() => locate(evaluation.mechanic.id)} />
                  </div>
                  <p className="mt-2 font-mono text-xs text-fg-subtle">{distanceText(evaluation.distanceMiles)}</p>
                  <div className="mt-2">
                    <Reasons evaluation={evaluation} result={result} maxNotified={maxNotified} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Reasons({
  evaluation,
  result,
  maxNotified,
}: {
  evaluation: AdminMatchEvaluation;
  result: EvaluationResult;
  maxNotified: number;
}) {
  if (evaluation.reasons.length > 0) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {evaluation.reasons.map((reason) => (
          <li key={reason.code}>
            <span title={reason.explanation}>
              <NeonChip tone="warning">{reason.label}</NeonChip>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span className="text-sm text-fg-subtle">
      {result === "eligible" ? `Eligible, but the ${maxNotified} closest were notified first` : "Meets every rule"}
    </span>
  );
}

function LocateButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-xl border border-line-strong bg-fg/[0.03] text-fg-muted transition-all duration-200",
        TAP_TARGET_SQUARE,
        "hover:border-neon-cyan/50 hover:text-neon-cyan hover:shadow-[0_0_14px_-4px_var(--color-neon-cyan)] active:scale-95",
      )}
    >
      <LocateFixed aria-hidden="true" className="size-4" />
      <span className="sr-only">Show {name} on the map</span>
    </button>
  );
}
