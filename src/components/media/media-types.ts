// Plain data shared by the media Server Actions (src/server/media/actions.ts), the media
// queries and the client components in this folder. No server code and no React here, so
// both sides can import it. docs/MEDIA.md describes what people can upload where.

export const BOOKING_PHOTO_PHASES = ["before", "after", "other"] as const;
export type BookingPhotoPhase = (typeof BOOKING_PHOTO_PHASES)[number];

export const BOOKING_PHASE_LABELS: Readonly<Record<BookingPhotoPhase, string>> = {
  before: "Before",
  after: "After",
  other: "Other",
};

/** Form field that carries the chosen files in every media form. */
export const PHOTO_FIELD = "photos";

/** The `accept` attribute for every picture input: the server re-checks the bytes. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_TYPES_LABEL = "JPEG, PNG or WebP";
export const PHOTO_MIME_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** Result of a media Server Action, for useActionState. */
export type MediaActionState = {
  status: "idle" | "success" | "error";
  /** A short summary ("3 photos added.", "Choose at most 3 more photos."). */
  message: string | null;
  /** Problems with individual files, one message each. */
  errors: readonly string[];
  /** Increases with every completed submission, so the UI can react to each result. */
  version: number;
};

export const INITIAL_MEDIA_STATE: MediaActionState = { status: "idle", message: null, errors: [], version: 0 };

/** One picture as the display components receive it (never a storage key or file name). */
export type MediaPhoto = {
  /** Row id: the gallery or booking photo id, or the file id for request photos and avatars. */
  id: string;
  fileId: string;
  /** Always /api/files/<fileId>, which re-checks access on every request. */
  src: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  /** Text alternative for the image. */
  alt: string;
};

export type GalleryPhotoView = MediaPhoto & { sortOrder: number };

export type BookingPhotoView = MediaPhoto & {
  phase: BookingPhotoPhase;
  uploadedByRole: "customer" | "mechanic";
  /** Added by the person viewing (they may remove it). */
  mine: boolean;
  createdAt: string;
};

/** Upload limits handed to the client components for early checks (the server re-checks). */
export type PhotoLimits = {
  /** Files accepted in one submission. */
  maxFiles: number;
  maxBytes: number;
};

/**
 * Upload rules of the hosted site, where one request may carry only a few MB (Vercel), from
 * uploadBudgetFor() in src/server/storage/config.ts. Absent locally: files go as chosen. With
 * a budget, pictures are shrunk in the browser before they are sent, and a form whose files
 * would not fit says so instead of sending them. The server checks everything again.
 */
export type UploadBudget = {
  /** All files of one form submission together, in bytes. */
  maxRequestBytes: number;
  /** Pictures are scaled down to at most this many pixels on their long edge... */
  imageMaxEdgePx: number;
  /** ...and compressed to about this size or less each. */
  imageTargetBytes: number;
};
