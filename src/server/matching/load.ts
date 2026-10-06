import "server-only";

import {
  MECHANIC_SERVICE_MODES,
  MECHANIC_STATUSES,
  PREFERRED_WINDOWS,
  REQUEST_SERVICE_MODES,
  REQUEST_STATUSES,
  type PreferredWindow,
  type RequestServiceMode,
  type RequestStatus,
} from "@/lib/domain";
import type { Tx } from "@/server/db/tx";

import type { GeoPoint } from "./geo";
import type { MatchMechanic } from "./rules";

// Reads the inputs of a matching run inside the caller's transaction. Only coarse request
// fields are selected: contact details and the exact address are never needed here.

export type RequestForMatching = {
  id: string;
  status: RequestStatus;
  /** null while the request is a draft. */
  expiresAt: string | null;
  timeZone: string;
  /** The request ZIP's city and state, e.g. "Tempe" and "AZ". */
  city: string;
  state: string;
  /** The ZIP-centroid point copied onto the request at submission. */
  point: GeoPoint;
  categoryId: string;
  categoryName: string;
  categorySafetySensitive: boolean;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  serviceMode: RequestServiceMode;
  maxGarageDistanceMiles: number;
  preferredDate: string;
  preferredWindow: PreferredWindow;
};

export type MechanicCandidate = MatchMechanic & { displayName: string };

/** Narrows a TEXT column to its CHECK-constrained union; a mismatch means schema drift. */
function oneOf<T extends string>(allowed: readonly T[], value: string, column: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`Unexpected ${column} value "${value}"`);
  return match;
}

export async function loadRequestForMatching(
  trx: Tx,
  requestId: string,
): Promise<RequestForMatching | undefined> {
  const row = await trx
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("zip_centroids as z", "z.zip", "r.zip")
    .select([
      "r.id",
      "r.status",
      "r.expires_at",
      "r.time_zone",
      "r.approx_lat",
      "r.approx_lng",
      "r.category_id",
      "c.name as category_name",
      "c.safety_sensitive",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.service_mode",
      "r.max_garage_distance_miles",
      "r.preferred_date",
      "r.preferred_window",
      "z.city",
      "z.state",
    ])
    .where("r.id", "=", requestId)
    .executeTakeFirst();
  if (!row) return undefined;

  return {
    id: row.id,
    status: oneOf(REQUEST_STATUSES, row.status, "repair_requests.status"),
    expiresAt: row.expires_at,
    timeZone: row.time_zone,
    city: row.city,
    state: row.state,
    point: { lat: row.approx_lat, lng: row.approx_lng },
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySafetySensitive: row.safety_sensitive === 1,
    vehicleYear: row.vehicle_year,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    serviceMode: oneOf(REQUEST_SERVICE_MODES, row.service_mode, "repair_requests.service_mode"),
    maxGarageDistanceMiles: row.max_garage_distance_miles,
    preferredDate: row.preferred_date,
    preferredWindow: oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window"),
  };
}

/**
 * Every mechanic profile, whatever its status, with services, makes and availability, so
 * each one gets an evaluation that explains the result. Loading all profiles is fine at demo
 * scale; production would pre-filter candidates with a bounding box / PostGIS ST_DWithin.
 */
export async function loadMechanicCandidates(trx: Tx): Promise<MechanicCandidate[]> {
  const profiles = await trx
    .selectFrom("mechanic_profiles")
    .select([
      "user_id",
      "display_name",
      "status",
      "accepting_jobs",
      "insurance_provider",
      "insurance_expires_on",
      "base_lat",
      "base_lng",
      "service_mode",
      "travel_radius_miles",
      "services_all_makes",
    ])
    .orderBy("user_id")
    .execute();
  const services = await trx
    .selectFrom("mechanic_services")
    .select(["mechanic_id", "category_id", "safety_approved"])
    .execute();
  const makes = await trx.selectFrom("mechanic_makes").select(["mechanic_id", "make"]).execute();
  const availability = await trx
    .selectFrom("mechanic_availability")
    .select(["mechanic_id", "weekday", "start_minute", "end_minute"])
    .execute();

  const servicesBy = Map.groupBy(services, (row) => row.mechanic_id);
  const makesBy = Map.groupBy(makes, (row) => row.mechanic_id);
  const availabilityBy = Map.groupBy(availability, (row) => row.mechanic_id);

  return profiles.map((profile) => ({
    id: profile.user_id,
    displayName: profile.display_name,
    status: oneOf(MECHANIC_STATUSES, profile.status, "mechanic_profiles.status"),
    acceptingJobs: profile.accepting_jobs === 1,
    insuranceProvider: profile.insurance_provider,
    insuranceExpiresOn: profile.insurance_expires_on,
    basePoint: { lat: profile.base_lat, lng: profile.base_lng },
    serviceMode: oneOf(MECHANIC_SERVICE_MODES, profile.service_mode, "mechanic_profiles.service_mode"),
    travelRadiusMiles: profile.travel_radius_miles,
    servicesAllMakes: profile.services_all_makes === 1,
    makes: (makesBy.get(profile.user_id) ?? []).map((row) => row.make),
    services: (servicesBy.get(profile.user_id) ?? []).map((row) => ({
      categoryId: row.category_id,
      safetyApproved: row.safety_approved === 1,
    })),
    availability: (availabilityBy.get(profile.user_id) ?? []).map((row) => ({
      weekday: row.weekday,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    })),
  }));
}
