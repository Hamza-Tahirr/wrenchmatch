"use client";

import { Crosshair, Layers } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MapView, type MapPoint } from "@/components/map";
import { cn } from "@/lib/cn";
import type { AdminMatchEvaluation } from "@/server/admin/requests";

import { TAP_TARGET } from "../../_lib/ui";
import { diagnosticsLayers, diagnosticsLegend, requestPointId, type DiagnosticsRequest } from "./diagnostics-layers";
import { MapKey } from "./map-key";

// One diagnostics map for the matching-failures page: every request that needs follow-up as
// a pulsing red diamond; focusing one (from the map, the picker or a card's "Show on map"
// button) adds the mechanics its last matching run evaluated, with their travel radius.

export const MATCHING_FOCUS_EVENT = "wm-admin-matching-focus";

export type MatchingMapFailure = {
  request: DiagnosticsRequest;
  matchedCount: number;
  evaluations: AdminMatchEvaluation[];
};

/** Asks the matching map to focus a request (dispatched by the cards' buttons). */
export function focusMatchingRequest(requestId: string): void {
  window.dispatchEvent(new CustomEvent<{ requestId: string }>(MATCHING_FOCUS_EVENT, { detail: { requestId } }));
}

export function MatchingMap({ failures }: { failures: readonly MatchingMapFailure[] }) {
  const [focusId, setFocusId] = useState<string | null>(failures.length === 1 ? failures[0].request.id : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const focused = failures.find((failure) => failure.request.id === focusId) ?? null;

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const requestId = (event as CustomEvent<{ requestId?: string }>).detail?.requestId;
      if (!requestId || !failures.some((failure) => failure.request.id === requestId)) return;
      setFocusId(requestId);
      setSelectedId(requestPointId(requestId));
      const element = anchor.current;
      if (element) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      }
    };
    window.addEventListener(MATCHING_FOCUS_EVENT, onFocusRequest);
    return () => window.removeEventListener(MATCHING_FOCUS_EVENT, onFocusRequest);
  }, [failures]);

  const layers = useMemo(() => {
    const others: MapPoint[] = failures
      .filter((failure) => failure.request.id !== focusId)
      .map((failure) => ({
        id: requestPointId(failure.request.id),
        lat: failure.request.location.lat,
        lng: failure.request.location.lng,
        label: failure.request.title,
        description: `${failure.request.areaLabel} · ${failure.matchedCount === 0 ? "reached no mechanic" : `${failure.matchedCount} notified`}`,
        tone: "danger",
        kind: "home",
        pulse: true,
        hideLabel: focusId !== null,
      }));
    if (!focused) return { points: others, circles: [], lines: [] };
    const detail = diagnosticsLayers(focused.request, focused.evaluations, { requestTone: "danger" });
    return { points: [...detail.points, ...others], circles: detail.circles, lines: detail.lines };
  }, [failures, focusId, focused]);

  const legend = focused
    ? diagnosticsLegend(focused.evaluations, "danger")
    : [{ tone: "danger" as const, label: "Request needing follow-up (ZIP area)", kind: "home" as const }];

  const onSelect = (id: string | null) => {
    setSelectedId(id);
    const failure = id ? failures.find((item) => requestPointId(item.request.id) === id) : undefined;
    if (failure) setFocusId(failure.request.id);
  };

  return (
    <div ref={anchor} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Focus the map on a request">
        <button
          type="button"
          aria-pressed={focusId === null}
          onClick={() => {
            setFocusId(null);
            setSelectedId(null);
          }}
          className={cn(
            "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95",
            TAP_TARGET,
            focusId === null
              ? "border-neon-cyan/50 bg-neon-cyan/12 text-fg shadow-[0_0_16px_-6px_var(--color-neon-cyan)]"
              : "border-line-strong bg-fg/[0.03] text-fg-muted hover:text-fg",
          )}
        >
          <Layers aria-hidden="true" className="size-3.5" />
          Every request
        </button>
        {failures.map((failure) => {
          const on = focusId === failure.request.id;
          return (
            <button
              key={failure.request.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setFocusId(failure.request.id);
                setSelectedId(requestPointId(failure.request.id));
              }}
              className={cn(
                "inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95",
                TAP_TARGET,
                on
                  ? "border-danger-300/70 bg-danger-50 text-fg shadow-[0_0_16px_-6px_var(--color-danger-500)]"
                  : "border-line-strong bg-fg/[0.03] text-fg-muted hover:text-fg",
              )}
            >
              <Crosshair aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{failure.request.title}</span>
            </button>
          );
        })}
      </div>
      <MapView
        label="Matching diagnostics map: requests needing follow-up and, for the focused request, every mechanic its last run evaluated (approximate ZIP areas)"
        points={layers.points}
        circles={layers.circles}
        lines={layers.lines}
        selectedId={selectedId}
        onSelect={onSelect}
        cluster={false}
        height="clamp(16rem, min(50vh, 95vw), 30rem)"
        listTitle="Requests needing follow-up and the mechanics evaluated"
        fitMaxZoom={11}
      />
      <MapKey items={legend} />
    </div>
  );
}
