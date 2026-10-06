import "server-only";

import { sql } from "kysely";

import {
  CENTROID_FIELDS,
  pilotZipInputSchema,
  pilotZipToggleSchema,
  zipCodeSchema,
  type ZipCentroidFields,
} from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { effectiveRequestStatusSql } from "./effective-status";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";

// The configurable pilot area: ZIP codes customers may request service in. Each ZIP needs
// an approximate centroid (no geocoder is used) with an IANA time zone. The seed's Phoenix
// ZIPs are only demo data; admins add other ZIPs here, entering a centroid when none is on
// file.

/** zip_centroids.source for centroids typed in by an admin. */
export const ADMIN_CENTROID_SOURCE = "admin-entered (approximate)";

export type AdminPilotZipItem = {
  zip: string;
  city: string;
  state: string;
  metroLabel: string;
  enabled: boolean;
  /** IANA zone copied onto requests from this ZIP. */
  timeZone: string;
  /** Where the approximate centroid came from. */
  centroidSource: string;
  lat: number;
  lng: number;
  /** Requests waiting for quotes now (open or quoted). */
  activeRequests: number;
  /** Mechanics whose base ZIP this is. */
  mechanicsBasedHere: number;
  createdAt: string;
  updatedAt: string;
};

export type ZipCentroidInfo = {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  timeZone: string;
  source: string;
  /** Whether admins can still correct it (only admin-entered centroids can be edited). */
  editable: boolean;
  /** Pilot status: null when the ZIP is not a pilot ZIP. */
  pilotEnabled: boolean | null;
};

export type UpsertPilotZipInput = {
  zip: string;
  metroLabel: string;
  enabled: boolean;
  /** Required when the ZIP has no centroid on file; may correct an admin-entered one. */
  centroid?: { city: string; state: string; lat: number; lng: number; timeZone: string };
};

export type UpsertPilotZipResult = {
  zip: string;
  /** True when the ZIP was not a pilot ZIP before. */
  created: boolean;
  /** What happened to the centroid. */
  centroid: "existing" | "added" | "updated";
};

export type SetPilotZipEnabledInput = { zip: string; enabled: boolean; reason?: string | null };
export type SetPilotZipEnabledResult = { zip: string; enabled: boolean; changed: boolean };

