import "server-only";

import type { MechanicServiceMode, QuoteServiceMode, RequestServiceMode } from "@/lib/domain";

// Where a quoted job may happen. A mode is allowed when the request asks for it (mobile,
// garage, or either), the mechanic offers it, and the matching distance rule for that mode
// holds (src/server/matching/rules.ts): mobile within the mechanic's travel radius, garage
// within the customer's maximum garage distance. Unlike matching, which records one
// effective mode (mobile preferred), a quote may use any mode that fits.

export type ServiceModeInput = {
  requestMode: RequestServiceMode;
  maxGarageDistanceMiles: number;
  mechanicMode: MechanicServiceMode;
  travelRadiusMiles: number;
  /** Approximate miles between the ZIP centroids (rounded like matching, to 0.01). */
  distanceMiles: number;
};

/** Allowed modes, mobile first; empty when none fits (e.g. after the mechanic moved base). */
export function allowedQuoteModes(input: ServiceModeInput): QuoteServiceMode[] {
  const modes: QuoteServiceMode[] = [];
  const mobileOffered = input.mechanicMode === "mobile" || input.mechanicMode === "both";
  const garageOffered = input.mechanicMode === "garage" || input.mechanicMode === "both";
  if (input.requestMode !== "garage" && mobileOffered && input.distanceMiles <= input.travelRadiusMiles) {
    modes.push("mobile");
  }
  if (input.requestMode !== "mobile" && garageOffered && input.distanceMiles <= input.maxGarageDistanceMiles) {
    modes.push("garage");
  }
  return modes;
}
