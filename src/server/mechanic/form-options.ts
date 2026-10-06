import "server-only";

import type { UploadBudget } from "@/components/media/media-types";
import {
  DOCUMENT_KIND_INFO,
  DOCUMENT_KINDS,
  MECHANIC_SERVICE_MODE_INFO,
  MECHANIC_SERVICE_MODES,
  VEHICLE_MAKES,
  type ConsentItem,
  type DocumentKind,
  type MechanicServiceMode,
  type VehicleMake,
} from "@/lib/domain";
import { formatBytes } from "@/lib/format";
import { MECHANIC_FORM_LIMITS, MECHANIC_TERMS, MECHANIC_TERMS_VERSION, WEEKDAYS } from "@/lib/validation/mechanic";
import { listPilotAreas } from "@/server/catalog/pilot-zips";
import { UPLOAD_LIMITS } from "@/server/config";
import type { AppContext } from "@/server/context";
import { effectiveMaxBytes, HOSTED_UPLOAD_MAX_BYTES, uploadBudgetFor } from "@/server/storage/config";

import { approxPoint } from "./map";

// Everything the application and profile forms display: choices, terms and upload limits.

export type MechanicCategoryOption = {
  id: string;
  name: string;
  shortDescription: string;
  safetySensitive: boolean;
  /** For brake/suspension work: offering it is not enough, an admin must approve it. */
  safetyNote: string | null;
};

export type UploadFieldLimits = {
  /** For the input's accept attribute. */
  accept: string;
  /** e.g. "PDF, JPEG, PNG or WebP" */
  acceptLabel: string;
  maxBytes: number;
  /** One file, e.g. "Up to 10 MB" */
  limitLabel: string;
  /** The hosted site's upload rules (pictures are shrunk before sending); absent locally. */
  budget?: UploadBudget;
};

export type MechanicFormOptions = {
  /** Enabled categories in display order. */
  categories: MechanicCategoryOption[];
  makes: readonly VehicleMake[];
  serviceModes: Array<{ value: MechanicServiceMode; label: string; description: string }>;
  weekdays: typeof WEEKDAYS;
  documentKinds: Array<{ value: DocumentKind; label: string; description: string }>;
  /** Show every item; the application's single "acceptTerms" checkbox accepts them all. */
  terms: { version: string; items: readonly ConsentItem[] };
  uploads: {
    profilePhoto: UploadFieldLimits;
    document: UploadFieldLimits;
    certificationDocsMax: number;
    /** The certification-documents field, e.g. "Up to 3 files, 10 MB each" */
    certificationDocsLimitLabel: string;
  };
  limits: typeof MECHANIC_FORM_LIMITS;
  /** Enabled pilot ZIPs ("85281" / "Tempe, AZ") offered as base-ZIP suggestions. */
  zipSuggestions: Array<{ zip: string; label: string }>;
  /**
   * Every ZIP with a known centroid (a base ZIP needs one), for the live service-area map:
   * approximate public reference points, rounded like every other map point.
   */
  zipCentroids: ZipCentroidOption[];
};

export type ZipCentroidOption = { zip: string; label: string; lat: number; lng: number };

const SAFETY_NOTE =
  "Safety-critical work: you can add it now, but you receive these jobs only after an admin reviews and approves you for it.";

/** Files one application can carry: photo ID, insurance certificate, profile photo, certifications. */
const APPLICATION_FILES = 3 + MECHANIC_FORM_LIMITS.certificationDocsMax;

/**
 * The upload limits the forms show. On the hosted site one request carries at most
 * HOSTED_UPLOAD_MAX_BYTES of files, pictures are shrunk before sending and PDFs must fit.
 */
function uploadLimits(): MechanicFormOptions["uploads"] {
  const photoMax = effectiveMaxBytes("mechanic_profile_photo");
  const documentMax = effectiveMaxBytes("mechanic_document");
  const certifications = MECHANIC_FORM_LIMITS.certificationDocsMax;
  const hosted = HOSTED_UPLOAD_MAX_BYTES;
  return {
    profilePhoto: {
      accept: UPLOAD_LIMITS.mechanic_profile_photo.mimeTypes.join(","),
      acceptLabel: "JPEG, PNG or WebP",
      maxBytes: photoMax,
      limitLabel: hosted === null ? `Up to ${formatBytes(photoMax)}` : "Resized before sending",
      budget: uploadBudgetFor("mechanic_profile_photo", APPLICATION_FILES),
    },
    document: {
      accept: UPLOAD_LIMITS.mechanic_document.mimeTypes.join(","),
      acceptLabel: "PDF, JPEG, PNG or WebP",
      maxBytes: documentMax,
      limitLabel:
        hosted === null ? `Up to ${formatBytes(documentMax)}` : `Up to ${formatBytes(documentMax)}; photos are resized before sending`,
      budget: uploadBudgetFor("mechanic_document", APPLICATION_FILES),
    },
    certificationDocsMax: certifications,
    certificationDocsLimitLabel:
      hosted === null
        ? `Up to ${certifications} files, ${formatBytes(documentMax)} each`
        : `Up to ${certifications} files; all files in this form together up to ${formatBytes(hosted)}`,
  };
}

export async function getMechanicFormOptions(ctx: Pick<AppContext, "db">): Promise<MechanicFormOptions> {
  const categories = await ctx.db
    .selectFrom("service_categories")
    .select(["id", "name", "short_description", "safety_sensitive"])
    .where("enabled", "=", 1)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
  const pilotAreas = await listPilotAreas(ctx.db);
  const centroids = await ctx.db
    .selectFrom("zip_centroids")
    .select(["zip", "city", "state", "lat", "lng"])
    .orderBy("zip")
    .limit(2000)
    .execute();
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      shortDescription: category.short_description,
      safetySensitive: category.safety_sensitive === 1,
      safetyNote: category.safety_sensitive === 1 ? SAFETY_NOTE : null,
    })),
    makes: VEHICLE_MAKES,
    serviceModes: MECHANIC_SERVICE_MODES.map((value) => ({ value, ...MECHANIC_SERVICE_MODE_INFO[value] })),
    weekdays: WEEKDAYS,
    documentKinds: DOCUMENT_KINDS.map((value) => ({ value, ...DOCUMENT_KIND_INFO[value] })),
    terms: { version: MECHANIC_TERMS_VERSION, items: MECHANIC_TERMS },
    uploads: uploadLimits(),
    limits: MECHANIC_FORM_LIMITS,
    zipSuggestions: pilotAreas.flatMap((area) =>
      area.zips.map((entry) => ({ zip: entry.zip, label: `${entry.city}, ${entry.state}` })),
    ),
    zipCentroids: centroids.map((row) => ({
      zip: row.zip,
      label: `${row.city}, ${row.state} ${row.zip}`,
      ...approxPoint(row.lat, row.lng),
    })),
  };
}
