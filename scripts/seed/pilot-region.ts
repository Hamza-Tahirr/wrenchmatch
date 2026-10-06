// The sample pilot region (db/seed-data/pilot-region.json): ZIP centroids with their time zone
// and which ZIPs take requests. Seed data only; the app reads zip_centroids and pilot_zips.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { isValidTimeZone } from "@/lib/time";
import { writeTx } from "@/server/db/tx";

import type { SeedRun } from "./types";

export const PILOT_REGION_FILE = fileURLToPath(new URL("../../db/seed-data/pilot-region.json", import.meta.url));

const zipSchema = z.object({
  zip: z.string().regex(/^\d{5}$/),
  city: z.string().trim().min(1).max(80),
  state: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  landAreaSqMi: z.number().nonnegative(),
  /** false: a known centroid outside the pilot (for the "not in the pilot area" message). */
  pilot: z.boolean(),
});

const regionSchema = z
  .object({
    description: z.string(),
    metroLabel: z.string().trim().min(1).max(80),
    timeZone: z.string().refine(isValidTimeZone, "Unknown IANA time zone"),
    source: z.object({
      /** Stored in zip_centroids.source. */
      label: z.string().trim().min(1).max(120),
      dataset: z.string().min(1),
      url: z.url(),
      retrievedOn: z.string(),
    }),
    zips: z.array(zipSchema).min(1),
  })
  .superRefine((region, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of region.zips.entries()) {
      if (seen.has(entry.zip)) ctx.addIssue({ code: "custom", path: ["zips", index, "zip"], message: `Duplicate ZIP ${entry.zip}` });
      seen.add(entry.zip);
    }
    if (!region.zips.some((entry) => entry.pilot)) ctx.addIssue({ code: "custom", path: ["zips"], message: "No pilot ZIPs" });
  });

export type PilotRegion = z.output<typeof regionSchema>;

/** Reads and validates the region file; throws with the offending field when it is malformed. */
export function loadPilotRegion(file: string = PILOT_REGION_FILE): PilotRegion {
  const parsed = regionSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${file} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Inserts every centroid, and the pilot ZIPs (enabled) under the region's metro label. */
export async function seedPilotRegion(run: SeedRun, region: PilotRegion): Promise<void> {
  // The pilot "launched" before the first mechanic applied.
  const launchedAt = run.clock.at(-410, "10:00").toISOString();
  const pilotZips = region.zips.filter((entry) => entry.pilot);
  await writeTx(run.db, async (trx) => {
    await trx
      .insertInto("zip_centroids")
      .values(
        region.zips.map((entry) => ({
          zip: entry.zip,
          city: entry.city,
          state: entry.state,
          lat: entry.lat,
          lng: entry.lng,
          time_zone: region.timeZone,
          source: region.source.label,
        })),
      )
      .execute();
    await trx
      .insertInto("pilot_zips")
      .values(
        pilotZips.map((entry) => ({
          zip: entry.zip,
          enabled: 1,
          metro_label: region.metroLabel,
          created_at: launchedAt,
          updated_at: launchedAt,
        })),
      )
      .execute();
  });
  run.log(
    `Pilot region: ${pilotZips.length} pilot ZIPs (${region.metroLabel}, ${region.timeZone}) and ` +
      `${region.zips.length - pilotZips.length} reference ZIP(s) outside the pilot.`,
  );
}
