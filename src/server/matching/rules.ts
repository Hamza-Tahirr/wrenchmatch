import "server-only";

import {
  PREFERRED_WINDOW_INFO,
  type MatchReason,
  type MechanicServiceMode,
  type MechanicStatus,
  type PreferredWindow,
  type RequestServiceMode,
} from "@/lib/domain";
import { isValidDateString, weekdayOfDate } from "@/lib/time";

import { haversineMiles, roundMiles, type GeoPoint } from "./geo";

// Matching eligibility (ARCHITECTURE section 6) as pure functions: no database and no clock
// (the caller passes today's date in the request's time zone). Every failing rule is
// reported, not only the first, so admins can see everything that keeps a mechanic away.

export type MatchRequest = {
  /** The request's approximate (ZIP-centroid) point. */
  point: GeoPoint;
  categoryId: string;
  /** Brake and suspension work: only mechanics an admin safety-approved may receive it. */
  categorySafetySensitive: boolean;
  /** Compared by exact value with the mechanic's makes. */
  make: string;
  serviceMode: RequestServiceMode;
  /** How far the customer will drive to a garage (garage rule). */
  maxGarageDistanceMiles: number;
  /** YYYY-MM-DD */
  preferredDate: string;
  preferredWindow: PreferredWindow;
  /** Today's date (YYYY-MM-DD) in the request's time zone. */
  todayLocal: string;
};

export type MatchService = { categoryId: string; safetyApproved: boolean };

/** A weekly window in local time: minutes from midnight, 0 = Sunday. */
export type MatchAvailability = { weekday: number; startMinute: number; endMinute: number };

export type MatchMechanic = {
  id: string;
  status: MechanicStatus;
  acceptingJobs: boolean;
  /** Insurance counts as recorded only with both a provider and an expiry date. */
  insuranceProvider: string | null;
  /** YYYY-MM-DD; the policy is valid through this day. */
  insuranceExpiresOn: string | null;
  /** Approximate base point (the base ZIP centroid). */
  basePoint: GeoPoint;
  serviceMode: MechanicServiceMode;
  /** How far the mechanic travels for mobile jobs (mobile rule). */
  travelRadiusMiles: number;
  servicesAllMakes: boolean;
  makes: readonly string[];
  services: readonly MatchService[];
  availability: readonly MatchAvailability[];
};

export type EffectiveServiceMode = "mobile" | "garage";

export type MechanicEvaluation = {
  mechanicId: string;
  /** True only when `reasons` is empty. */
  eligible: boolean;
  /** Every rule the mechanic fails, in MATCH_REASONS order. */
  reasons: MatchReason[];
  /** Miles between the ZIP centroids, rounded to 0.01 (the precision the radius rules compare). */
  distanceMiles: number;
  /**
   * How the location rules are met: "mobile" (preferred when both fit) or "garage"; null
   * when they are not (mode_mismatch or out_of_range). Independent of the other rules.
   */
  effectiveMode: EffectiveServiceMode | null;
};

const offersMobile = (mode: MechanicServiceMode) => mode === "mobile" || mode === "both";
const offersGarage = (mode: MechanicServiceMode) => mode === "garage" || mode === "both";

function assertRequestDates(request: MatchRequest): void {
  for (const [name, value] of [
    ["preferredDate", request.preferredDate],
    ["todayLocal", request.todayLocal],
  ] as const) {
    if (!isValidDateString(value)) {
      throw new RangeError(`${name} must be a calendar date YYYY-MM-DD, received "${value}"`);
    }
  }
}

function statusReason(status: MechanicStatus): MatchReason | null {
  if (status === "approved") return null;
  return status === "suspended" ? "suspended" : "status_not_approved";
}

/** Valid through the preferred date and still valid today: a policy expiring today counts. */
function insuranceReason(request: MatchRequest, mechanic: MatchMechanic): MatchReason | null {
  const expiresOn = mechanic.insuranceExpiresOn;
  if (!expiresOn || !mechanic.insuranceProvider?.trim()) return "insurance_missing";
  // YYYY-MM-DD strings compare in calendar order.
  return expiresOn >= request.preferredDate && expiresOn >= request.todayLocal
    ? null
    : "insurance_expired";
}

