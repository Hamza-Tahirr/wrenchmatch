// File cleanup for `npm run db:reset` (scripts/db-reset.ts). Only the folders the app stores
// uploads in are deleted, never UPLOAD_DIR as a whole, so a mistaken UPLOAD_DIR (say "src" or
// "public") cannot take unrelated files with it.
import fs from "node:fs";
import path from "node:path";

/** Windows refuses to delete a file another process has open (EBUSY or EPERM). */
export function isLockedError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EPERM";
}

/** Deletes a file; returns false (instead of throwing) when another process has it open. */
export function removeFileIfUnlocked(target: string): boolean {
  try {
    fs.rmSync(target, { force: true, maxRetries: 3 });
    return true;
  } catch (error) {
    if (isLockedError(error)) return false;
    throw error;
  }
}

/**
 * Deletes each of `folders` (direct children of `uploadDir`, e.g. "request-photos"), or as
 * much of it as possible when some files are open in another process. Everything else in
 * `uploadDir` is left alone. Returns the files that could not be deleted.
 */
export function removeUploadFolders(uploadDir: string, folders: readonly string[]): string[] {
  const root = path.resolve(uploadDir);
  const leftovers: string[] = [];
  for (const folder of folders) {
    const dir = path.resolve(root, folder);
    if (path.dirname(dir) !== root) throw new Error(`Upload folder "${folder}" must be a direct child of ${root}.`);
    try {
      fs.rmSync(dir, { force: true, recursive: true, maxRetries: 3 });
    } catch (error) {
      if (!isLockedError(error)) throw error;
      for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const file = path.join(entry.parentPath, entry.name);
        if (!removeFileIfUnlocked(file)) leftovers.push(file);
      }
    }
  }
  return leftovers;
}
