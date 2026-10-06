import type { MapCircle, MapLegendItem, MapLine, MapPoint, MapTone } from "@/components/map";
import { circleRing, type LatLng } from "@/components/map/geo";
import type { RequestServiceMode } from "@/lib/domain";
import type { AdminMatchEvaluation, ApproxPoint } from "@/server/admin/requests";

// Map layers for matching diagnostics (pure, safe on server and client): the request's ZIP
// area, each evaluated mechanic's base-ZIP centroid with their travel radius, colored by the
// last run's result, and connectors to the mechanics who were notified. Approximate points
// only: ZIP centroids from the database.

export type DiagnosticsRequest = {
  id: string;
  title: string;
  areaLabel: string;
  location: ApproxPoint;
  serviceMode: RequestServiceMode;
  maxGarageDistanceMiles: number;
};

export type EvaluationResult = "notified" | "eligible" | "excluded";

export function evaluationResult(evaluation: Pick<AdminMatchEvaluation, "notified" | "eligible">): EvaluationResult {
  if (evaluation.notified) return "notified";
  return evaluation.eligible ? "eligible" : "excluded";
}

export const RESULT_TONES: Record<EvaluationResult, MapTone> = {
  notified: "success",
  eligible: "blue",
  excluded: "warning",
};

export const RESULT_LABELS: Record<EvaluationResult, string> = {
  notified: "Notified",
  eligible: "Eligible, not notified",
  excluded: "Excluded",
};

const REQUEST_MODE_LABELS: Record<RequestServiceMode, string> = {
  mobile: "mobile visit",
  garage: "garage visit",
  either: "mobile or garage",
};

function miles(value: number | null): string | null {
  if (value === null) return null;
  return value < 1 ? "less than 1 mi away" : `about ${Math.round(value)} mi away`;
}

/** The marker id of a request's own point (mechanic markers use the mechanic id). */
export function requestPointId(requestId: string): string {
  return `request-${requestId}`;
}

/**
 * A travel radius as an outline-only glowing ring (line segments). Many filled circles would
 * stack their translucent fills into a wash over the base map where radii overlap.
 */
export function ringLines(id: string, center: LatLng, radiusMiles: number, tone: MapTone, steps = 64): MapLine[] {
  const ring = circleRing(center, radiusMiles, steps);
  const lines: MapLine[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [fromLng, fromLat] = ring[index];
    const [toLng, toLat] = ring[index + 1];
    lines.push({ id: `${id}-${index}`, from: { lat: fromLat, lng: fromLng }, to: { lat: toLat, lng: toLng }, tone });
  }
  return lines;
}

export function evaluationDescription(evaluation: AdminMatchEvaluation): string {
  const result = evaluationResult(evaluation);
  const why =
    result === "excluded"
      ? `Excluded: ${evaluation.reasons.map((reason) => reason.label).join(", ") || "no reason recorded"}`
      : result === "eligible"
        ? "Eligible, but the closest mechanics were notified first"
        : "Notified about this request";
  const radius = evaluation.serviceMode === "garage" ? "garage only" : `travels up to ${evaluation.travelRadiusMiles} mi`;
  return [why, miles(evaluation.distanceMiles), evaluation.base.area, radius].filter(Boolean).join(" · ");
}

export function diagnosticsLayers(
  request: DiagnosticsRequest,
  evaluations: readonly AdminMatchEvaluation[],
  options: { requestTone?: MapTone; pulseRequest?: boolean } = {},
): { points: MapPoint[]; circles: MapCircle[]; lines: MapLine[] } {
  const points: MapPoint[] = [
    {
      id: requestPointId(request.id),
      lat: request.location.lat,
      lng: request.location.lng,
      label: "Request area",
      description: `${request.title} · ${request.areaLabel} · ${REQUEST_MODE_LABELS[request.serviceMode]}`,
      tone: options.requestTone ?? "cyan",
      kind: "home",
      pulse: options.pulseRequest ?? true,
    },
  ];
  const circles: MapCircle[] = [
    {
      id: `area-${request.id}`,
      lat: request.location.lat,
      lng: request.location.lng,
      radiusMiles: 1.5,
      tone: options.requestTone ?? "cyan",
      dashed: false,
    },
  ];
  if (request.serviceMode !== "mobile") {
    circles.push({
      id: `garage-${request.id}`,
      lat: request.location.lat,
      lng: request.location.lng,
      radiusMiles: request.maxGarageDistanceMiles,
      tone: "cyan",
      dashed: true,
      label: `The customer travels up to ${request.maxGarageDistanceMiles} mi to a garage`,
    });
  }
  const lines: MapLine[] = [];
  const connectors: MapLine[] = [];

  for (const evaluation of evaluations) {
    const result = evaluationResult(evaluation);
    const tone = RESULT_TONES[result];
    points.push({
      id: evaluation.mechanic.id,
      lat: evaluation.base.lat,
      lng: evaluation.base.lng,
      label: evaluation.mechanic.displayName,
      description: evaluationDescription(evaluation),
      tone,
      hideLabel: result === "excluded",
      href: `/admin/mechanics/${evaluation.mechanic.id}`,
      hrefLabel: "Open mechanic",
    });
    if (evaluation.serviceMode !== "garage") {
      lines.push(...ringLines(`radius-${evaluation.mechanic.id}`, evaluation.base, evaluation.travelRadiusMiles, tone));
    }
    if (result === "notified") {
      connectors.push({
        id: `link-${evaluation.mechanic.id}`,
        from: evaluation.base,
        to: request.location,
        tone: "success",
        label: `${evaluation.mechanic.displayName} → request: ${miles(evaluation.distanceMiles) ?? "distance unknown"}`,
      });
    }
  }
  // Connectors last, so they draw over the rings.
  return { points, circles, lines: [...lines, ...connectors] };
}

export function diagnosticsLegend(evaluations: readonly AdminMatchEvaluation[], requestTone: MapTone = "cyan"): MapLegendItem[] {
  const present = new Set(evaluations.map(evaluationResult));
  return [
    { tone: requestTone, label: "Request (ZIP area)", kind: "home" },
    ...(["notified", "eligible", "excluded"] as const)
      .filter((result) => present.has(result))
      .map((result) => ({ tone: RESULT_TONES[result], label: RESULT_LABELS[result] })),
    ...(evaluations.length > 0 ? [{ tone: "neutral" as const, label: "Travel radius", kind: "ring" as const }] : []),
  ];
}
