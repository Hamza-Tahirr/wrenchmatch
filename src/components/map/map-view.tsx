"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { List, MapPinned, Maximize2, WifiOff, X } from "lucide-react";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, Marker, Popup } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { preconnect } from "react-dom";

import type { Theme } from "@/components/theme/theme";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";

import {
  MAP_TONE_HEX,
  MAP_TONE_HEX_LIGHT,
  circleRing,
  contentBounds,
  mapToneVar,
  type LatLng,
  type MapCircle,
  type MapLine,
  type MapPoint,
} from "./geo";

const TILE_ORIGIN = "https://tiles.openfreemap.org";

/** OpenFreeMap styles per app theme (free, no key). Their attribution is shown by the map. */
export const MAP_STYLE_URLS: Readonly<Record<Theme, string>> = {
  dark: `${TILE_ORIGIN}/styles/dark`,
  light: `${TILE_ORIGIN}/styles/positron`,
};

/** The dark style (kept for existing imports; MapView picks the style from the theme). */
export const MAP_STYLE_URL = MAP_STYLE_URLS.dark;

// MapLibre 6 loads its worker from a URL. src/app/(public)/vendor/maplibre-gl serves the
// installed package's worker files; bump this together with package.json.
const MAPLIBRE_VERSION = "6.11.2";
const WORKER_URL = `/vendor/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl-worker.mjs`;

// Slow connections: wait this long for the first render, then retry the style once (after a
// short pause) before showing "Map unavailable".
const LOAD_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_500;

type MapLibreModule = typeof import("maplibre-gl");

export type MapViewProps = {
  /** Accessible name of the map, e.g. "Mechanics near your request (approximate areas)". */
  label: string;
  points?: MapPoint[];
  circles?: MapCircle[];
  lines?: MapLine[];
  /** Controlled selection (flies to the point and opens its popup). */
  selectedId?: string | null;
  /** Called with the selected point id (null when the popup closes). Client Components only. */
  onSelect?: (id: string | null) => void;
  /** Cluster nearby points (default: on above 30 points). */
  cluster?: boolean;
  /** CSS height of the map, e.g. "22rem" or "clamp(16rem, 50vh, 30rem)". */
  height?: string;
  className?: string;
  /** Legend content (e.g. <MapLegend items={…} />): overlaid from `sm`, below the map on phones. */
  legend?: ReactNode;
  /** Text alternative: "toggle" (a "List view" disclosure, default), "sr-only" or "none". */
  list?: "toggle" | "sr-only" | "none";
  /** Marker label chips: "always", "hover" (on hover/focus/selection) or "auto" (always up to 6 points). */
  labels?: "always" | "hover" | "auto";
  listTitle?: string;
  /** Used when there is nothing to fit. */
  center?: LatLng;
  zoom?: number;
  /** Closest zoom when fitting content (keeps approximate points approximate). */
  fitMaxZoom?: number;
  interactive?: boolean;
  /**
   * Phones: a "Full-screen map" button over the top-left corner (default true). It hides by
   * itself inside a wrapper that resizes the map through `--wm-map-h` and has its own button.
   */
  expandable?: boolean;
  /** Overrides the theme's base style (same style in both themes). */
  styleUrl?: string;
};

type Status = "idle" | "loading" | "ready" | "fallback";

const DEFAULT_CENTER: LatLng = { lat: 33.45, lng: -112.07 };
const MAX_ZOOM = 13;
const SOURCE_POINTS = "wm-points";
const SOURCE_CIRCLES = "wm-circles";
const SOURCE_LINES = "wm-lines";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toneHex(tone: MapPoint["tone"], theme: Theme): string {
  return (theme === "light" ? MAP_TONE_HEX_LIGHT : MAP_TONE_HEX)[tone ?? "cyan"];
}

function pointsCollection(points: readonly MapPoint[], theme: Theme): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: { id: point.id, color: toneHex(point.tone, theme) },
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    })),
  };
}

function circlesCollection(circles: readonly MapCircle[], theme: Theme): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: circles.map((circle) => ({
      type: "Feature",
      properties: { id: circle.id, color: toneHex(circle.tone, theme), dashed: circle.dashed !== false },
      geometry: { type: "Polygon", coordinates: [circleRing(circle, circle.radiusMiles)] },
    })),
  };
}

