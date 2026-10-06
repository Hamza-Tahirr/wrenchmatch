import "server-only";

import type { UploadBudget } from "@/components/media/media-types";
import {
  CONSENT_VERSION,
  DEFAULT_GARAGE_DISTANCE_MILES,
  GARAGE_DISTANCE_OPTIONS,
  PREFERRED_WINDOW_INFO,
  PREFERRED_WINDOWS,
  REQUEST_CONSENTS,
  REQUEST_SERVICE_MODE_INFO,
  REQUEST_SERVICE_MODES,
  VEHICLE_MAKES,
  type ConsentItem,
  type GarageDistanceMiles,
  type PreferredWindow,
  type RequestServiceMode,
  type VehicleMake,
} from "@/lib/domain";
import { formatBytes } from "@/lib/format";
import { todayInZone } from "@/lib/time";
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MAX_MILEAGE,
  preferredDateBounds,
  REQUEST_PHOTO_FIELD,
  REQUEST_VIDEO_FIELD,
  vehicleYearBounds,
} from "@/lib/validation/request";
import { UPLOAD_LIMITS } from "@/server/config";
import type { AppContext } from "@/server/context";
import { effectiveMaxBytes, HOSTED_UPLOAD_MAX_BYTES, uploadBudgetFor } from "@/server/storage/config";

import { listEnabledCategories, quoteHintFor, type CategoryOption } from "./categories";
import { getCoverage, type Coverage } from "./coverage";
import { listPilotAreas, type PilotArea } from "./pilot-zips";

export type UploadFieldOptions = {
  /** FormData field name of the file input. */
  field: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  /** For the input's accept attribute. */
  accept: string;
  acceptLabel: string;
  /** e.g. "Up to 5 photos, 8 MB each" */
  limitLabel: string;
  /** Who can see the files and when. */
  sharing: string;
  /**
   * The hosted site's upload rules for the whole form (photos and video travel in one
   * request; photos are shrunk as they are chosen); absent locally.
   */
  budget?: UploadBudget;
};

/** A category as the request form shows it: its definition, notice and what helps mechanics quote it. */
export type RequestCategoryOption = CategoryOption & {
  /** The details that help a mechanic quote this repair (MVP_PLAN section 4). */
  quoteHint: string;
};

export type RequestFormOptions = {
  categories: RequestCategoryOption[];
  makes: readonly VehicleMake[];
  windows: { value: PreferredWindow; label: string; hours: string }[];
  serviceModes: { value: RequestServiceMode; label: string; description: string }[];
  garageDistances: { options: readonly GarageDistanceMiles[]; defaultMiles: GarageDistanceMiles };
  /** Required agreements: the exact text and version stored in the request's consent snapshot. */
  consents: { version: string; items: readonly ConsentItem[] };
  /** Where requests are accepted; empty when no pilot ZIP is enabled. */
  pilotAreas: PilotArea[];
  /** Enabled pilot ZIP centroids and metro summaries (coverage.ts), for the coverage preview map. */
  coverage: Coverage;
  vehicleYears: { min: number; max: number };
  maxMileage: number;
  description: { minLength: number; maxLength: number };
  /**
   * Bounds for the date input (min/max attributes): today to 60 days ahead across the pilot
   * time zones. The server re-checks the exact window in the ZIP's own time zone.
   */
  preferredDate: { min: string; max: string };
  uploads: { photos: UploadFieldOptions; video: UploadFieldOptions };
};

/** Everything the request form needs to render its choices, limits and consent text. */
export async function getRequestFormOptions(ctx: Pick<AppContext, "db" | "now">): Promise<RequestFormOptions> {
  const [categories, pilotAreas, coverage] = [
    await listEnabledCategories(ctx),
    await listPilotAreas(ctx.db),
    await getCoverage(ctx),
  ];

  const zones = [...new Set(pilotAreas.flatMap((area) => area.timeZones))];
  const todays = (zones.length > 0 ? zones : ["UTC"]).map((zone) => todayInZone(ctx.now, zone)).sort();
  const earliest = preferredDateBounds(todays[0]);
  const latest = preferredDateBounds(todays[todays.length - 1]);

  const photoLimit = UPLOAD_LIMITS.request_photo;
  const videoLimit = UPLOAD_LIMITS.request_video;
  // On the hosted site one request carries the photos and the video together, so the video
  // gets what the (shrunk) photos leave of HOSTED_UPLOAD_MAX_BYTES.
  const hosted = HOSTED_UPLOAD_MAX_BYTES;
  const budget = uploadBudgetFor("request_photo", photoLimit.maxFiles + videoLimit.maxFiles);
  const videoMaxBytes = effectiveMaxBytes("request_video");

  return {
    categories: categories.map((category) => ({ ...category, quoteHint: quoteHintFor(category.id) })),
    makes: VEHICLE_MAKES,
    windows: PREFERRED_WINDOWS.map((value) => ({
      value,
      label: PREFERRED_WINDOW_INFO[value].label,
      hours: PREFERRED_WINDOW_INFO[value].hours,
    })),
    serviceModes: REQUEST_SERVICE_MODES.map((value) => ({ value, ...REQUEST_SERVICE_MODE_INFO[value] })),
    garageDistances: { options: GARAGE_DISTANCE_OPTIONS, defaultMiles: DEFAULT_GARAGE_DISTANCE_MILES },
    consents: { version: CONSENT_VERSION, items: REQUEST_CONSENTS },
    pilotAreas,
    coverage,
    vehicleYears: vehicleYearBounds(ctx.now),
    maxMileage: MAX_MILEAGE,
    description: { minLength: DESCRIPTION_MIN_LENGTH, maxLength: DESCRIPTION_MAX_LENGTH },
    preferredDate: { min: earliest.min, max: latest.max },
    uploads: {
      photos: {
        field: REQUEST_PHOTO_FIELD,
        maxFiles: photoLimit.maxFiles,
        maxFileSizeBytes: photoLimit.maxBytes,
        accept: photoLimit.mimeTypes.join(","),
        acceptLabel: "JPEG, PNG or WebP",
        limitLabel:
          hosted === null
            ? `Up to ${photoLimit.maxFiles} photos, ${formatBytes(photoLimit.maxBytes)} each`
            : `Up to ${photoLimit.maxFiles} photos, resized before sending`,
        sharing:
          "Shared with the mechanics we match after location and camera data are removed. iPhone HEIC photos need to be exported as JPEG.",
        budget,
      },
      video: {
        field: REQUEST_VIDEO_FIELD,
        maxFiles: videoLimit.maxFiles,
        maxFileSizeBytes: videoMaxBytes,
        accept: videoLimit.mimeTypes.join(","),
        acceptLabel: "MP4, MOV or WebM",
        limitLabel:
          hosted === null
            ? `One short video, up to ${formatBytes(videoMaxBytes)}`
            : `One short clip; photos and video together up to ${formatBytes(hosted)}`,
        sharing:
          "Kept private: a video can contain location data we can't remove, so mechanics see it only after a booking is confirmed.",
        budget,
      },
    },
  };
}
