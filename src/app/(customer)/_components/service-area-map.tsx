import { Lock } from "lucide-react";

import { approximateArea, type MapLine, type MapPoint } from "@/components/map/geo";
import { MapLegend } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import type { MechanicPublicProfile } from "@/server/customer/mechanic-public";

import { InlineNote } from "./facts";

/**
 * The request's approximate area (its ZIP centroid) and the mechanic's base area (their
 * base-ZIP centroid), joined by a line: never an address, on either side.
 */
export function ServiceAreaMap({
  requestArea,
  requestAreaLabel,
  mechanic,
  mode,
  confirmed = false,
  height = "16rem",
}: {
  requestArea: { lat: number; lng: number };
  requestAreaLabel: string;
  mechanic: MechanicPublicProfile;
  mode: "mobile" | "garage";
  /** A confirmed booking: the exact addresses are already shared in the contact panel. */
  confirmed?: boolean;
  height?: string;
}) {
  const points: MapPoint[] = [
    {
      id: "request-area",
      lat: requestArea.lat,
      lng: requestArea.lng,
      label: mode === "mobile" ? "Where the work happens" : "Your area",
      description: `${requestAreaLabel} · approximate area`,
      kind: "home",
      tone: "cyan",
      pulse: true,
    },
    {
      id: `mechanic-${mechanic.id}`,
      lat: mechanic.approxLocation.lat,
      lng: mechanic.approxLocation.lng,
      label: mechanic.displayName,
      description: [mechanic.areaLabel, mechanic.distanceLabel ? `${mechanic.distanceLabel} away` : null].filter(Boolean).join(" · "),
      tone: "violet",
    },
  ];
  const lines: MapLine[] = [
    {
      id: "route",
      from: mechanic.approxLocation,
      to: requestArea,
      tone: "violet",
      label: mechanic.distanceLabel ? `${mechanic.distanceLabel} between the two areas (approximate)` : undefined,
    },
  ];
  return (
    <div className="space-y-3">
      <MapView
        label={`Approximate areas: your request and ${mechanic.displayName}'s base`}
        height={height}
        points={points}
        circles={[
          approximateArea(requestArea, { id: "request-ring", label: "Your approximate area" }),
          // The base area as a dashed ring: it also keeps the mechanic's marker clear of the
          // map's edges and attribution when the map fits both areas.
          {
            ...approximateArea(mechanic.approxLocation, {
              id: "mechanic-ring",
              tone: "violet",
              label: `${mechanic.displayName}'s approximate base area`,
            }),
            dashed: true,
          },
        ]}
        lines={lines}
        cluster={false}
        listTitle="Areas on this map"
      />
      <MapLegend
        className="rounded-2xl border border-line bg-surface/60 px-3 py-2 text-xs text-fg-muted"
        items={[
          { tone: "cyan", label: "Your area", kind: "home" },
          { tone: "violet", label: `${mechanic.displayName}'s base area` },
        ]}
      />
      <InlineNote icon={<Lock />}>
        Approximate ZIP code areas only.{" "}
        {confirmed
          ? mode === "garage"
            ? "The garage's exact address is in the contact panel."
            : "Your mechanic has the address you gave for this booking."
          : mode === "garage"
            ? "The garage's exact address is shared once the booking is confirmed."
            : "Your street address is shared with the mechanic once the booking is confirmed."}
      </InlineNote>
    </div>
  );
}