function linesCollection(lines: readonly MapLine[], theme: Theme): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      properties: { id: line.id, color: toneHex(line.tone, theme) },
      geometry: {
        type: "LineString",
        coordinates: [
          [line.from.lng, line.from.lat],
          [line.to.lng, line.to.lat],
        ],
      },
    })),
  };
}

type Tint = [RegExp, "background" | "fill" | "line", "background-color" | "fill-color" | "line-color", string];

// Re-colors OpenFreeMap's base styles toward the app palette: deep navy (dark style) or the
// cool blue-grey of the light theme (positron).
const BASE_TINTS: Readonly<Record<Theme, { layers: Tint[]; text: string; halo: string; raster: number }>> = {
  dark: {
    layers: [
      [/^background$/, "background", "background-color", "#060a17"],
      [/^water$/, "fill", "fill-color", "#0a1733"],
      [/^waterway/, "line", "line-color", "#0b1a39"],
      [/^(park|landcover_wood|landuse_park|landcover_grass)/, "fill", "fill-color", "#0a1822"],
      [/^landuse_residential/, "fill", "fill-color", "#0a0f20"],
      [/^building/, "fill", "fill-color", "#0d1427"],
      [/^(highway_minor|highway_path)/, "line", "line-color", "#152039"],
      [/^(highway_major_inner|highway_major_subtle)/, "line", "line-color", "#1d2a49"],
      [/^highway_motorway_inner/, "line", "line-color", "#25386a"],
      [/casing$/, "line", "line-color", "rgba(70, 104, 178, 0.35)"],
    ],
    text: "#9fb0d0",
    halo: "#060a17",
    raster: 0.18,
  },
  light: {
    layers: [
      [/^background$/, "background", "background-color", "#eef2f7"],
      [/^water$/, "fill", "fill-color", "#cddff0"],
      [/^waterway/, "line", "line-color", "#bad1e8"],
      [/^(park|landcover_wood|landuse_park|landcover_grass)/, "fill", "fill-color", "#e0ece6"],
      [/^landuse_residential/, "fill", "fill-color", "#e8ecf2"],
      [/^building/, "fill", "fill-color", "#e2e7ef"],
      [/^(highway_minor|highway_path)/, "line", "line-color", "#dde3ec"],
      [/^(highway_major_inner|highway_major_subtle)/, "line", "line-color", "#ffffff"],
      [/^highway_motorway_inner/, "line", "line-color", "#ffffff"],
      [/casing$/, "line", "line-color", "rgba(120, 140, 175, 0.35)"],
    ],
    text: "#4b5870",
    halo: "#f4f7fb",
    raster: 0.35,
  },
};

function tintBaseStyle(map: MapLibreMap, theme: Theme) {
  const tint = BASE_TINTS[theme];
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith("wm-")) continue;
    try {
      if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-color", tint.text);
        map.setPaintProperty(layer.id, "text-halo-color", tint.halo);
        continue;
      }
      if (layer.type === "raster") {
        map.setPaintProperty(layer.id, "raster-opacity", tint.raster);
        continue;
      }
      for (const [pattern, type, property, color] of tint.layers) {
        if (layer.type === type && pattern.test(layer.id)) {
          map.setPaintProperty(layer.id, property, color);
          break;
        }
      }
    } catch {
      // A style update renamed or removed a property; keep the original color.
    }
  }
}

