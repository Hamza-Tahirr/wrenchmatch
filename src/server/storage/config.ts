import "server-only";

import type { UploadBudget } from "@/components/media/media-types";
import { UPLOAD_LIMITS, type UploadPurpose } from "@/server/config";

// Storage settings: where uploads are kept and the request-size limit of the hosting
// platform. Environment variables are read once, when this module loads. UPLOAD_DIR and the
// per-purpose UPLOAD_LIMITS stay in src/server/config.ts.

const MiB = 1024 * 1024;

function readText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True on Vercel (it sets VERCEL=1 for builds and functions). */
export const ON_VERCEL = process.env.VERCEL === "1";

/** A Vercel Blob read-write token (`BLOB_READ_WRITE_TOKEN`), added when a Blob store is created. */
const BLOB_READ_WRITE_TOKEN = readText(process.env.BLOB_READ_WRITE_TOKEN);

/** The Blob store id (`BLOB_STORE_ID`) Vercel adds when a store is connected to the project (OIDC sign-in). */
const BLOB_STORE_ID = readText(process.env.BLOB_STORE_ID);

/**
 * Where uploads are stored: "blob", a private Vercel Blob store, when BLOB_READ_WRITE_TOKEN or
 * BLOB_STORE_ID is set; otherwise "local", UPLOAD_DIR on this machine's disk. The Blob SDK
 * picks the credentials itself (OIDC with BLOB_STORE_ID on Vercel, else the token).
 */
export const STORAGE_DRIVER: "blob" | "local" = BLOB_READ_WRITE_TOKEN || BLOB_STORE_ID ? "blob" : "local";

/** Vercel Functions refuse request bodies over 4.5 MB; the files of one form stay well under it. */
const VERCEL_UPLOAD_MAX_BYTES = 4 * MiB;

function readUploadBudget(value: string | undefined): number | null {
  const raw = value?.trim();
  if (raw && /^\d+$/.test(raw) && Number(raw) > 0) return Number(raw);
  return ON_VERCEL ? VERCEL_UPLOAD_MAX_BYTES : null;
}

/**
 * The most bytes of files one form submission may carry on the hosted site
 * (`HOSTED_UPLOAD_MAX_BYTES`; default 4 MB on Vercel), or null where requests may be large
 * (local runs: only the per-file UPLOAD_LIMITS apply). With a budget, browsers shrink photos
 * before sending them and stop a form whose files would not fit; the server checks the total
 * again (uploadBudgetProblem in uploads.ts).
 */
export const HOSTED_UPLOAD_MAX_BYTES: number | null = readUploadBudget(process.env.HOSTED_UPLOAD_MAX_BYTES);

/**
 * Files up to this size are streamed by GET /api/files/[id]; larger ones in Vercel Blob are
 * answered with a redirect to a short-lived signed URL instead (Vercel Functions cannot send
 * responses over 4.5 MB). Local storage streams every file.
 */
export const STREAMED_FILE_MAX_BYTES = 4 * MiB;

/** How long a signed Blob URL handed to a browser stays valid (long enough to watch a video). */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** How long Vercel's CDN may cache a stored blob (stored files never change). */
export const BLOB_CACHE_MAX_AGE_SECONDS = 60 * 60;

/** Pictures are shrunk in the browser to at most this long edge (the server's largest size)... */
const BROWSER_IMAGE_MAX_EDGE_PX = 2048;
/** ...and to about this size each. */
const BROWSER_IMAGE_TARGET_BYTES = 1 * MiB;

/**
 * The upload rules handed to the browser for `purpose`, or undefined where there is no
 * request budget (local runs: the upload components then send files as chosen).
 * `filesPerRequest` is how many files the form can send at once, so that pictures shrunk as
 * they are chosen leave room for the others.
 */
export function uploadBudgetFor(purpose: UploadPurpose, filesPerRequest = 1): UploadBudget | undefined {
  if (HOSTED_UPLOAD_MAX_BYTES === null) return undefined;
  const limit = UPLOAD_LIMITS[purpose];
  return {
    maxRequestBytes: HOSTED_UPLOAD_MAX_BYTES,
    imageMaxEdgePx: Math.min(BROWSER_IMAGE_MAX_EDGE_PX, limit.maxImageDimensionPx ?? BROWSER_IMAGE_MAX_EDGE_PX),
    imageTargetBytes: Math.min(
      BROWSER_IMAGE_TARGET_BYTES,
      limit.maxBytes,
      Math.floor(HOSTED_UPLOAD_MAX_BYTES / Math.max(1, filesPerRequest)),
    ),
  };
}

/**
 * The largest file of `purpose` the site accepts as sent: the purpose's limit, or the request
 * budget where that is smaller (videos and PDFs on the hosted site; pictures are shrunk first).
 */
export function effectiveMaxBytes(purpose: UploadPurpose): number {
  const { maxBytes } = UPLOAD_LIMITS[purpose];
  return HOSTED_UPLOAD_MAX_BYTES === null ? maxBytes : Math.min(maxBytes, HOSTED_UPLOAD_MAX_BYTES);
}
