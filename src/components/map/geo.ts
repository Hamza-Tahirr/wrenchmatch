// Map types and pure helpers. Safe on the server and the client (no browser APIs, no
// server-only imports), so Server Components can shape map data before passing it to
// <MapView>. PRIVACY: every coordinate given to a map must already be approximate: a ZIP
// centroid (requests) or a mechanic's base-ZIP centroid, and only for records the viewer may
// see (ARCHITECTURE section 8). Never pass an exact address or geocoded point.

export type LatLng = { lat: number; lng: number };

/** Marker and ring colors (map to the neon/semantic palette). */
export type MapTone = "cyan" | "blue" | "violet" | "success" | "warning" | "danger" | "neutral";

export type MapPoint = LatLng & {
  id: string;
  /** Short marker label, e.g. "Marco R." or "Your request". Also used in the text list. */
  label: string;
  /** Extra text for the popup and the text list, e.g. "Tempe, AZ 85281 · about 6 mi". */
  description?: string;
  tone?: MapTone;
  /** "pin" (default) or "home" (a diamond, e.g. the customer's approximate area). */
  kind?: "pin" | "home";
  /** Animated pulse ring (use for the one point that matters most). */
  pulse?: boolean;
  /** Hide the floating label chip (the popup and list still show it). */
  hideLabel?: boolean;
  /** Optional link shown in the popup and the list. */
  href?: string;
  hrefLabel?: string;
};

/** A radius ring, e.g. a mechanic's travel radius or an approximate area. */
export type MapCircle = LatLng & {
  id: string;
  radiusMiles: number;
  tone?: MapTone;
  /** Dashed outline (default true). */
  dashed?: boolean;
  /** Text for the list/legend, e.g. "Marco R. travels up to 25 mi". */
  label?: string;
};

/** A straight connector, e.g. from a mechanic's base area to a request area. */
export type MapLine = {
  id: string;
  from: LatLng;
  to: LatLng;
  tone?: MapTone;
  /** Shown in the text list, e.g. "about 6 mi". */
  label?: string;
};

/**
 * Hex colors for WebGL layers (MapLibre does not parse OKLCH), dark theme. Keep in sync with
 * the `--wm-map-*` variables in globals.css (HTML swatches use those, so they follow the theme).
 */
export const MAP_TONE_HEX: Record<MapTone, string> = {
  cyan: "#3ee3f5",
  blue: "#5f8dff",
  violet: "#a77bff",
  success: "#45d69e",
  warning: "#f3b84f",
  danger: "#ff6e72",
  neutral: "#9aa6bf",
};

/** The same tones, deeper, for the light theme's light base map. */
export const MAP_TONE_HEX_LIGHT: Record<MapTone, string> = {
  cyan: "#0a87a8",
  blue: "#2f5fd6",
  violet: "#7445d9",
  success: "#0d9668",
  warning: "#d07a0a",
  danger: "#d63a3f",
  neutral: "#64748b",
};

/** CSS colour of a tone for HTML (legend swatches, list dots): follows the app theme. */
export function mapToneVar(tone: MapTone = "cyan"): string {
  return `var(--wm-map-${tone})`;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance in miles (display only; matching uses src/server/matching/geo.ts). */
export function milesBetween(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * An "approximate area" ring for a ZIP centroid: coordinates rounded to 2 decimals (about
 * 0.7 mi) and a radius (default 1.5 mi) so the map shows an area, not a pin on a house.
 */
export function approximateArea(
  point: LatLng,
  options: { id?: string; radiusMiles?: number; tone?: MapTone; label?: string } = {},
): MapCircle {
  return {
    id: options.id ?? `area-${point.lat.toFixed(2)}-${point.lng.toFixed(2)}`,
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100,
    radiusMiles: options.radiusMiles ?? 1.5,
    tone: options.tone ?? "cyan",
    dashed: false,
    label: options.label,
  };
}

/** A closed ring of [lng, lat] positions approximating a circle (for GeoJSON polygons). */
export function circleRing(center: LatLng, radiusMiles: number, steps = 72): [number, number][] {
  const angular = radiusMiles / EARTH_RADIUS_MILES;
  const lat1 = toRadians(center.lat);
  const lng1 = toRadians(center.lng);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDegrees(lng2), toDegrees(lat2)]);
  }
  return ring;
}

export type Bounds = { west: number; south: number; east: number; north: number };

/** Bounds covering points, rings (their full radius) and line ends; null when empty. */
export function contentBounds(points: readonly LatLng[], circles: readonly MapCircle[], lines: readonly MapLine[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const add = (lat: number, lng: number) => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };
  for (const point of points) add(point.lat, point.lng);
  for (const line of lines) {
    add(line.from.lat, line.from.lng);
    add(line.to.lat, line.to.lng);
  }
  for (const circle of circles) {
    const dLat = circle.radiusMiles / 69;
    const dLng = circle.radiusMiles / (69 * Math.max(0.2, Math.cos(toRadians(circle.lat))));
    add(circle.lat - dLat, circle.lng - dLng);
    add(circle.lat + dLat, circle.lng + dLng);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}
