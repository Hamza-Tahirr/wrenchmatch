"use client";

import { useMemo } from "react";

import { milesBetween, type MapCircle, type MapPoint } from "@/components/map/geo";
import { MapLegend, type MapLegendItem } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import type { MechanicServiceMode } from "@/lib/domain";
import type { ZipCentroidOption } from "@/server/mechanic/form-options";

import { CountUp } from "./count-up";
import { HudLabel } from "./hud";

// The mechanic's service area, live: the base ZIP's center, the travel-radius ring, and how
// many pilot ZIP areas fall inside it. It follows the form as the mechanic types (the map
// glides to the new base or radius). Only ZIP centroids (public reference points) are drawn.

type ServiceAreaMapProps = {
  /** The base ZIP as typed (5 digits once complete). */
  zip: string;
  /** The travel radius as typed, in miles. */
  radius: string;
  mode: MechanicServiceMode | "";
  centroids: readonly ZipCentroidOption[];
  /** Pilot ZIPs that requests can come from (subset of the centroids). */
  pilotZips: readonly string[];
  height?: string;
  className?: string;
};

const RADIUS_MIN = 1;
const RADIUS_MAX = 100;

export function ServiceAreaMap({ zip, radius, mode, centroids, pilotZips, height = "clamp(15rem, 36vh, 20rem)", className }: ServiceAreaMapProps) {
  const base = useMemo(() => centroids.find((entry) => entry.zip === zip.trim()) ?? null, [centroids, zip]);
  const radiusMiles = useMemo(() => {
    const value = Number(radius);
    return Number.isInteger(value) && value >= RADIUS_MIN && value <= RADIUS_MAX ? value : null;
  }, [radius]);
  const mobile = mode !== "garage";

  const pilot = useMemo(() => new Set(pilotZips), [pilotZips]);
  const covered = useMemo(() => {
    if (!base || !radiusMiles || !mobile) return null;
    return centroids.filter((entry) => pilot.has(entry.zip) && milesBetween(base, entry) <= radiusMiles).length;
  }, [base, radiusMiles, mobile, centroids, pilot]);

  const points: MapPoint[] = base
    ? [
        {
          id: "base",
          lat: base.lat,
          lng: base.lng,
          label: "Your base",
          description: `${base.label} (ZIP center)`,
          tone: "violet",
          kind: "home",
          pulse: true,
        },
      ]
    : [];
  const circles: MapCircle[] =
    base && radiusMiles && mobile
      ? [{ id: "radius", lat: base.lat, lng: base.lng, radiusMiles, tone: "violet", dashed: true, label: `You travel up to ${radiusMiles} mi from ${base.label}.` }]
      : [];
  const legend: MapLegendItem[] = [
    { tone: "violet", label: "Your base", kind: "home" },
    ...(circles.length > 0 ? [{ tone: "violet" as const, label: `${radiusMiles} mi radius`, kind: "ring" as const }] : []),
  ];

  const typedZip = zip.trim();
  let status: string;
  if (!/^\d{5}$/.test(typedZip)) status = "Enter a 5-digit base ZIP to see your service area.";
  else if (!base) status = `We don't have a map point for ZIP ${typedZip} yet. Enter a nearby ZIP code.`;
  else if (!mobile) status = `Garage only: customers bring their car to you near ${base.label}.`;
  else if (!radiusMiles) status = `Enter a travel radius from ${RADIUS_MIN} to ${RADIUS_MAX} miles.`;
  else status = `Mobile jobs within ${radiusMiles} mi of ${base.label}.`;

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <HudLabel>Live service area</HudLabel>
          <p className="text-sm text-fg-muted" aria-live="polite">
            {status}
          </p>
        </div>
        {covered !== null ? (
          <p className="rounded-xl border border-neon-violet/40 bg-neon-violet/10 px-3 py-1.5 text-sm text-fg">
            <CountUp value={covered} className="font-mono font-semibold" /> of {pilotZips.length} pilot ZIP areas in range
          </p>
        ) : null}
      </div>
      <MapView
        label="Map of your service area (approximate: ZIP centers)"
        points={points}
        circles={circles}
        height={height}
        fitMaxZoom={11}
        zoom={8.5}
        list="sr-only"
        listTitle="Your service area"
        legend={base ? <MapLegend items={legend} /> : undefined}
      />
    </div>
  );
}
