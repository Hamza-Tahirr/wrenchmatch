"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";

import { MapView, type MapLegendItem, type MapPoint } from "@/components/map";

import { zipPointId } from "./ids";
import { MapKey } from "./map-key";

// The settings page's pilot-area console: a coverage map of every pilot ZIP (enabled vs
// disabled) linked both ways to the ZIP tables below it (rendered on the server and passed as
// children; rows carry data-map-id), plus a live preview of the ZIP being added, sent by the
// pilot ZIP form. ZIP centroids only: approximate by construction.

export const ZIP_PREVIEW_EVENT = "wm-admin-zip-preview";

export type ZipPreview = { zip: string; lat: number; lng: number; label: string };

/** Shows (or, with null, clears) the "new ZIP" preview point on the coverage map. */
export function previewPilotZip(preview: ZipPreview | null): void {
  window.dispatchEvent(new CustomEvent<ZipPreview | null>(ZIP_PREVIEW_EVENT, { detail: preview }));
}

export type CoverageZip = {
  zip: string;
  city: string;
  state: string;
  metroLabel: string;
  enabled: boolean;
  lat: number;
  lng: number;
  activeRequests: number;
  mechanicsBasedHere: number;
};

const PREVIEW_ID = "zip-preview";
const HOVER_DELAY_MS = 260;

export function CoverageConsole({ zips, form, children }: { zips: readonly CoverageZip[]; form: ReactNode; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ZipPreview | null>(null);
  const tablesRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<ZipPreview | null>).detail;
      // Not selected: the map refits to show the new point next to the pilot area (its label stays on).
      setPreview(detail ?? null);
    };
    window.addEventListener(ZIP_PREVIEW_EVENT, onPreview);
    return () => {
      window.removeEventListener(ZIP_PREVIEW_EVENT, onPreview);
      window.clearTimeout(hoverTimer.current);
    };
  }, []);

  // Marker → row: light up the selected ZIP's row in the tables.
  useEffect(() => {
    const root = tablesRef.current;
    if (!root) return;
    for (const row of root.querySelectorAll<HTMLElement>("[data-map-id]")) {
      if (row.dataset.mapId === selectedId) row.setAttribute("data-active", "");
      else row.removeAttribute("data-active");
    }
  }, [selectedId]);

  const points = useMemo(() => {
    const list: MapPoint[] = zips.map((zip) => ({
      id: zipPointId(zip.zip),
      lat: zip.lat,
      lng: zip.lng,
      label: `ZIP ${zip.zip}`,
      description: [
        `${zip.city}, ${zip.state}`,
        zip.metroLabel,
        zip.enabled ? "enabled" : "disabled",
        `${zip.activeRequests} waiting for quotes`,
        `${zip.mechanicsBasedHere} ${zip.mechanicsBasedHere === 1 ? "mechanic" : "mechanics"} based here`,
      ].join(" · "),
      tone: zip.enabled ? "cyan" : "neutral",
      hideLabel: true,
    }));
    const existing = preview ? zips.find((zip) => zip.zip === preview.zip) : undefined;
    if (preview && !existing) {
      list.push({
        id: PREVIEW_ID,
        lat: preview.lat,
        lng: preview.lng,
        label: `New: ZIP ${preview.zip}`,
        description: `${preview.label} · preview of the approximate center, not saved yet`,
        tone: "violet",
        kind: "home",
        pulse: true,
      });
    }
    return list;
  }, [zips, preview]);

  const legend: MapLegendItem[] = [
    { tone: "cyan", label: "Enabled pilot ZIP" },
    { tone: "neutral", label: "Disabled pilot ZIP" },
    ...(preview ? [{ tone: "violet" as const, label: "ZIP being added (preview)", kind: "home" as const }] : []),
  ];

  // Row → marker (event delegation: the rows are server-rendered).
  const rowId = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest<HTMLElement>("[data-map-id]")?.dataset.mapId ?? null) : null;
  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const id = rowId(event.target);
    window.clearTimeout(hoverTimer.current);
    if (id && id !== selectedId) hoverTimer.current = window.setTimeout(() => setSelectedId(id), HOVER_DELAY_MS);
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const id = rowId(event.target);
    if (id) setSelectedId(id);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-2 xl:sticky xl:top-24">
        <MapView
          label="Pilot area coverage map: every pilot ZIP's approximate center, enabled or disabled"
          points={points}
          selectedId={selectedId}
          onSelect={setSelectedId}
          cluster={false}
          // ZIP markers have no label; the only one is the ZIP being added (preview).
          labels="always"
          height="clamp(16rem, min(52vh, 95vw), 30rem)"
          listTitle="Pilot ZIP codes on the map"
          fitMaxZoom={11}
        />
        <MapKey items={legend} />
        </div>
        {form}
      </div>
      <div ref={tablesRef} onMouseOver={onMouseOver} onMouseLeave={() => window.clearTimeout(hoverTimer.current)} onFocus={onFocus}>
        {children}
      </div>
    </div>
  );
}
