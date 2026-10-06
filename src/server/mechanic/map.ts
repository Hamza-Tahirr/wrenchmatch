import "server-only";

import { MECHANIC_SERVICE_MODE_INFO, type MechanicServiceMode } from "@/lib/domain";

import type { MechanicState } from "./access";

// Approximate map points for the mechanic pages. Every point here is a ZIP centroid (the
// request's ZIP or the mechanic's base ZIP), never an exact address, and only for records
// the mechanic may already see (docs/ARCHITECTURE.md section 8).

/** A ZIP-centroid point rounded to 3 decimals (about 100 m): approximate by design. */
export type ApproxPoint = { lat: number; lng: number };

/** The mechanic's own base for maps: base-ZIP centroid, travel radius and how they work. */
export type MechanicMapBase = {
  zip: string;
  /** "Tempe, AZ 85282" */
  areaLabel: string;
  point: ApproxPoint;
  travelRadiusMiles: number;
  serviceMode: MechanicServiceMode;
  serviceModeLabel: string;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function approxPoint(lat: number, lng: number): ApproxPoint {
  return { lat: round3(lat), lng: round3(lng) };
}

export function mapBase(state: MechanicState): MechanicMapBase {
  return {
    zip: state.baseZip,
    areaLabel: `${state.baseCity}, ${state.baseState} ${state.baseZip}`,
    point: approxPoint(state.basePoint.lat, state.basePoint.lng),
    travelRadiusMiles: state.travelRadiusMiles,
    serviceMode: state.serviceMode,
    serviceModeLabel: MECHANIC_SERVICE_MODE_INFO[state.serviceMode].label,
  };
}
