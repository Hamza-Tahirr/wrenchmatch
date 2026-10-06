"use client";

import { useMemo, useState } from "react";

import { MapView, type MapCircle, type MapLegendItem, type MapLine, type MapPoint } from "@/components/map";
import { cn } from "@/lib/cn";
import type { OperationsMap } from "@/server/admin/operations-map";

import { TAP_TARGET } from "../../_lib/ui";
import { ringLines } from "./diagnostics-layers";
import { MapKey } from "./map-key";

// The dashboard's operations map. Requests waiting for quotes are grouped by ZIP: they share
// the ZIP's centroid, so one pulsing marker per ZIP carries the count (red when any of them
// reached no mechanic). Mechanic bases are violet; pilot ZIPs show as coverage discs. Every
// point is a ZIP centroid: approximate by construction (no exact address exists here).

type Layer = "requests" | "mechanics" | "coverage" | "radius";

const LAYERS: readonly { key: Layer; label: string }[] = [
  { key: "requests", label: "Open requests" },
  { key: "mechanics", label: "Mechanic bases" },
  { key: "coverage", label: "Pilot coverage" },
  { key: "radius", label: "Travel radius" },
];

const MODE_LABELS = { mobile: "Mobile", garage: "Garage", both: "Mobile and garage" } as const;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function OpsMap({ data }: { data: OperationsMap }) {
  const [visible, setVisible] = useState<Record<Layer, boolean>>({
    requests: true,
    mechanics: true,
    coverage: true,
    radius: false,
  });

  const { points, circles, lines } = useMemo(() => {
    const points: MapPoint[] = [];
    const circles: MapCircle[] = [];
    const lines: MapLine[] = [];

    if (visible.coverage) {
      for (const zip of data.zips) {
        circles.push({
          id: `zip-${zip.zip}`,
          lat: zip.lat,
          lng: zip.lng,
          radiusMiles: 1.4,
          tone: zip.enabled ? "cyan" : "neutral",
          dashed: !zip.enabled,
          // No list entry per disc: the pilot ZIPs are listed (and managed) in Settings.
        });
      }
    }

    if (visible.radius) {
      for (const mechanic of data.mechanics) {
        if (mechanic.serviceMode === "garage") continue;
        lines.push(...ringLines(`radius-${mechanic.id}`, mechanic, mechanic.travelRadiusMiles, "violet"));
      }
    }

    if (visible.requests) {
      const byZip = Map.groupBy(data.requests, (request) => request.zip);
      for (const [zip, requests] of byZip) {
        const unmatched = requests.filter((request) => request.matchedCount === 0).length;
        const first = requests[0];
        const single = requests.length === 1;
        points.push({
          id: `requests-${zip}`,
          lat: first.lat,
          lng: first.lng,
          label: `${zip} · ${requests.length} waiting`,
          description: [
            first.areaLabel,
            single ? first.title : plural(requests.length, "request"),
            unmatched > 0 ? `${unmatched} reached no mechanic` : "every one reached mechanics",
          ].join(" · "),
          tone: unmatched > 0 ? "danger" : "cyan",
          pulse: true,
          // Only the areas that need attention carry a floating label (the rest: popup and list).
          hideLabel: unmatched === 0,
          href: single ? `/admin/requests/${first.id}` : unmatched > 0 ? "/admin/matching" : "/admin/requests?status=active",
          hrefLabel: single ? "Open request" : unmatched > 0 ? "Open matching" : "Open requests",
        });
      }
    }

    if (visible.mechanics) {
      for (const mechanic of data.mechanics) {
        points.push({
          id: `mechanic-${mechanic.id}`,
          lat: mechanic.lat,
          lng: mechanic.lng,
          label: mechanic.displayName,
          description: [
            mechanic.area,
            MODE_LABELS[mechanic.serviceMode],
            mechanic.serviceMode === "garage" ? null : `up to ${mechanic.travelRadiusMiles} mi`,
            mechanic.acceptingJobs ? null : "paused new jobs",
          ]
            .filter(Boolean)
            .join(" · "),
          tone: "violet",
          hideLabel: true,
          href: `/admin/mechanics/${mechanic.id}`,
          hrefLabel: "Open mechanic",
        });
      }
    }
    return { points, circles, lines };
  }, [data, visible]);

  const legend: MapLegendItem[] = [
    ...(visible.requests
      ? [
          { tone: "cyan" as const, label: "Requests reaching mechanics" },
          { tone: "danger" as const, label: "Reached no mechanic" },
        ]
      : []),
    ...(visible.mechanics ? [{ tone: "violet" as const, label: "Mechanic base (ZIP area)" }] : []),
    ...(visible.coverage
      ? [
          { tone: "cyan" as const, label: "Pilot ZIP enabled", kind: "ring" as const },
          { tone: "neutral" as const, label: "Pilot ZIP disabled", kind: "ring" as const },
        ]
      : []),
    ...(visible.radius ? [{ tone: "violet" as const, label: "Travel radius", kind: "ring" as const }] : []),
  ];

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Map layers" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {LAYERS.map((layer) => {
          const on = visible[layer.key];
          return (
            <button
              key={layer.key}
              type="button"
              aria-pressed={on}
              onClick={() => setVisible((current) => ({ ...current, [layer.key]: !current[layer.key] }))}
              className={cn(
                "inline-flex min-h-9 items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 sm:justify-start",
                TAP_TARGET,
                on
                  ? "border-neon-cyan/50 bg-neon-cyan/12 text-fg shadow-[0_0_16px_-6px_var(--color-neon-cyan)]"
                  : "border-line-strong bg-fg/[0.03] text-fg-muted hover:text-fg",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  on ? "bg-neon-cyan shadow-[0_0_8px_var(--color-neon-cyan)]" : "bg-fg-subtle",
                )}
              />
              {layer.label}
            </button>
          );
        })}
      </div>
      <MapView
        label="Operations map: pilot ZIPs, requests waiting for quotes and mechanic bases (approximate ZIP areas)"
        points={points}
        circles={circles}
        lines={lines}
        cluster={points.length > 30}
        // Only areas that need attention carry a label (the rest have hideLabel), so always show it.
        labels="always"
        // About half a phone screen (never taller than it is wide); up to 34rem on desktops.
        height="clamp(17rem, min(60vh, 105vw), 34rem)"
        listTitle="Requests, mechanics and pilot ZIPs on the map"
        fitMaxZoom={11}
      />
      <MapKey items={legend} />
    </div>
  );
}
