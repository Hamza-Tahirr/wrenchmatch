"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MapView } from "@/components/map/map-view";
import { MapLegend, type MapLegendItem } from "@/components/map/map-legend";
import { approximateArea, milesBetween, type LatLng, type MapCircle, type MapPoint } from "@/components/map/geo";
import { prefersReducedMotion } from "@/components/motion/hydration";
import type { MechanicMapBase } from "@/server/mechanic/map";

import { areaKey, BASE_LEGEND, BASE_POINT_ID, basePoint, baseRing, type MapItem } from "../_lib/map-data";
import { useMapSelection } from "./map-selection";

type JobsMapProps = {
  /** Accessible name, e.g. "New job matches near your base (approximate areas)". */
  label: string;
  base: MechanicMapBase | null;
  items: readonly MapItem[];
  /** Legend entries for the item tones shown (the base and radius are added). */
  legend: readonly MapLegendItem[];
  height?: string;
  className?: string;
};

type Group = { key: string; pointId: string; items: MapItem[] };

function groupByArea(items: readonly MapItem[]): Group[] {
  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = areaKey(item);
    const group = groups.get(key) ?? { key, pointId: `area-${key}`, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Rough width of the fitted map in miles: the travel ring fills about half of it, or the job areas' spread. */
function milesAcross(base: MechanicMapBase | null, groups: readonly Group[]): number {
  const points: LatLng[] = groups.map((group) => group.items[0]);
  if (base) points.push(base.point);
  let spread = 0;
  for (const a of points) for (const b of points) spread = Math.max(spread, milesBetween(a, b));
  const ring = base && base.serviceMode !== "garage" ? base.travelRadiusMiles * 4 : 0;
  return Math.max(ring, spread * 1.6, 8);
}

/**
 * Which groups get a floating name chip. A chip (about 160 x 24 px) hangs just under its dot;
 * at the map's scale (a ~400 px wide map spanning `milesAcross` miles) it must not cover another
 * active job's dot or another chip. Closed (neutral) jobs never get a chip and never block one.
 * Earlier groups (open jobs come first) win; the others are named by their popup, the legend
 * and the cards beside the map.
 */
function labelledGroupKeys(groups: readonly Group[], base: MechanicMapBase | null): Set<string> {
  const keys = new Set<string>();
  if (groups.length > 6) return keys;
  const pixelsPerMile = 400 / milesAcross(base, groups);
  // Screen offset of `to` from `from` in px: x to the east, y to the south.
  const offset = (from: LatLng, to: LatLng) => ({
    x: Math.sign(to.lng - from.lng) * milesBetween(from, { lat: from.lat, lng: to.lng }) * pixelsPerMile,
    y: Math.sign(from.lat - to.lat) * milesBetween(from, { lat: to.lat, lng: from.lng }) * pixelsPerMile,
  });
  const active = groups.filter((group) => group.items[0].tone !== "neutral");
  const dots: LatLng[] = active.map((group) => group.items[0]);
  const placed: LatLng[] = [];
  active.forEach((group, index) => {
    const point = dots[index];
    const coversDot = dots.some((dot) => {
      if (dot === point) return false;
      const { x, y } = offset(point, dot);
      return Math.abs(x) < 88 && y > 2 && y < 42;
    });
    const hitsChip = placed.some((other) => {
      const { x, y } = offset(point, other);
      return Math.abs(x) < 160 && Math.abs(y) < 28;
    });
    if (coversDot || hitsChip) return;
    placed.push(point);
    keys.add(group.key);
  });
  return keys;
}

/** Same text MapView puts in a marker's aria-label (used to find the marker for hover). */
function markerLabel(point: MapPoint): string {
  return `${point.label}${point.description ? `, ${point.description}` : ""} (approximate location)`;
}

/**
 * The job board's map: each card's request as an approximate area (ZIP centroid, colored by
 * status), the mechanic's base with the travel-radius ring, and two-way selection with the
 * cards (MapSelectionProvider). Cards in the same ZIP share one marker.
 */
export function JobsMap({ label, base, items, legend, height = "clamp(15rem, 42vh, 24rem)", className }: JobsMapProps) {
  const selection = useMapSelection();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupByArea(items), [items]);

  const { points, circles, pointByCard } = useMemo(() => {
    const byCard = new Map<string, MapPoint>();
    const markerPoints: MapPoint[] = [];
    const rings: MapCircle[] = [];
    const labelled = labelledGroupKeys(groups, base);
    for (const group of groups) {
      const first = group.items[0];
      const single = group.items.length === 1;
      const point: MapPoint = {
        id: group.pointId,
        lat: first.lat,
        lng: first.lng,
        label: single ? first.title : `${group.items.length} jobs here`,
        description: single ? first.detail : group.items.map((item) => item.title).join(" · "),
        tone: first.tone,
        href: single ? first.href : undefined,
        hrefLabel: single ? first.hrefLabel : undefined,
        hideLabel: !labelled.has(group.key),
      };
      markerPoints.push(point);
      rings.push(approximateArea(first, { id: `ring-${group.key}`, tone: first.tone, radiusMiles: 1.2 }));
      for (const item of group.items) byCard.set(item.id, point);
    }
    if (base) {
      // Named by the legend (and its popup) once job markers carry their own labels.
      markerPoints.unshift({ ...basePoint(base, { pulse: items.length === 0 }), hideLabel: items.length > 0 });
      const ring = baseRing(base);
      if (ring) rings.unshift(ring);
    }
    return { points: markerPoints, circles: rings, pointByCard: byCard };
  }, [groups, base, items.length]);

  const selectedCard = selection?.selectedId ?? null;
  const selectedPoint = selectedCard ? (pointByCard.get(selectedCard)?.id ?? null) : null;
  // The base marker has no card: its popup is a map-only selection.
  const [baseSelected, setBaseSelected] = useState(false);
  const shownSelection = selectedPoint ?? (baseSelected ? BASE_POINT_ID : null);
  const hoveredPoint = selection?.hoveredId ? (pointByCard.get(selection.hoveredId) ?? null) : null;

  // A card's "Show on map" on a phone: bring the map (above the list) into view.
  const version = selection?.version ?? 0;
  const source = selection?.source ?? null;
  useEffect(() => {
    if (source !== "list" || !selectedPoint) return;
    const element = wrapperRef.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.top < 64 || box.bottom > window.innerHeight) {
      element.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [source, selectedPoint, version]);

  // Hovering a card makes its marker glow (no camera move).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !hoveredPoint) return;
    const wanted = markerLabel(hoveredPoint);
    const marker = [...wrapper.querySelectorAll<HTMLElement>(".wm-marker")].find(
      (element) => element.getAttribute("aria-label") === wanted,
    );
    const dot = marker?.querySelector<HTMLElement>(".wm-marker-dot");
    if (!marker || !dot) return;
    marker.style.zIndex = "5";
    dot.style.transform = "scale(1.5)";
    dot.style.filter = "brightness(1.25)";
    return () => {
      marker.style.zIndex = "";
      dot.style.transform = "";
      dot.style.filter = "";
    };
  }, [hoveredPoint]);

  return (
    <div ref={wrapperRef} className={className}>
      <MapView
        label={label}
        points={points}
        circles={circles}
        selectedId={shownSelection}
        onSelect={(pointId) => {
          setBaseSelected(pointId === BASE_POINT_ID);
          if (!selection) return;
          if (pointId === null || pointId === BASE_POINT_ID) {
            if (selection.selectedId !== null) selection.select(null, "map");
            return;
          }
          const group = groups.find((entry) => entry.pointId === pointId);
          if (group) selection.select(group.items[0].id, "map");
        }}
        height={height}
        list="none"
        fitMaxZoom={11.5}
      />
      {/* Below the map (not overlaid): on this narrow column an overlay would cover the attribution. */}
      <div className="mt-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-fg-muted">
        <MapLegend items={[...legend, ...(base ? BASE_LEGEND.slice(0, base.serviceMode === "garage" ? 1 : 2) : [])]} />
      </div>
    </div>
  );
}