function categoryReason(request: MatchRequest, mechanic: MatchMechanic): MatchReason | null {
  const service = mechanic.services.find((entry) => entry.categoryId === request.categoryId);
  if (!service) return "category_not_offered";
  return request.categorySafetySensitive && !service.safetyApproved
    ? "safety_category_not_approved"
    : null;
}

/**
 * Mobile: the mechanic offers mobile work and the request is within their travel radius.
 * Garage: the mechanic offers garage work and is within the customer's garage distance.
 * "either" takes mobile when it fits, else garage. The distance only matters for a mode the
 * mechanic offers, so a mode the mechanic lacks is reported as mode_mismatch alone; with
 * "either" every mechanic offers one of the modes, so only out_of_range can fail.
 */
function locationOutcome(
  request: MatchRequest,
  mechanic: MatchMechanic,
  distanceMiles: number,
): { effectiveMode: EffectiveServiceMode | null; reason: MatchReason | null } {
  const wantsMobile = request.serviceMode !== "garage";
  const wantsGarage = request.serviceMode !== "mobile";
  const mobile = wantsMobile && offersMobile(mechanic.serviceMode);
  const garage = wantsGarage && offersGarage(mechanic.serviceMode);

  if (mobile && distanceMiles <= mechanic.travelRadiusMiles) {
    return { effectiveMode: "mobile", reason: null };
  }
  if (garage && distanceMiles <= request.maxGarageDistanceMiles) {
    return { effectiveMode: "garage", reason: null };
  }
  return { effectiveMode: null, reason: mobile || garage ? "out_of_range" : "mode_mismatch" };
}

/**
 * A weekly window on the preferred weekday must overlap the preferred time window. Overlap
 * is strict: a window ending exactly when the preferred window starts does not count.
 * "flexible" needs any window in the week.
 */
function hasAvailability(request: MatchRequest, mechanic: MatchMechanic): boolean {
  const { startMinute, endMinute } = PREFERRED_WINDOW_INFO[request.preferredWindow];
  if (startMinute === null || endMinute === null) return mechanic.availability.length > 0;
  const weekday = weekdayOfDate(request.preferredDate);
  return mechanic.availability.some(
    (slot) => slot.weekday === weekday && slot.startMinute < endMinute && startMinute < slot.endMinute,
  );
}

/** Checks one mechanic against one request and lists every rule that fails. */
export function evaluateMechanic(request: MatchRequest, mechanic: MatchMechanic): MechanicEvaluation {
  assertRequestDates(request);
  const distanceMiles = roundMiles(haversineMiles(request.point, mechanic.basePoint));
  const location = locationOutcome(request, mechanic, distanceMiles);

  // Pushed in MATCH_REASONS order; the reasons within each group are mutually exclusive.
  const reasons: MatchReason[] = [];
  const add = (reason: MatchReason | null) => {
    if (reason) reasons.push(reason);
  };
  add(statusReason(mechanic.status));
  add(mechanic.acceptingJobs ? null : "not_accepting_jobs");
  add(insuranceReason(request, mechanic));
  add(categoryReason(request, mechanic));
  add(mechanic.servicesAllMakes || mechanic.makes.includes(request.make) ? null : "make_not_supported");
  add(location.reason);
  add(hasAvailability(request, mechanic) ? null : "no_availability");

  return {
    mechanicId: mechanic.id,
    eligible: reasons.length === 0,
    reasons,
    distanceMiles,
    effectiveMode: location.effectiveMode,
  };
}

function byDistanceThenId(a: MechanicEvaluation, b: MechanicEvaluation): number {
  if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
  return a.mechanicId < b.mechanicId ? -1 : a.mechanicId > b.mechanicId ? 1 : 0;
}

/**
 * The eligible mechanics to notify: closest first (ties by id, so the order is
 * deterministic), at most `max`. Ineligible evaluations are never returned.
 */
export function selectMechanicsToNotify(
  evaluations: readonly MechanicEvaluation[],
  max: number,
): MechanicEvaluation[] {
  if (!Number.isInteger(max) || max < 0) {
    throw new RangeError(`max must be a non-negative integer, received ${max}`);
  }
  return evaluations
    .filter((evaluation) => evaluation.eligible)
    .sort(byDistanceThenId)
    .slice(0, max);
}
