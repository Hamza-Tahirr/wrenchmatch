import "server-only";

// Distances between approximate ZIP-centroid points (no geocoder). The Supabase/Postgres
// version replaces this with PostGIS geography points and ST_DWithin (ARCHITECTURE section 1).

export type GeoPoint = { lat: number; lng: number };

/** Mean Earth radius in miles. */
export const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function assertPoint(point: GeoPoint, name: string): void {
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(
      `${name} needs lat in [-90, 90] and lng in [-180, 180], received (${lat}, ${lng})`,
    );
  }
}

/** Great-circle (haversine) distance in miles between two points given in degrees. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  assertPoint(a, "a");
  assertPoint(b, "b");
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  // Rounding can leave h a hair above 1 near antipodal points; keep asin's input within [0, 1].
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Rounds to 0.01 mile, the precision matching compares and stores. ZIP centroids are
 * approximate, so finer digits carry no meaning; rounding also keeps a mechanic exactly at
 * the radius from failing on floating-point noise.
 */
export function roundMiles(miles: number): number {
  return Math.round(miles * 100) / 100;
}
