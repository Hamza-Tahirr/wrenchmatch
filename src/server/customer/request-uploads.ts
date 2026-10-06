import "server-only";

import { REQUEST_PHOTO_FIELD, REQUEST_VIDEO_FIELD, type FieldErrors } from "@/lib/validation/request";
import { UPLOAD_LIMITS, VIDEO_MIME_TYPES } from "@/server/config";
import { DomainError } from "@/server/errors";
import {
  filesFromFormData,
  prepareUpload,
  uploadBudgetProblem,
  uploadInputFromFile,
  type PreparedUpload,
} from "@/server/storage/uploads";

// Photos and the optional video of a repair request. Server Actions prepare them (validate by
// magic bytes, strip photo metadata) before calling submitRepairRequest, which re-checks the
// counts and types and stores them inside its transaction.

export type RequestUpload = {
  prepared: PreparedUpload;
  /** The browser-supplied name (sanitized again when stored); null when unknown. */
  originalName: string | null;
};

export type RequestUploads = {
  photos: readonly RequestUpload[];
  /** At most one. */
  videos: readonly RequestUpload[];
};

export const NO_REQUEST_UPLOADS: RequestUploads = { photos: [], videos: [] };

export type PreparedRequestUploads = { ok: true; uploads: RequestUploads } | { ok: false; fieldErrors: FieldErrors };

const PHOTO_LIMIT = UPLOAD_LIMITS.request_photo.maxFiles;
const VIDEO_LIMIT = UPLOAD_LIMITS.request_video.maxFiles;

export function photoCountMessage(count: number): string {
  return `Add up to ${PHOTO_LIMIT} photos (you chose ${count}).`;
}

export function videoCountMessage(count: number): string {
  return `Add one short video at most (you chose ${count}).`;
}

/**
 * Field errors for uploads that submitRepairRequest must refuse: too many files, or files
 * that did not come out of prepareUpload as a sanitized photo / a video.
 */
export function requestUploadErrors(uploads: RequestUploads): FieldErrors {
  const errors: FieldErrors = {};
  if (uploads.photos.length > PHOTO_LIMIT) errors[REQUEST_PHOTO_FIELD] = [photoCountMessage(uploads.photos.length)];
  else if (uploads.photos.some(({ prepared }) => prepared.mimeType !== "image/jpeg" || !prepared.metadataStripped)) {
    errors[REQUEST_PHOTO_FIELD] = ["Photos must be JPEG, PNG or WebP images."];
  }
  const videoTypes: readonly string[] = VIDEO_MIME_TYPES;
  if (uploads.videos.length > VIDEO_LIMIT) errors[REQUEST_VIDEO_FIELD] = [videoCountMessage(uploads.videos.length)];
  else if (uploads.videos.some(({ prepared }) => !videoTypes.includes(prepared.mimeType))) {
    errors[REQUEST_VIDEO_FIELD] = ["Videos must be MP4, MOV or WebM."];
  }
  return errors;
}

async function prepareField(
  files: readonly File[],
  purpose: "request_photo" | "request_video",
  errors: string[],
): Promise<RequestUpload[]> {
  const prepared: RequestUpload[] = [];
  for (const file of files) {
    try {
      prepared.push({ prepared: await prepareUpload(await uploadInputFromFile(file), purpose), originalName: file.name });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      errors.push(error.userMessage);
    }
  }
  return prepared;
}

/**
 * Reads the request form's "photos" and "video" file inputs and prepares every file
 * (prepareUpload: type by magic bytes, size limits, photo metadata removed). Returns field
 * errors keyed "photos" / "video" naming each rejected file. On the hosted site, photos and
 * video must also fit the request budget together. File inputs cannot be refilled after a
 * failed submit, so the form should ask the person to choose their files again.
 */
export async function prepareRequestUploads(formData: FormData): Promise<PreparedRequestUploads> {
  const photoFiles = filesFromFormData(formData, REQUEST_PHOTO_FIELD);
  const videoFiles = filesFromFormData(formData, REQUEST_VIDEO_FIELD);
  const fieldErrors: FieldErrors = {};

  // Over-limit selections are refused before any file is decoded.
  if (photoFiles.length > PHOTO_LIMIT) fieldErrors[REQUEST_PHOTO_FIELD] = [photoCountMessage(photoFiles.length)];
  if (videoFiles.length > VIDEO_LIMIT) fieldErrors[REQUEST_VIDEO_FIELD] = [videoCountMessage(videoFiles.length)];
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const overBudget = uploadBudgetProblem(formData);
  if (overBudget) return { ok: false, fieldErrors: { [videoFiles.length > 0 ? REQUEST_VIDEO_FIELD : REQUEST_PHOTO_FIELD]: [overBudget] } };

  const photoErrors: string[] = [];
  const videoErrors: string[] = [];
  const photos = await prepareField(photoFiles, "request_photo", photoErrors);
  const videos = await prepareField(videoFiles, "request_video", videoErrors);
  if (photoErrors.length > 0) fieldErrors[REQUEST_PHOTO_FIELD] = photoErrors;
  if (videoErrors.length > 0) fieldErrors[REQUEST_VIDEO_FIELD] = videoErrors;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, uploads: { photos, videos } };
}