function addDataLayers(map: MapLibreMap, clustered: boolean, theme: Theme) {
  const light = theme === "light";
  map.addSource(SOURCE_CIRCLES, { type: "geojson", data: circlesCollection([], theme) });
  map.addSource(SOURCE_LINES, { type: "geojson", data: linesCollection([], theme) });
  map.addLayer({
    id: "wm-circle-fill",
    type: "fill",
    source: SOURCE_CIRCLES,
    paint: { "fill-color": ["get", "color"], "fill-opacity": light ? 0.1 : 0.09 },
  });
  map.addLayer({
    id: "wm-circle-line-dashed",
    type: "line",
    source: SOURCE_CIRCLES,
    filter: ["==", ["get", "dashed"], true],
    paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.85, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "wm-circle-line",
    type: "line",
    source: SOURCE_CIRCLES,
    filter: ["==", ["get", "dashed"], false],
    paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "wm-line-glow",
    type: "line",
    source: SOURCE_LINES,
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 7, "line-blur": 6, "line-opacity": light ? 0.25 : 0.45 },
  });
  map.addLayer({
    id: "wm-line",
    type: "line",
    source: SOURCE_LINES,
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 1.75, "line-dasharray": [1.5, 1.8] },
  });

  if (!clustered) return;
  const tones = light ? MAP_TONE_HEX_LIGHT : MAP_TONE_HEX;
  map.addSource(SOURCE_POINTS, {
    type: "geojson",
    data: pointsCollection([], theme),
    cluster: true,
    clusterRadius: 52,
    clusterMaxZoom: 11,
  });
  const isCluster: ["has", string] = ["has", "point_count"];
  map.addLayer({
    id: "wm-cluster-glow",
    type: "circle",
    source: SOURCE_POINTS,
    filter: isCluster,
    paint: {
      "circle-color": tones.blue,
      "circle-radius": ["step", ["get", "point_count"], 24, 10, 30, 25, 36],
      "circle-blur": 1,
      "circle-opacity": light ? 0.3 : 0.5,
    },
  });
  map.addLayer({
    id: "wm-clusters",
    type: "circle",
    source: SOURCE_POINTS,
    filter: isCluster,
    paint: {
      "circle-color": light ? "#ffffff" : "#0d1631",
      "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 25, 23],
      "circle-stroke-color": tones.cyan,
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "wm-cluster-count",
    type: "symbol",
    source: SOURCE_POINTS,
    filter: isCluster,
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": light ? "#131a2b" : "#eaf3ff" },
  });
  map.addLayer({
    id: "wm-point-glow",
    type: "circle",
    source: SOURCE_POINTS,
    filter: ["!", isCluster],
    paint: { "circle-color": ["get", "color"], "circle-radius": 14, "circle-blur": 1, "circle-opacity": light ? 0.3 : 0.55 },
  });
  map.addLayer({
    id: "wm-point-selected",
    type: "circle",
    source: SOURCE_POINTS,
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-radius": 12,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "wm-point",
    type: "circle",
    source: SOURCE_POINTS,
    filter: ["!", isCluster],
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": 6,
      "circle-stroke-color": light ? "#ffffff" : "#eaf3ff",
      "circle-stroke-width": 1.5,
    },
  });
}

/**
 * Room around fitted content: extra at the top (corner buttons) and more at the bottom (label
 * chips hang below the markers and the attribution sits on the bottom edge). Scaled down on
 * very short maps so the content still fits.
 */
function fitPadding(container: HTMLElement) {
  const { clientWidth: width, clientHeight: height } = container;
  const base = Math.min(56, Math.max(24, width * 0.08));
  const scale = Math.min(1, Math.max(0, height - 48) / (2 * base + 56));
  return {
    top: Math.round((base + 16) * scale),
    bottom: Math.round((base + 40) * scale),
    left: Math.round(base),
    right: Math.round(base),
  };
}

function setSourceData(map: MapLibreMap, id: string, data: FeatureCollection) {
  const source = map.getSource<GeoJSONSource>(id);
  if (source) void source.setData(data);
}

function markerLabel(point: MapPoint): string {
  return `${point.label}${point.description ? `, ${point.description}` : ""} (approximate location)`;
}

function createMarkerElement(point: MapPoint, labelMode: "always" | "hover"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wm-marker";
  button.dataset.tone = point.tone ?? "cyan";
  button.dataset.kind = point.kind ?? "pin";
  button.dataset.pulse = String(Boolean(point.pulse));
  button.dataset.label = labelMode;
  button.setAttribute("aria-label", markerLabel(point));
  button.setAttribute("aria-pressed", "false");
  const pulse = document.createElement("span");
  pulse.className = "wm-marker-pulse";
  const dot = document.createElement("span");
  dot.className = "wm-marker-dot";
  button.append(pulse, dot);
  if (!point.hideLabel) {
    const chip = document.createElement("span");
    chip.className = "wm-marker-label";
    chip.textContent = point.label;
    chip.setAttribute("aria-hidden", "true");
    button.append(chip);
  }
  return button;
}

