import "server-only";

import { sql } from "kysely";

import { MECHANIC_SERVICE_MODES, REQUEST_STATUSES, type MechanicServiceMode, type RequestStatus } from "@/lib/domain";
import type { AppContext, Viewer } from "@/server/context";

import { assertAdmin } from "./access";
import { effectiveRequestStatusSql } from "./effective-status";
import { areaLabel } from "./mechanics";
import { vehicleLabel } from "./request-items";
import { oneOf } from "./types";

// The dashboard's operations map. Every point is approximate: a pilot ZIP's centroid, a
// request's ZIP centroid (the exact address stays in request_private) or a mechanic's base
// ZIP centroid (never the garage address). Counted at request time, like the rest of the
// dashboard.

export type OperationsMapZip = {
  zip: string;
  city: string;
  state: string;
  metroLabel: string;
  enabled: boolean;
  lat: number;
  lng: number;
  /** Requests waiting for quotes now (open or quoted) in this ZIP. */
  activeRequests: number;
  /** Mechanics (any status) whose base ZIP this is. */
  mechanicsBasedHere: number;
};

export type OperationsMapRequest = {
  id: string;
  /** "2016 Toyota Camry · Brake work" */
  title: string;
  /** Coarse area, e.g. "Tempe, AZ 85281". */
  areaLabel: string;
  zip: string;
  lat: number;
  lng: number;
  /** As of now: "open" (no quotes yet) or "quoted". */
  status: Extract<RequestStatus, "open" | "quoted">;
  /** Mechanics notified; 0 means nobody was reached (needs follow-up). */
  matchedCount: number;
  quotesCount: number;
  submittedAt: string | null;
};

export type OperationsMapMechanic = {
  id: string;
  displayName: string;
  /** Base ZIP centroid (approximate). */
  lat: number;
  lng: number;
  area: string;
  serviceMode: MechanicServiceMode;
  travelRadiusMiles: number;
  acceptingJobs: boolean;
};

export type OperationsMap = {
  zips: OperationsMapZip[];
  /** Requests waiting for quotes now, oldest first. */
  requests: OperationsMapRequest[];
  /** Approved mechanics' bases. */
  mechanics: OperationsMapMechanic[];
};

/** Pilot ZIPs, requests waiting for quotes and approved mechanics, as approximate map points. */
export async function getOperationsMap(ctx: AppContext, viewer: Viewer): Promise<OperationsMap> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const effective = effectiveRequestStatusSql("r", nowIso);

  const [zipRows, requestRows, mechanicRows] = await Promise.all([
    ctx.db
      .selectFrom("pilot_zips as p")
      .innerJoin("zip_centroids as z", "z.zip", "p.zip")
      .select([
        "p.zip",
        "z.city",
        "z.state",
        "p.metro_label",
        "p.enabled",
        "z.lat",
        "z.lng",
        sql<number>`(SELECT count(*) FROM repair_requests AS r
          WHERE r.zip = p.zip AND ${effective} IN ('open', 'quoted'))`.as("active_requests"),
        sql<number>`(SELECT count(*) FROM mechanic_profiles AS mp WHERE mp.base_zip = p.zip)`.as("mechanics"),
      ])
      .orderBy("p.zip")
      .execute(),
    ctx.db
      .selectFrom("repair_requests as r")
      .innerJoin("service_categories as c", "c.id", "r.category_id")
      .select([
        "r.id",
        "r.vehicle_year",
        "r.vehicle_make",
        "r.vehicle_model",
        "c.name as category_name",
        "r.area_label",
        "r.zip",
        "r.approx_lat",
        "r.approx_lng",
        "r.matched_count",
        "r.submitted_at",
        effective.as("effective_status"),
        sql<number>`(SELECT count(*) FROM quotes AS q WHERE q.request_id = r.id)`.as("quotes_count"),
      ])
      .where(effective, "in", ["open", "quoted"])
      .orderBy("r.submitted_at")
      .orderBy(sql`r.rowid`)
      .execute(),
    ctx.db
      .selectFrom("mechanic_profiles as mp")
      .innerJoin("zip_centroids as z", "z.zip", "mp.base_zip")
      .select([
        "mp.user_id",
        "mp.display_name",
        "mp.base_lat",
        "mp.base_lng",
        "mp.base_zip",
        "z.city",
        "z.state",
        "mp.service_mode",
        "mp.travel_radius_miles",
        "mp.accepting_jobs",
      ])
      .where("mp.status", "=", "approved")
      .orderBy("mp.display_name")
      .execute(),
  ]);

  return {
    zips: zipRows.map((row) => ({
      zip: row.zip,
      city: row.city,
      state: row.state,
      metroLabel: row.metro_label,
      enabled: row.enabled === 1,
      lat: row.lat,
      lng: row.lng,
      activeRequests: Number(row.active_requests),
      mechanicsBasedHere: Number(row.mechanics),
    })),
    requests: requestRows.map((row) => {
      const status = oneOf(REQUEST_STATUSES, row.effective_status, "effective request status");
      return {
        id: row.id,
        title: `${vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model)} · ${row.category_name}`,
        areaLabel: row.area_label,
        zip: row.zip,
        lat: row.approx_lat,
        lng: row.approx_lng,
        status: status === "quoted" ? "quoted" : "open",
        matchedCount: row.matched_count,
        quotesCount: Number(row.quotes_count),
        submittedAt: row.submitted_at,
      };
    }),
    mechanics: mechanicRows.map((row) => ({
      id: row.user_id,
      displayName: row.display_name,
      lat: row.base_lat,
      lng: row.base_lng,
      area: areaLabel(row.city, row.state, row.base_zip),
      serviceMode: oneOf(MECHANIC_SERVICE_MODES, row.service_mode, "mechanic_profiles.service_mode"),
      travelRadiusMiles: row.travel_radius_miles,
      acceptingJobs: row.accepting_jobs === 1,
    })),
  };
}
