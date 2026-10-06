import "server-only";

import type { Kysely } from "kysely";

import { MECHANIC_SERVICE_MODES, MECHANIC_STATUSES, type MechanicServiceMode, type MechanicStatus } from "@/lib/domain";
import type { Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { DomainError } from "@/server/errors";

// Role check and the mechanic's own account state, shared by every mechanic command and
// query. `db` may be ctx.db or the `trx` of a writeTx (both are Kysely<DB>).

/** Mechanic commands and queries re-check the role (pages already used requireRole). */
export function assertMechanic(viewer: Viewer): void {
  if (viewer.role !== "mechanic") {
    throw new DomainError("forbidden", "This is only available to mechanic accounts.");
  }
}

/** Narrows a TEXT column to its CHECK-constrained union; a mismatch means schema drift. */
export function oneOf<T extends string>(allowed: readonly T[], value: string, column: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`Unexpected ${column} value "${value}"`);
  return match;
}

export type MechanicState = {
  id: string;
  displayName: string;
  status: MechanicStatus;
  statusReason: string | null;
  acceptingJobs: boolean;
  insuranceProvider: string | null;
  insuranceExpiresOn: string | null;
  serviceMode: MechanicServiceMode;
  travelRadiusMiles: number;
  baseZip: string;
  /** The base ZIP's approximate centroid (never an exact address). */
  basePoint: { lat: number; lng: number };
  /** City and state of the base ZIP, e.g. "Tempe" and "AZ". */
  baseCity: string;
  baseState: string;
  /** IANA zone of the base ZIP: "today" for insurance checks and availability windows. */
  timeZone: string;
};

/** The mechanic's profile essentials, or null when they have not applied yet. */
export async function loadMechanicState(db: Kysely<DB>, mechanicId: string): Promise<MechanicState | null> {
  const row = await db
    .selectFrom("mechanic_profiles as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
    .select([
      "p.user_id",
      "p.display_name",
      "p.status",
      "p.status_reason",
      "p.accepting_jobs",
      "p.insurance_provider",
      "p.insurance_expires_on",
      "p.service_mode",
      "p.travel_radius_miles",
      "p.base_zip",
      "p.base_lat",
      "p.base_lng",
      "z.city",
      "z.state",
      "z.time_zone",
    ])
    .where("p.user_id", "=", mechanicId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.user_id,
    displayName: row.display_name,
    status: oneOf(MECHANIC_STATUSES, row.status, "mechanic_profiles.status"),
    statusReason: row.status_reason,
    acceptingJobs: row.accepting_jobs === 1,
    insuranceProvider: row.insurance_provider,
    insuranceExpiresOn: row.insurance_expires_on,
    serviceMode: oneOf(MECHANIC_SERVICE_MODES, row.service_mode, "mechanic_profiles.service_mode"),
    travelRadiusMiles: row.travel_radius_miles,
    baseZip: row.base_zip,
    basePoint: { lat: row.base_lat, lng: row.base_lng },
    baseCity: row.city,
    baseState: row.state,
    timeZone: row.time_zone,
  };
}

/** Like loadMechanicState, for commands that need a profile: throws when there is none. */
export async function requireMechanicState(db: Kysely<DB>, viewer: Viewer): Promise<MechanicState> {
  assertMechanic(viewer);
  const state = await loadMechanicState(db, viewer.id);
  if (!state) {
    throw new DomainError("conflict", "Complete your mechanic application first.", { reason: "no_profile" });
  }
  return state;
}