/** Hangs a label chip from the marker's side when centring it would cross the map's edge. */
function alignLabels(map: MapLibreMap, markers: Map<string, { marker: Marker; element: HTMLButtonElement }>) {
  const width = map.getContainer().clientWidth;
  for (const { marker, element } of markers.values()) {
    // The chip's half width is measured once (labels do not change size).
    if (element.dataset.half === undefined) {
      element.dataset.half = String((element.querySelector<HTMLElement>(".wm-marker-label")?.offsetWidth ?? 0) / 2);
    }
    const half = Number(element.dataset.half);
    if (!half) continue;
    const { x } = map.project(marker.getLngLat());
    const align = x - half < 8 ? "start" : x + half > width - 8 ? "end" : "center";
    if (element.dataset.align !== align) element.dataset.align = align;
  }
}

/** Keeps Tab inside the full-screen map. */
function trapTab(event: KeyboardEvent<HTMLDivElement>) {
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])"),
  ).filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function popupContent(point: MapPoint, navigate: (href: string) => void): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("p");
  title.className = "font-semibold text-fg";
  title.textContent = point.label;
  root.append(title);
  if (point.description) {
    const description = document.createElement("p");
    description.className = "mt-1 text-[13px] text-fg-muted";
    description.textContent = point.description;
    root.append(description);
  }
  if (point.href) {
    const href = point.href;
    const link = document.createElement("a");
    link.href = href;
    link.textContent = point.hrefLabel ?? "Open";
    link.className = "mt-2 inline-flex min-h-8 items-center font-semibold text-brand-700 underline-offset-4 hover:underline";
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(href);
    });
    root.append(link);
  }
  const note = document.createElement("p");
  note.className = "mt-2 text-[11px] font-medium tracking-wide text-fg-subtle uppercase";
  note.textContent = "Approximate location";
  root.append(note);
  return root;
}

/**
 * Neon map (MapLibre GL + OpenFreeMap) that follows the app theme: a deep-navy dark style or
 * a light positron style, switched live. Loaded only when it nears the viewport. HTML markers
 * with labels (kept inside the map), tones and a pulse; radius rings; connector lines;
 * clustering for many points; fits its content; flies to `selectedId`; keyboard-accessible
 * markers and popups; cooperative gestures (Ctrl/⌘ + scroll, two-finger pan) and, on phones,
 * an "Expand map" button for a full-screen map with one-finger panning; a skeleton until the
 * first render; one automatic retry, then a fallback card (with the list) when WebGL or the
 * network is unavailable; and a text list. PRIVACY: pass approximate points only (./geo.ts).
 */
