import "server-only";

import type { Kysely } from "kysely";

import type { AppContext } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";

// The configurable pilot area: requests are accepted only for enabled pilot ZIPs. Locations
// are approximate ZIP centroids (no geocoder); the exact address stays private text.

export type PilotZipLookup =
  | {
      status: "ok";
      zip: string;
      city: string;
      state: string;
      /** "Tempe, AZ 85281": the coarse location stored on requests. */
      areaLabel: string;
      /** The pilot area's name, e.g. "Phoenix metro". */
      metroLabel: string;
      /** IANA time zone of the ZIP, e.g. "America/Phoenix". */
      timeZone: string;
    }
  /** Not a ZIP code we know (or not 5 digits). */
  | { status: "unknown_zip"; zip: string }
  /** A real ZIP outside the pilot area, or a pilot ZIP an admin disabled. */
  | { status: "not_in_pilot"; zip: string };

/** A pilot ZIP with its approximate centroid, for storing on a new request. */
export type PilotZipLocation = Extract<PilotZipLookup, { status: "ok" }> & { lat: number; lng: number };

export type PilotZipResult =
  | { status: "ok"; location: PilotZipLocation }
  | { status: "unknown_zip" | "not_in_pilot"; zip: string };

export type PilotArea = {
  metroLabel: string;
  /** Enabled ZIPs in this area, in ZIP order. */
  zips: { zip: string; city: string; state: string }[];
  timeZones: string[];
};

/** "85281" from "85281" or "85281-1234"; null for anything else. */
export function normalizeZip(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{5}$/.test(trimmed)) return trimmed;
  if (/^\d{5}-\d{4}$/.test(trimmed)) return trimmed.slice(0, 5);
  return null;
}

export function areaLabelFor(city: string, state: string, zip: string): string {
  return `${city}, ${state} ${zip}`;
}

/** Looks a ZIP up in the centroids and the pilot list; works on `ctx.db` or inside a transaction. */
export async function findPilotZip(db: Kysely<DB>, rawZip: string): Promise<PilotZipResult> {
  const zip = normalizeZip(rawZip);
  if (!zip) return { status: "unknown_zip", zip: rawZip.trim().slice(0, 10) };

  const row = await db
    .selectFrom("zip_centroids as z")
    .leftJoin("pilot_zips as p", "p.zip", "z.zip")
    .select(["z.zip", "z.city", "z.state", "z.lat", "z.lng", "z.time_zone", "p.enabled", "p.metro_label"])
    .where("z.zip", "=", zip)
    .executeTakeFirst();
  if (!row) return { status: "unknown_zip", zip };
  if (row.enabled !== 1 || row.metro_label === null) return { status: "not_in_pilot", zip };

  return {
    status: "ok",
    location: {
      status: "ok",
      zip: row.zip,
      city: row.city,
      state: row.state,
      areaLabel: areaLabelFor(row.city, row.state, row.zip),
      metroLabel: row.metro_label,
      timeZone: row.time_zone,
      lat: row.lat,
      lng: row.lng,
    },
  };
}

/**
 * Whether WrenchMatch takes requests for `zip`: "ok" with the area label and time zone, or
 * why not. A pilot ZIP an admin disabled counts as not in the pilot.
 */
export async function lookupPilotZip(ctx: Pick<AppContext, "db">, zip: string): Promise<PilotZipLookup> {
  const result = await findPilotZip(ctx.db, zip);
  if (result.status !== "ok") return result;
  const { location } = result;
  return {
    status: "ok",
    zip: location.zip,
    city: location.city,
    state: location.state,
    areaLabel: location.areaLabel,
    metroLabel: location.metroLabel,
    timeZone: location.timeZone,
  };
}

/** Enabled pilot areas grouped by metro label (for "where we operate" copy and messages). */
export async function listPilotAreas(db: Kysely<DB>): Promise<PilotArea[]> {
  const rows = await db
    .selectFrom("pilot_zips as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.zip")
    .select(["p.zip", "p.metro_label", "z.city", "z.state", "z.time_zone"])
    .where("p.enabled", "=", 1)
    .orderBy("p.metro_label")
    .orderBy("p.zip")
    .execute();

  const areas = new Map<string, PilotArea>();
  for (const row of rows) {
    let area = areas.get(row.metro_label);
    if (!area) {
      area = { metroLabel: row.metro_label, zips: [], timeZones: [] };
      areas.set(row.metro_label, area);
    }
    area.zips.push({ zip: row.zip, city: row.city, state: row.state });
    if (!area.timeZones.includes(row.time_zone)) area.timeZones.push(row.time_zone);
  }
  return [...areas.values()];
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** The field message for a ZIP that cannot take requests. */
export function pilotZipMessage(
  result: { status: "unknown_zip" | "not_in_pilot"; zip: string },
  areas: readonly Pick<PilotArea, "metroLabel">[],
): string {
  if (result.status === "unknown_zip") {
    return `We don't recognize the ZIP code ${result.zip}. Check it and try again.`;
  }
  if (areas.length === 0) {
    return "WrenchMatch isn't taking repair requests in any area right now. Please check back soon.";
  }
  const pilot = joinLabels(areas.map((area) => area.metroLabel));
  return `WrenchMatch isn't available in ${result.zip} yet. The pilot currently serves: ${pilot}.`;
}
