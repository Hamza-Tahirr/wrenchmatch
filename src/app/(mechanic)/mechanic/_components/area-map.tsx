import { Route } from "lucide-react";
import type { ReactNode } from "react";

import { approximateArea, type MapCircle, type MapPoint, type MapTone } from "@/components/map/geo";
import { MapLegend, type MapLegendItem } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import { formatMiles } from "@/lib/format";
import type { MechanicMapBase } from "@/server/mechanic/map";

import { basePoint, baseRing } from "../_lib/map-data";
import { ExpandableMap } from "./expandable-map";
import { Panel } from "./hud";

type AreaMapProps = {
  /** Panel title, e.g. "Where the job is". */
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  /** The request ZIP's centroid (approximate). */
  approxPoint: { lat: number; lng: number };
  /** "Tempe, AZ 85282" */
  areaLabel: string;
  /** Miles between the ZIP centers. */
  distanceMiles: number;
  /** The mechanic's own base (ZIP centroid) and travel radius, when known. */
  base: MechanicMapBase | null;
  tone: MapTone;
  /** Marker label of the job area. */
  areaName?: string;
  /** Pulse the job marker (open or active work). */
  pulse?: boolean;
  /** Extra content under the map. */
  footer?: ReactNode;
};

/**
 * A job's approximate area on the map: the request ZIP's area ring, the mechanic's base with
 * the travel radius, and the straight line between the two ZIP centers. Never an address,
 * even on bookings where the exact address is shown in text.
 */
export function AreaMap({
  title,
  eyebrow = "Approximate area",
  description = "ZIP-center areas only, never an exact address.",
  approxPoint,
  areaLabel,
  distanceMiles,
  base,
  tone,
  areaName = "Job area",
  pulse = true,
  footer,
}: AreaMapProps) {
  const distance = formatMiles(distanceMiles);
  // The job marker comes last so it sits on top. The base's floating label would collide
  // with the job's at metro zoom, so the base is named by the legend, its popup and the list.
  const points: MapPoint[] = [];
  if (base) points.push({ ...basePoint(base), hideLabel: true });
  points.push({
    id: "job",
    lat: approxPoint.lat,
    lng: approxPoint.lng,
    label: areaName,
    description: base ? `${areaLabel} · ${distance} from your base` : areaLabel,
    tone,
    pulse,
  });
  const circles: MapCircle[] = [approximateArea(approxPoint, { id: "job-area", tone, label: `${areaName}: around the center of ${areaLabel}.` })];
  const ring = base ? baseRing(base) : null;
  if (ring) circles.unshift(ring);
  const legend: MapLegendItem[] = [
    { tone, label: areaName },
    ...(base ? [{ tone: "violet" as const, label: "Your base", kind: "home" as const }] : []),
    ...(ring && base ? [{ tone: "violet" as const, label: `${base.travelRadiusMiles} mi radius`, kind: "ring" as const }] : []),
    ...(base ? [{ tone: "violet" as const, label: distance, kind: "line" as const }] : []),
  ];
  return (
    <Panel
      id="area-map"
      title={title}
      eyebrow={eyebrow}
      description={description}
      icon={<Route />}
      bodyClassName="space-y-3"
      actions={
        base ? (
          <span className="inline-flex items-center rounded-full border border-neon-violet/40 bg-neon-violet/10 px-3 py-1 font-mono text-sm text-fg tabular">
            {distance}
          </span>
        ) : null
      }
    >
      <ExpandableMap height="clamp(13rem, 34vh, 24rem)" expandedHeight="min(72vh, 40rem)">
        <MapView
          label={`Map: ${areaName.toLowerCase()} ${areaLabel}${base ? ` and your base ${base.areaLabel}` : ""} (approximate)`}
          points={points}
          circles={circles}
          lines={
            base ? [{ id: "route", from: base.point, to: approxPoint, tone: "violet", label: `${distance} between the ZIP centers (straight line).` }] : []
          }
          height="var(--wm-map-h)"
          fitMaxZoom={12}
          listTitle={`${areaName} and your base`}
          legend={<MapLegend items={legend} />}
        />
      </ExpandableMap>
      {footer}
    </Panel>
  );
}
