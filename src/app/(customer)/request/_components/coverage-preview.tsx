"use client";

import { Radar } from "lucide-react";
import { useMemo } from "react";

import { approximateArea, milesBetween, type MapCircle, type MapPoint } from "@/components/map/geo";
import { MapLegend } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import { pluralize } from "@/lib/format";
import type { Coverage, CoverageZip } from "@/server/catalog/coverage";

/** Other served ZIPs shown around the typed one (miles between ZIP centroids). */
const NEIGHBOR_MILES = 7;

/**
 * A live preview of the typed ZIP's approximate area (a ring around the ZIP centroid, never
 * an address) with the nearby ZIP codes we serve. Typing another ZIP flies the map there.
 */
export function CoveragePreview({ selected, coverage }: { selected: CoverageZip; coverage: Coverage }) {
  const metro = coverage.metros.find((item) => item.metroLabel === selected.metroLabel);

  const { points, circles, nearby } = useMemo(() => {
    const neighbors = coverage.zips.filter(
      (zip) => zip.zip !== selected.zip && milesBetween(zip, selected) <= NEIGHBOR_MILES,
    );
    const mapPoints: MapPoint[] = [
      {
        id: `zip-${selected.zip}`,
        lat: selected.lat,
        lng: selected.lng,
        label: selected.zip,
        description: `${selected.areaLabel} · approximate area`,
        kind: "home",
        tone: "cyan",
        pulse: true,
      },
    ];
    const mapCircles: MapCircle[] = [
      ...neighbors.map((zip) => ({
        id: `served-${zip.zip}`,
        lat: zip.lat,
        lng: zip.lng,
        radiusMiles: 0.55,
        tone: "violet" as const,
        dashed: false,
      })),
      approximateArea(selected, { id: "typed-area", radiusMiles: 2, label: `Approximate area of ${selected.zip}` }),
    ];
    return { points: mapPoints, circles: mapCircles, nearby: neighbors.length };
  }, [coverage.zips, selected]);

  return (
    <div className="animate-scale-in space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <Radar aria-hidden="true" className="size-4 text-neon-cyan" />
          {selected.areaLabel}
        </p>
        {metro ? (
          <p className="font-mono text-xs text-fg-subtle tabular">
            {pluralize(metro.zipCount, "ZIP code")} served in the {metro.metroLabel}
          </p>
        ) : null}
      </div>
      <MapView
        label={`Approximate area of ZIP ${selected.zip} and nearby ZIP codes we serve`}
        height="clamp(13rem, 40vw, 16.5rem)"
        points={points}
        circles={circles}
        cluster={false}
        list="sr-only"
        listTitle="Area shown on the map"
        fitMaxZoom={11.5}
        legend={
          <MapLegend
            items={[
              { tone: "cyan", label: "Your approximate area", kind: "home" },
              ...(nearby > 0 ? [{ tone: "violet" as const, label: `${pluralize(nearby, "nearby ZIP")} we serve` }] : []),
            ]}
          />
        }
      />
    </div>
  );
}