export function MapView({
  label,
  points = [],
  circles = [],
  lines = [],
  selectedId: selectedIdProp,
  onSelect,
  cluster,
  height = "20rem",
  className,
  legend,
  list = "toggle",
  labels = "auto",
  listTitle = "Locations on this map",
  center = DEFAULT_CENTER,
  zoom = 9,
  fitMaxZoom = 11.5,
  interactive = true,
  expandable = true,
  styleUrl,
}: MapViewProps) {
  // Start the TLS handshake with the tile server while the page and MapLibre load.
  preconnect(TILE_ORIGIN, { crossOrigin: "anonymous" });

  const router = useRouter();
  const theme = useTheme();
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const popupRef = useRef<Popup | null>(null);
  const fittedKeyRef = useRef<string | null>(null);
  const appliedStyleRef = useRef<string | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [skeletonGone, setSkeletonGone] = useState(false);
  const [fallback, setFallback] = useState<"webgl" | "offline" | "error" | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hostExpands, setHostExpands] = useState(false);

  const clustered = cluster ?? points.length > 30;
  const labelMode = labels === "auto" ? (points.length <= 6 ? "always" : "hover") : labels;
  const selectedId = selectedIdProp !== undefined ? selectedIdProp : internalSelected;
  const dataKey = useMemo(() => JSON.stringify([points, circles, lines]), [points, circles, lines]);
  const style = styleUrl ?? MAP_STYLE_URLS[theme];

  // Latest values for imperative MapLibre callbacks.
  const latest = useRef({ points, circles, lines, selectedId, onSelect, fitMaxZoom, center, zoom, theme, style });
  useEffect(() => {
    latest.current = { points, circles, lines, selectedId, onSelect, fitMaxZoom, center, zoom, theme, style };
  });

  const select = useCallback((id: string | null) => {
    setInternalSelected(id);
    latest.current.onSelect?.(id);
  }, []);

  const navigate = useCallback((href: string) => router.push(href), [router]);

  // 1. Initialize only when the map is close to the viewport (and only if WebGL works).
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (supportsWebGL()) {
          setNearViewport(true);
          setStatus("loading");
        } else {
          setStatus("fallback");
          setFallback("webgl");
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 2. Create the map once.
  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    let loaded = false;
    let styleReady = false;
    let retried = false;
    let timeout = 0;
    let retryTimer = 0;
    let alignFrame = 0;
    const markers = markersRef.current;

    const fail = () => {
      if (loaded || cancelled) return;
      setStatus("fallback");
      setFallback(navigator.onLine ? "error" : "offline");
    };
    // One automatic retry of the style before giving up (slow or flaky connections).
    const retryOrFail = () => {
      const map = mapRef.current;
      if (loaded || cancelled) return;
      if (retried || !map || !navigator.onLine) {
        fail();
        return;
      }
      retried = true;
      window.clearTimeout(timeout);
      retryTimer = window.setTimeout(() => {
        if (cancelled || loaded) return;
        styleReady = false;
        appliedStyleRef.current = latest.current.style;
        map.setStyle(latest.current.style, { diff: false });
        timeout = window.setTimeout(fail, LOAD_TIMEOUT_MS);
      }, RETRY_DELAY_MS);
    };

    timeout = window.setTimeout(retryOrFail, LOAD_TIMEOUT_MS);

    import("maplibre-gl")
      .then((lib) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        libRef.current = lib;
        if (lib.getWorkerUrl() !== WORKER_URL) lib.setWorkerUrl(WORKER_URL);
        const { points: p, circles: c, lines: l, fitMaxZoom: maxFit, center: start, zoom: startZoom } = latest.current;
        const bounds = contentBounds(p, c, l);
        const padding = fitPadding(container);
        appliedStyleRef.current = latest.current.style;
        const map = new lib.Map({
          container,
          style: latest.current.style,
          ...(bounds
            ? {
                bounds: [
                  [bounds.west, bounds.south],
                  [bounds.east, bounds.north],
                ],
                fitBoundsOptions: { padding, maxZoom: maxFit },
              }
            : { center: [start.lng, start.lat], zoom: startZoom }),
          maxZoom: MAX_ZOOM,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          interactive,
          fadeDuration: 150,
          reduceMotion: reducedMotion() || undefined,
        });
        mapRef.current = map;
        fittedKeyRef.current = JSON.stringify([p, c, l]);
        map.touchZoomRotate.disableRotation();
        // The base styles reference a few sprite images they do not ship; fill them silently.
        map.setMissingStyleImageResolver((id) => {
          if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
        });
        if (interactive) map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.getCanvas().setAttribute("aria-label", "Interactive map (the list view has the same information)");

        map.on("error", (event) => {
          // Tile, glyph and sprite errors are not fatal; only a style that never loads is.
          const sourceId = (event as { sourceId?: unknown }).sourceId;
          if (!loaded && !styleReady && sourceId === undefined) retryOrFail();
        });
        // Every style load (the first one, the retry and theme switches): tint the base map
        // and re-add the app's layers with the current data.
        map.on("style.load", () => {
          if (cancelled) return;
          styleReady = true;
          const current = latest.current;
          tintBaseStyle(map, current.theme);
          addDataLayers(map, clustered, current.theme);
          setSourceData(map, SOURCE_CIRCLES, circlesCollection(current.circles, current.theme));
          setSourceData(map, SOURCE_LINES, linesCollection(current.lines, current.theme));
          if (clustered) {
            setSourceData(map, SOURCE_POINTS, pointsCollection(current.points, current.theme));
            map.setFilter("wm-point-selected", ["==", ["get", "id"], current.selectedId ?? ""]);
          }
        });
        map.on("load", () => {
          if (cancelled) return;
          loaded = true;
          window.clearTimeout(timeout);
          window.clearTimeout(retryTimer);
          if (clustered) {
            map.on("click", "wm-clusters", (event: MapLayerMouseEvent) => {
              const feature = event.features?.[0];
              const clusterId = feature?.properties?.cluster_id;
              const source = map.getSource<GeoJSONSource>(SOURCE_POINTS);
              if (typeof clusterId !== "number" || !source || feature?.geometry.type !== "Point") return;
              const [lng, lat] = feature.geometry.coordinates;
              void source.getClusterExpansionZoom(clusterId).then((nextZoom) => {
                map.easeTo({ center: [lng, lat], zoom: nextZoom, duration: reducedMotion() ? 0 : 400 });
              });
            });
            map.on("click", "wm-point", (event: MapLayerMouseEvent) => {
              const id = event.features?.[0]?.properties?.id;
              if (typeof id === "string") select(id);
            });
            for (const layer of ["wm-clusters", "wm-point"]) {
              map.on("mouseenter", layer, () => {
                map.getCanvas().style.cursor = "pointer";
              });
              map.on("mouseleave", layer, () => {
                map.getCanvas().style.cursor = "";
              });
            }
          }
          // A wrapper that resizes the map itself (`--wm-map-h`) brings its own expand button.
          setHostExpands(Boolean(wrapperRef.current?.parentElement?.closest("[style*='--wm-map-h']")));
          setStatus("ready");
        });
        map.on("move", () => {
          if (alignFrame) return;
          alignFrame = requestAnimationFrame(() => {
            alignFrame = 0;
            alignLabels(map, markers);
          });
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("fallback");
        setFallback(navigator.onLine ? "error" : "offline");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      cancelAnimationFrame(alignFrame);
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; data, selection, labels and the theme sync in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearViewport]);

  // 3. Theme switch: swap the base style live (the "style.load" handler re-adds the layers).
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || appliedStyleRef.current === style) return;
    appliedStyleRef.current = style;
    map.setStyle(style, { diff: false });
  }, [status, style]);

  // 4. Sync sources, markers and the camera with the data.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (status !== "ready" || !map || !lib) return;
    const { points: p, circles: c, lines: l, fitMaxZoom: maxFit, theme: currentTheme } = latest.current;
    setSourceData(map, SOURCE_CIRCLES, circlesCollection(c, currentTheme));
    setSourceData(map, SOURCE_LINES, linesCollection(l, currentTheme));

    const markers = markersRef.current;
    if (clustered) {
      setSourceData(map, SOURCE_POINTS, pointsCollection(p, currentTheme));
    } else {
      const keep = new Set(p.map((point) => point.id));
      for (const [id, entry] of markers) {
        if (!keep.has(id)) {
          entry.marker.remove();
          markers.delete(id);
        }
      }
      for (const point of p) {
        markers.get(point.id)?.marker.remove();
        const element = createMarkerElement(point, labelMode);
        element.addEventListener("click", (event) => {
          // Keep the click away from the map, whose click handler would close the new popup.
          event.stopPropagation();
          select(point.id);
        });
        const marker = new lib.Marker({ element, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map);
        markers.set(point.id, { marker, element });
      }
      alignLabels(map, markers);
    }

    if (fittedKeyRef.current !== dataKey) {
      fittedKeyRef.current = dataKey;
      const bounds = contentBounds(p, c, l);
      const padding = fitPadding(map.getContainer());
      if (bounds) {
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding, maxZoom: maxFit, duration: reducedMotion() ? 0 : 400 },
        );
      }
    }
  }, [status, dataKey, clustered, labelMode, select]);

  // 5. Selection: highlight, fly to it, open its popup.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (status !== "ready" || !map || !lib) return;
    for (const [id, { element }] of markersRef.current) {
      element.setAttribute("aria-pressed", String(id === selectedId));
    }
    if (clustered && map.getLayer("wm-point-selected")) {
      map.setFilter("wm-point-selected", ["==", ["get", "id"], selectedId ?? ""]);
    }

    const previous = popupRef.current;
    popupRef.current = null;
    previous?.remove();

    const point = selectedId ? latest.current.points.find((item) => item.id === selectedId) : undefined;
    if (!point) return;
    const markerElement = markersRef.current.get(point.id)?.element;
    const userStarted = markerElement !== undefined && markerElement === document.activeElement;
    const popupOffset = 22;
    const popup = new lib.Popup({
      closeButton: true,
      closeOnClick: true,
      focusAfterOpen: userStarted,
      offset: popupOffset,
      // Never wider than a phone-sized map; MapLibre picks the side that keeps it inside.
      maxWidth: "min(260px, calc(100vw - 4rem))",
    })
      .setLngLat([point.lng, point.lat])
      .setDOMContent(popupContent(point, navigate))
      .addTo(map);
    // Fly to the point, leaving room for the popup above it: on a short map the point lands
    // below the centre (MapLibre then opens the popup upwards instead of under the bottom edge).
    const mapHeight = map.getContainer().clientHeight;
    const room = popup.getElement().offsetHeight + popupOffset + 12;
    const targetY = Math.min(mapHeight - 28, Math.max(mapHeight / 2, room));
    map.flyTo({
      center: [point.lng, point.lat],
      zoom: Math.max(map.getZoom(), Math.min(latest.current.fitMaxZoom, 11)),
      offset: [0, Math.round(targetY - mapHeight / 2)],
      duration: reducedMotion() ? 0 : 400,
      essential: false,
    });
    popup.on("close", () => {
      if (popupRef.current !== popup) return;
      popupRef.current = null;
      const active = document.activeElement;
      if (markerElement && (active === document.body || active === null)) markerElement.focus();
      select(null);
    });
    popupRef.current = popup;
  }, [status, selectedId, clustered, dataKey, navigate, select]);

  // The skeleton fades out with the map's own fade-in (or after a short safety delay).
  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setTimeout(() => setSkeletonGone(true), 900);
    return () => window.clearTimeout(timer);
  }, [status]);

  // 6. Full-screen map on phones: shown in the top layer (a manual popover, so no ancestor
  // can clip it), one-finger panning, page scroll locked, Tab kept inside, Escape closes.
  useEffect(() => {
    const map = mapRef.current;
    const wrapper = wrapperRef.current;
    if (!expanded || !wrapper) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const topLayer = typeof wrapper.showPopover === "function";
    if (topLayer) {
      wrapper.setAttribute("popover", "manual");
      wrapper.showPopover();
    }
    map?.cooperativeGestures.disable();
    closeButtonRef.current?.focus();
    const frame = requestAnimationFrame(() => map?.resize());
    return () => {
      cancelAnimationFrame(frame);
      if (topLayer && wrapper.isConnected) {
        if (wrapper.matches(":popover-open")) wrapper.hidePopover();
        wrapper.removeAttribute("popover");
      }
      root.style.overflow = previousOverflow;
      map?.cooperativeGestures.enable();
      requestAnimationFrame(() => map?.resize());
    };
  }, [expanded]);

  const collapse = () => {
    setExpanded(false);
    requestAnimationFrame(() => expandButtonRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab" && expanded) {
      trapTab(event);
      return;
    }
    if (event.key !== "Escape") return;
    if (popupRef.current) {
      const id = latest.current.selectedId;
      popupRef.current.remove();
      if (id) markersRef.current.get(id)?.element.focus();
    } else if (expanded) {
      collapse();
    }
  };

  const showList = list !== "none" && (points.length > 0 || circles.some((c) => c.label) || lines.some((l) => l.label));
  const listItems = (
    <>
      {points.map((point) => (
        <li key={point.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: mapToneVar(point.tone), boxShadow: `0 0 10px color-mix(in oklab, ${mapToneVar(point.tone)} 70%, transparent)` }}
          />
          <span className="font-medium text-fg">{point.label}</span>
          {point.description ? <span className="text-fg-muted">{point.description}</span> : null}
          {point.href ? (
            <a href={point.href} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              {point.hrefLabel ?? "Open"}
            </a>
          ) : null}
          {status === "ready" && list === "toggle" ? (
            <button
              type="button"
              onClick={() => select(point.id)}
              className="-my-2 ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-fg-subtle underline-offset-4 hover:text-fg hover:underline sm:my-0 sm:min-h-0 sm:px-0"
            >
              Show on map<span className="sr-only">: {point.label}</span>
            </button>
          ) : null}
        </li>
      ))}
      {circles
        .filter((circle) => circle.label)
        .map((circle) => (
          <li key={circle.id} className="py-2 text-fg-muted">
            {circle.label}
          </li>
        ))}
      {lines
        .filter((line) => line.label)
        .map((line) => (
          <li key={line.id} className="py-2 text-fg-muted">
            {line.label}
          </li>
        ))}
    </>
  );

  const loadingSkeleton = !skeletonGone || status !== "ready";

  return (
    <div className={cn("wm-map", className)}>
      <div
        ref={wrapperRef}
        role="group"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "glass-lite isolate overflow-hidden",
          expanded
            ? "fixed inset-0 z-[60] m-0 h-dvh max-h-none w-full max-w-none rounded-none border-0 p-0 text-fg"
            : "relative rounded-2xl",
        )}
        style={expanded ? undefined : { height }}
      >
        {loadingSkeleton && status !== "fallback" ? (
          <div className="absolute inset-0 grid place-items-center" role="status">
            <div aria-hidden="true" className="shimmer absolute inset-0 opacity-60" />
            <div aria-hidden="true" className="grid-bg absolute inset-0" />
            <span className="relative flex items-center gap-2 rounded-full border border-line bg-canvas/70 px-3 py-1.5 text-xs font-medium text-fg-muted">
              <MapPinned aria-hidden="true" className="size-4 text-neon-cyan" />
              Loading map…
            </span>
          </div>
        ) : null}

        {/* Fades in over the skeleton after the first complete render. */}
        <div
          ref={containerRef}
          onTransitionEnd={() => {
            if (status === "ready") setSkeletonGone(true);
          }}
          className={cn("absolute inset-0 transition-opacity duration-500", status === "ready" ? "opacity-100" : "opacity-0")}
        />

        {status === "fallback" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div aria-hidden="true" className="grid-bg absolute inset-0" />
            <div className="relative max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-line-strong bg-surface-2 text-neon-cyan shadow-glow-sm">
                {fallback === "offline" ? <WifiOff aria-hidden="true" className="size-6" /> : <MapPinned aria-hidden="true" className="size-6" />}
              </span>
              <p className="mt-3 font-semibold text-fg">Map unavailable</p>
              <p className="mt-1 text-sm text-fg-muted">
                {fallback === "webgl"
                  ? "This browser cannot draw the interactive map."
                  : fallback === "offline"
                    ? "You appear to be offline, so the map tiles could not load."
                    : "The map tiles could not load right now."}{" "}
                {showList ? "The same locations are listed below." : null}
              </p>
            </div>
          </div>
        ) : null}

        {interactive && expandable && !hostExpands && status === "ready" ? (
          expanded ? (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={collapse}
              className="glass-strong absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-fg"
            >
              <X aria-hidden="true" className="size-5" />
              Close map
            </button>
          ) : (
            <button
              ref={expandButtonRef}
              type="button"
              onClick={() => setExpanded(true)}
              className="glass-strong absolute top-3 left-3 z-10 grid size-11 place-items-center rounded-xl text-fg sm:hidden"
            >
              <Maximize2 aria-hidden="true" className="size-5" />
              <span className="sr-only">Full-screen map</span>
            </button>
          )
        ) : null}

        {legend ? (
          <div
            className={cn(
              "pointer-events-auto absolute left-3 z-10 max-w-[70%]",
              // Expanded: above the attribution row at the bottom.
              expanded ? "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+2.75rem)] block" : "bottom-3 hidden sm:block",
            )}
          >
            <div className="glass-strong rounded-xl px-3 py-2 text-xs text-fg-muted">{legend}</div>
          </div>
        ) : null}
      </div>

      {legend ? <div className="mt-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-fg-muted sm:hidden">{legend}</div> : null}

      {showList && list === "sr-only" ? (
        <ul className="sr-only" aria-label={listTitle}>
          {listItems}
        </ul>
      ) : null}

      {showList && list === "toggle" ? (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={listOpen || status === "fallback"}
            aria-controls={listId}
            onClick={() => setListOpen((open) => !open)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg sm:min-h-8"
          >
            <List aria-hidden="true" className="size-3.5" />
            {listOpen || status === "fallback" ? "Hide list view" : "List view"}
            <span className="text-fg-subtle">· {points.length > 0 ? `${points.length} ${points.length === 1 ? "location" : "locations"}` : "details"}</span>
          </button>
          <div id={listId} hidden={!(listOpen || status === "fallback")} className="mt-1">
            <p className="sr-only">{listTitle}</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface/60 px-3 text-sm">{listItems}</ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
