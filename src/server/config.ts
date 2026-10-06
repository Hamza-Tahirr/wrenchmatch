import "server-only";

import path from "node:path";

// Runtime configuration. Environment variables are read once, when this module loads;
// domain code receives everything else through AppContext and never reads process.env.

function readPath(value: string | undefined, fallback: string): string {
  const raw = value?.trim() ? value.trim() : fallback;
  // A runtime location (database, private uploads), not a bundled asset: the ignore comment
  // keeps Turbopack from tracing the whole project (including .data/) into the server output.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}

function readOptional(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export const APP_NAME = "WrenchMatch";

/** Absolute path of the SQLite database file (`DATABASE_PATH`, default `.data/app.db`). */
export const DATABASE_PATH = readPath(process.env.DATABASE_PATH, ".data/app.db");

/**
 * Hosted libSQL database (`TURSO_DATABASE_URL`, e.g. `libsql://<db>-<org>.turso.io`; `https://`
 * and local `file:` URLs work too). When set, the app uses it instead of DATABASE_PATH, as the
 * Vercel deployment does; `npm run db:push:remote` copies the local database to it.
 */
export const TURSO_DATABASE_URL = readOptional(process.env.TURSO_DATABASE_URL);

/** Auth token for TURSO_DATABASE_URL (`TURSO_AUTH_TOKEN`; a `file:` URL needs none). */
export const TURSO_AUTH_TOKEN = readOptional(process.env.TURSO_AUTH_TOKEN);

/** Absolute path of the private upload directory (`UPLOAD_DIR`, default `.data/uploads`). Never under `public/`. */
export const UPLOAD_DIR = readPath(process.env.UPLOAD_DIR, ".data/uploads");

/**
 * One-click sample-account logins on /login (`DEMO_MODE`). Fails closed: on by default only in
 * development; a production build needs DEMO_MODE=true explicitly (the local .env.local sets it
 * for presentations). The login action also refuses requests that don't come from localhost.
 */
export const DEMO_MODE = readBoolean(process.env.DEMO_MODE, process.env.NODE_ENV !== "production");

/** Provisional platform fee: 10% of labor, in basis points (see ARCHITECTURE section 7). */
export const PLATFORM_FEE_BPS = 1000;

/** At most this many of the closest eligible mechanics are notified about a request. */
export const MAX_MECHANICS_NOTIFIED = 5;

/** Requests expire this many days after submission. */
export const REQUEST_TTL_DAYS = 7;

/** Quote validity choices offered to mechanics, in hours. */
export const QUOTE_TTL_HOURS_OPTIONS = [24, 48, 72, 168] as const;
export type QuoteTtlHours = (typeof QUOTE_TTL_HOURS_OPTIONS)[number];

export const SESSION_TTL_DAYS = 7;

// ---------------------------------------------------------------------------------
// Upload limits (ARCHITECTURE section 9). Keys match `files.purpose`. Files are
// validated by magic bytes and size on the server, never by the browser's MIME type.
// ---------------------------------------------------------------------------------

const MiB = 1024 * 1024;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"] as const;

export type UploadPurpose =
  | "request_photo"
  | "request_video"
  | "mechanic_profile_photo"
  | "mechanic_document"
  | "user_avatar"
  | "mechanic_gallery"
  | "booking_photo";

export type UploadLimit = {
  /** Maximum size of one file, in bytes. */
  readonly maxBytes: number;
  /** Maximum number of files of this purpose accepted in one submission. */
  readonly maxFiles: number;
  readonly mimeTypes: readonly string[];
  /** Images are re-encoded no larger than this (longest side, px); null = stored as uploaded. */
  readonly maxImageDimensionPx: number | null;
};

export const UPLOAD_LIMITS = {
  // decoded with sharp, auto-rotated, resized, re-encoded as JPEG; all EXIF/GPS/ICC removed
  request_photo: {
    maxBytes: 8 * MiB,
    maxFiles: 5,
    mimeTypes: IMAGE_MIME_TYPES,
    maxImageDimensionPx: 2048,
  },
  // stored as uploaded and never shown to mechanics before a confirmed booking
  request_video: {
    maxBytes: 40 * MiB,
    maxFiles: 1,
    mimeTypes: VIDEO_MIME_TYPES,
    maxImageDimensionPx: null,
  },
  mechanic_profile_photo: {
    maxBytes: 5 * MiB,
    maxFiles: 1,
    mimeTypes: IMAGE_MIME_TYPES,
    maxImageDimensionPx: 512,
  },
  // one document per upload; images are sanitized like request photos, PDFs stored as-is
  mechanic_document: {
    maxBytes: 10 * MiB,
    maxFiles: 1,
    mimeTypes: DOCUMENT_MIME_TYPES,
    maxImageDimensionPx: 2048,
  },
  // Pictures people add themselves (docs/MEDIA.md); all re-encoded with metadata removed.
  // A profile picture for any account (shown small and round).
  user_avatar: {
    maxBytes: 8 * MiB,
    maxFiles: 1,
    mimeTypes: IMAGE_MIME_TYPES,
    maxImageDimensionPx: 512,
  },
  // A mechanic's work gallery (MEDIA_LIMITS.galleryPhotosTotal in all).
  mechanic_gallery: {
    maxBytes: 8 * MiB,
    maxFiles: 12,
    mimeTypes: IMAGE_MIME_TYPES,
    maxImageDimensionPx: 1600,
  },
  // Before/after photos on a confirmed booking (MEDIA_LIMITS.bookingPhotosTotal in all).
  booking_photo: {
    maxBytes: 8 * MiB,
    maxFiles: 10,
    mimeTypes: IMAGE_MIME_TYPES,
    maxImageDimensionPx: 1600,
  },
} as const satisfies Record<UploadPurpose, UploadLimit>;

/** Totals per record for pictures added over time (docs/MEDIA.md). */
export const MEDIA_LIMITS = {
  /** Photos on one repair request in all, the ones sent with it included. */
  requestPhotosTotal: 8,
  /** Photos in one mechanic's work gallery. */
  galleryPhotosTotal: 12,
  /** Photos on one booking in all (customer and mechanic together). */
  bookingPhotosTotal: 40,
  /** Gallery and booking photo captions, in characters. */
  captionMaxLength: 140,
  /** Pictures one account may add per hour (avatars, request, gallery and booking photos). */
  picturesPerHour: 60,
} as const;
