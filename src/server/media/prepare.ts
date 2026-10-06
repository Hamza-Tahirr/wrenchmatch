import "server-only";

import { PHOTO_FIELD } from "@/components/media/media-types";
import { UPLOAD_LIMITS } from "@/server/config";
import { isDomainError } from "@/server/errors";
import { filesFromFormData, prepareUpload, uploadBudgetProblem, uploadInputFromFile } from "@/server/storage/uploads";

import type { MediaUpload, PicturePurpose } from "./shared";

// Server Actions prepare pictures before calling a media command: every file is identified
// by its bytes, decoded, auto-rotated, resized and re-encoded as JPEG with all metadata
// removed (prepareUpload). This runs outside any transaction because sharp is slow; the
// commands then store the prepared bytes inside theirs.

export type PreparedPictures = { ok: true; uploads: MediaUpload[] } | { ok: false; errors: string[] };

/**
 * Reads the "photos" field of `formData` and prepares each file for `purpose`. At most
 * `maxFiles` files (default: the purpose's per-submission limit) are accepted; every refused
 * file gets its own message naming it. On the hosted site the files must also fit the
 * request budget together.
 */
export async function preparePictures(
  formData: FormData,
  purpose: PicturePurpose,
  options: { maxFiles?: number; field?: string } = {},
): Promise<PreparedPictures> {
  const files = filesFromFormData(formData, options.field ?? PHOTO_FIELD);
  const maxFiles = Math.min(options.maxFiles ?? UPLOAD_LIMITS[purpose].maxFiles, UPLOAD_LIMITS[purpose].maxFiles);
  if (files.length === 0) return { ok: false, errors: ["Choose at least one picture to upload."] };
  if (maxFiles <= 0) return { ok: false, errors: ["No more pictures can be added here."] };
  if (files.length > maxFiles) {
    return {
      ok: false,
      errors: [maxFiles === 1 ? "Choose one picture." : `Choose up to ${maxFiles} pictures at a time (you chose ${files.length}).`],
    };
  }
  const overBudget = uploadBudgetProblem(formData);
  if (overBudget) return { ok: false, errors: [overBudget] };

  const uploads: MediaUpload[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      uploads.push({ prepared: await prepareUpload(await uploadInputFromFile(file), purpose), originalName: file.name });
    } catch (error) {
      if (!isDomainError(error)) throw error;
      errors.push(error.userMessage);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, uploads };
}
