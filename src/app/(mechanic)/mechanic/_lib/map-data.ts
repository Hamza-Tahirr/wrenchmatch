// Map data for the mechanic pages, safe in Server and Client Components. Every coordinate here
// comes from a DTO that already holds only ZIP centroids (the request's ZIP, or the mechanic's
// own base ZIP), and only for records the mechanic may see (docs/ARCHITECTURE.md section 8).

import type { MapCircle, MapLegendItem, MapPoint, MapTone } from "@/components/map";
import type { BookingStatus, QuoteStatus } from "@/lib/domain";
import type { JobAvailability } from "@/server/mechanic/labels";
import type { MechanicMapBase } from "@/server/mechanic/map";

/** A record on a mechanic map: one card on the page, at its request's approximate area. */
export type MapItem = {
  /** The card's id (request, quote or booking id). */
  id: string;
  lat: number;
  lng: number;
  /** "2015 Toyota Camry" */
  title: string;
  /** "Open · Tempe, AZ 85282 · about 3 mi" */
  detail: string;
  tone: MapTone;
  href: string;
  hrefLabel: string;
};

export const BASE_POINT_ID = "base";

export const AVAILABILITY_TONE: Readonly<Record<JobAvailability, MapTone>> = {
  open: "cyan",
  quoted_by_you: "violet",
  selected_pending_payment: "warning",
  booked_with_you: "success",
  unavailable: "neutral",
};

export const QUOTE_TONE: Readonly<Record<QuoteStatus, MapTone>> = {
  submitted: "violet",
  selected: "success",
  withdrawn: "neutral",
  expired: "neutral",
  declined: "neutral",
};

export const BOOKING_TONE: Readonly<Record<BookingStatus, MapTone>> = {
  pending_payment: "warning",
  confirmed: "cyan",
  in_progress: "blue",
  completed: "success",
  cancelled: "neutral",
  disputed: "danger",
};

/** The mechanic's base as a diamond marker (approximate: the base ZIP's centroid). */
export function basePoint(base: MechanicMapBase, options: { pulse?: boolean; label?: string } = {}): MapPoint {
  const radius = base.serviceMode === "garage" ? "garage only" : `${base.travelRadiusMiles} mi travel radius`;
  return {
    id: BASE_POINT_ID,
    lat: base.point.lat,
    lng: base.point.lng,
    label: options.label ?? "Your base",
    description: `${base.areaLabel} · ${radius}`,
    tone: "violet",
    kind: "home",
    pulse: options.pulse ?? false,
  };
}

/** The travel-radius ring around the base (mobile work only; garage-only mechanics have none). */
export function baseRing(base: MechanicMapBase): MapCircle | null {
  if (base.serviceMode === "garage") return null;
  return {
    id: "base-radius",
    lat: base.point.lat,
    lng: base.point.lng,
    radiusMiles: base.travelRadiusMiles,
    tone: "violet",
    dashed: true,
    label: `You travel up to ${base.travelRadiusMiles} mi from ${base.areaLabel} (base ZIP center).`,
  };
}

/** "lat,lng" of a point at the precision the DTOs use: cards in one ZIP share a marker. */
export function areaKey(item: Pick<MapItem, "lat" | "lng">): string {
  return `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
}

export const BASE_LEGEND: MapLegendItem[] = [
  { tone: "violet", label: "Your base", kind: "home" },
  { tone: "violet", label: "Travel radius", kind: "ring" },
];