/** Pilot ZIPs grouped by metro label, with request and mechanic counts. */
export async function listPilotZips(ctx: AppContext, viewer: Viewer): Promise<AdminPilotZipItem[]> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const rows = await ctx.db
    .selectFrom("pilot_zips as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.zip")
    .select([
      "p.zip",
      "z.city",
      "z.state",
      "p.metro_label",
      "p.enabled",
      "z.time_zone",
      "z.source",
      "z.lat",
      "z.lng",
      "p.created_at",
      "p.updated_at",
      sql<number>`(SELECT count(*) FROM repair_requests AS r
        WHERE r.zip = p.zip AND ${effectiveRequestStatusSql("r", nowIso)} IN ('open', 'quoted'))`.as("active_requests"),
      sql<number>`(SELECT count(*) FROM mechanic_profiles AS mp WHERE mp.base_zip = p.zip)`.as("mechanics"),
    ])
    .orderBy("p.metro_label")
    .orderBy("p.zip")
    .execute();
  return rows.map((row) => ({
    zip: row.zip,
    city: row.city,
    state: row.state,
    metroLabel: row.metro_label,
    enabled: row.enabled === 1,
    timeZone: row.time_zone,
    centroidSource: row.source,
    lat: row.lat,
    lng: row.lng,
    activeRequests: Number(row.active_requests),
    mechanicsBasedHere: Number(row.mechanics),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * The centroid on file for a ZIP, or null when there is none (the pilot ZIP form then asks
 * for city, state, latitude, longitude and time zone).
 */
export async function getZipCentroid(ctx: AppContext, viewer: Viewer, zip: string): Promise<ZipCentroidInfo | null> {
  assertAdmin(viewer);
  const code = parseAdminInput(zipCodeSchema, zip);
  const row = await ctx.db
    .selectFrom("zip_centroids as z")
    .leftJoin("pilot_zips as p", "p.zip", "z.zip")
    .select(["z.zip", "z.city", "z.state", "z.lat", "z.lng", "z.time_zone", "z.source", "p.enabled"])
    .where("z.zip", "=", code)
    .executeTakeFirst();
  if (!row) return null;
  return {
    zip: row.zip,
    city: row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    timeZone: row.time_zone,
    source: row.source,
    editable: row.source === ADMIN_CENTROID_SOURCE,
    pilotEnabled: row.enabled === null ? null : row.enabled === 1,
  };
}

function centroidFieldErrors(message: string): Record<string, string[]> {
  return Object.fromEntries(CENTROID_FIELDS.map((field) => [field, [message]]));
}

/**
 * Adds a pilot ZIP or updates its metro label and enabled flag. A ZIP without a centroid
 * on file needs one (city, state, latitude, longitude, IANA time zone), saved with source
 * "admin-entered (approximate)"; an admin-entered centroid can be corrected the same way,
 * while reference centroids from the seed can't be overwritten.
 *
 * Throws DomainError: forbidden, invalid_input (with details.fieldErrors keyed by the
 * form's field names: zip, metroLabel, city, state, lat, lng, timeZone).
 */
export async function upsertPilotZip(
  ctx: AppContext,
  viewer: Viewer,
  input: UpsertPilotZipInput,
): Promise<UpsertPilotZipResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(pilotZipInputSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const existingCentroid = await trx
      .selectFrom("zip_centroids")
      .select(["zip", "city", "state", "lat", "lng", "time_zone", "source"])
      .where("zip", "=", data.zip)
      .executeTakeFirst();
    const centroid: ZipCentroidFields | undefined = data.centroid;

    let centroidChange: UpsertPilotZipResult["centroid"] = "existing";
    if (!existingCentroid) {
      if (!centroid) {
        const message = `We don't have location data for ZIP ${data.zip}. Enter its city, state, latitude, longitude and time zone.`;
        throw new DomainError("invalid_input", message, { fieldErrors: centroidFieldErrors(message) });
      }
      await trx
        .insertInto("zip_centroids")
        .values({
          zip: data.zip,
          city: centroid.city,
          state: centroid.state,
          lat: centroid.lat,
          lng: centroid.lng,
          time_zone: centroid.timeZone,
          source: ADMIN_CENTROID_SOURCE,
        })
        .execute();
      centroidChange = "added";
    } else if (centroid) {
      if (existingCentroid.source !== ADMIN_CENTROID_SOURCE) {
        const message = `ZIP ${data.zip} already has location data (${existingCentroid.city}, ${existingCentroid.state}). Leave the location fields empty.`;
        throw new DomainError("invalid_input", message, { fieldErrors: centroidFieldErrors(message) });
      }
      await trx
        .updateTable("zip_centroids")
        .set({
          city: centroid.city,
          state: centroid.state,
          lat: centroid.lat,
          lng: centroid.lng,
          time_zone: centroid.timeZone,
        })
        .where("zip", "=", data.zip)
        .execute();
      centroidChange = "updated";
    }

    const existingPilot = await trx
      .selectFrom("pilot_zips")
      .select(["zip", "enabled", "metro_label"])
      .where("zip", "=", data.zip)
      .executeTakeFirst();
    if (existingPilot) {
      await trx
        .updateTable("pilot_zips")
        .set({ metro_label: data.metroLabel, enabled: data.enabled ? 1 : 0, updated_at: nowIso })
        .where("zip", "=", data.zip)
        .execute();
    } else {
      await trx
        .insertInto("pilot_zips")
        .values({
          zip: data.zip,
          metro_label: data.metroLabel,
          enabled: data.enabled ? 1 : 0,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .execute();
    }

    await recordAudit(trx, {
      actor: viewer,
      action: existingPilot ? ADMIN_AUDIT_ACTIONS.pilotZipUpdated : ADMIN_AUDIT_ACTIONS.pilotZipAdded,
      entityType: "pilot_zip",
      entityId: data.zip,
      metadata: {
        metroLabel: data.metroLabel,
        enabled: data.enabled,
        centroid: centroidChange,
        ...(existingPilot
          ? { previous: { metroLabel: existingPilot.metro_label, enabled: existingPilot.enabled === 1 } }
          : {}),
        ...(centroid && centroidChange !== "existing"
          ? { location: { city: centroid.city, state: centroid.state, lat: centroid.lat, lng: centroid.lng, timeZone: centroid.timeZone } }
          : {}),
        ...(centroidChange === "updated" && existingCentroid
          ? {
              previousLocation: {
                city: existingCentroid.city,
                state: existingCentroid.state,
                lat: existingCentroid.lat,
                lng: existingCentroid.lng,
                timeZone: existingCentroid.time_zone,
              },
            }
          : {}),
      },
      at: ctx.now,
    });

    return { zip: data.zip, created: !existingPilot, centroid: centroidChange };
  });
}

/**
 * Enables or disables a pilot ZIP (optional reason, kept in the audit log). Disabled ZIPs
 * are refused when a request is submitted and matching is not re-run there. Writes
 * nothing when the ZIP is already in the requested state.
 *
 * Throws DomainError: forbidden, invalid_input, not_found (not a pilot ZIP).
 */
export async function setPilotZipEnabled(
  ctx: AppContext,
  viewer: Viewer,
  input: SetPilotZipEnabledInput,
): Promise<SetPilotZipEnabledResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(pilotZipToggleSchema, input);

  return writeTx(ctx.db, async (trx) => {
    const pilot = await trx
      .selectFrom("pilot_zips")
      .select(["zip", "enabled", "metro_label"])
      .where("zip", "=", data.zip)
      .executeTakeFirst();
    if (!pilot) throw new DomainError("not_found", `ZIP ${data.zip} is not a pilot ZIP.`);

    const result = { zip: pilot.zip, enabled: data.enabled };
    if ((pilot.enabled === 1) === data.enabled) return { ...result, changed: false };

    await trx
      .updateTable("pilot_zips")
      .set({ enabled: data.enabled ? 1 : 0, updated_at: ctx.now.toISOString() })
      .where("zip", "=", pilot.zip)
      .execute();
    await recordAudit(trx, {
      actor: viewer,
      action: data.enabled ? ADMIN_AUDIT_ACTIONS.pilotZipEnabled : ADMIN_AUDIT_ACTIONS.pilotZipDisabled,
      entityType: "pilot_zip",
      entityId: pilot.zip,
      reason: data.reason ?? null,
      metadata: { metroLabel: pilot.metro_label },
      at: ctx.now,
    });
    return { ...result, changed: true };
  });
}
