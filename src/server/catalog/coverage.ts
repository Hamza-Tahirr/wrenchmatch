import "server-only";

import type { AppContext } from "@/server/context";

import { areaLabelFor } from "./pilot-zips";

// Public "where we operate" data for coverage maps: enabled pilot ZIPs with their approximate
// centroids (no addresses, no user data), grouped by metro. Safe for signed-out visitors.

export type CoverageZip = {
  zip: string;
  city: string;
  state: string;
  /** "Tempe, AZ 85281" */
  areaLabel: string;
  metroLabel: string;
  /** Approximate ZIP centroid. */
  lat: number;
  lng: number;
};

export type CoverageMetro = {
  metroLabel: string;
  /** Average of its ZIP centroids. */
  lat: number;
  lng: number;
  zipCount: number;
  cities: string[];
  /** Approximate radius (miles) that covers the metro's ZIP centroids, at least 5. */
  radiusMiles: number;
};

export type Coverage = {
  zips: CoverageZip[];
  metros: CoverageMetro[];
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Enabled pilot ZIP centroids and per-metro summaries (ZIP order, metros by name). */
export async function getCoverage(ctx: Pick<AppContext, "db">): Promise<Coverage> {
  const rows = await ctx.db
    .selectFrom("pilot_zips as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.zip")
    .select(["p.zip", "p.metro_label", "z.city", "z.state", "z.lat", "z.lng"])
    .where("p.enabled", "=", 1)
    .orderBy("p.metro_label")
    .orderBy("p.zip")
    .execute();

  const zips: CoverageZip[] = rows.map((row) => ({
    zip: row.zip,
    city: row.city,
    state: row.state,
    areaLabel: areaLabelFor(row.city, row.state, row.zip),
    metroLabel: row.metro_label,
    lat: row.lat,
    lng: row.lng,
  }));

  const groups = new Map<string, CoverageZip[]>();
  for (const zip of zips) {
    const group = groups.get(zip.metroLabel) ?? [];
    group.push(zip);
    groups.set(zip.metroLabel, group);
  }

  const metros: CoverageMetro[] = [...groups.entries()].map(([metroLabel, group]) => {
    const lat = group.reduce((sum, zip) => sum + zip.lat, 0) / group.length;
    const lng = group.reduce((sum, zip) => sum + zip.lng, 0) / group.length;
    const farthest = group.reduce((max, zip) => Math.max(max, miles({ lat, lng }, zip)), 0);
    return {
      metroLabel,
      lat,
      lng,
      zipCount: group.length,
      cities: [...new Set(group.map((zip) => zip.city))].sort((a, b) => a.localeCompare(b)),
      radiusMiles: Math.max(5, Math.ceil(farthest + 2)),
    };
  });

  return { zips, metros };
}
