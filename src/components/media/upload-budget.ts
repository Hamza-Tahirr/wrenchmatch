// Size rules for uploads on the hosted site (UploadBudget in media-types.ts), shared by the
// upload components. Nothing here touches the page when imported, so tests can run it.

import { formatBytes } from "@/lib/format";

import type { UploadBudget } from "./media-types";

const SHRINKABLE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
const SHRINKABLE_EXTENSION = /\.(jpe?g|png|webp)$/i;

/** Pictures the browser can re-encode smaller: JPEG, PNG and WebP (by type, or by name when the browser gives none). */
export function isShrinkablePicture(file: { type: string; name: string }): boolean {
  return SHRINKABLE_TYPES.includes(file.type) || (file.type === "" && SHRINKABLE_EXTENSION.test(file.name));
}

/** `width` x `height` scaled down (never up) so that the long edge is at most `maxEdge`. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * How big each of `count` pictures sent together should be at most: the budget's picture
 * target, or an equal share of the request budget when that is smaller.
 */
export function pictureTargetBytes(budget: UploadBudget, count: number): number {
  return Math.min(budget.imageTargetBytes, Math.floor(budget.maxRequestBytes / Math.max(1, count)));
}

/** Total size of `files` in bytes. */
export function totalBytes(files: Iterable<{ size: number }>): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}

/** The name a re-encoded picture is sent under: "IMG_2041.PNG" becomes "IMG_2041.jpg". */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * The message for files of `total` bytes that one request cannot carry, or null when they
 * fit. `advice` says what to do instead, e.g. "Remove a photo or choose a shorter video."
 */
export function overBudgetMessage(total: number, budget: UploadBudget, advice: string): string | null {
  if (total <= budget.maxRequestBytes) return null;
  return `These files add up to ${formatBytes(total)}, more than the ${formatBytes(budget.maxRequestBytes)} one upload can carry on this site. ${advice}`;
}

/**
 * Sent (bubbling) by a file input whose files were replaced in code, e.g. by shrunk copies,
 * or that started or finished shrinking them: browsers fire no "change" event then.
 * UploadBudgetGuard listens for both.
 */
export const FILES_REPLACED_EVENT = "wm:files-replaced";

/** Puts `files` into `input`, which is what its form sends, and announces the change. */
export function replaceInputFiles(input: HTMLInputElement, files: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event(FILES_REPLACED_EVENT, { bubbles: true }));
}

/** Present on a file input while its pictures are being shrunk. */
const SHRINKING_ATTRIBUTE = "data-shrinking";

/**
 * Marks `input` as busy shrinking its pictures, or done, and announces the change (like a
 * replacement): UploadBudgetGuard waits with its message while pictures are being shrunk,
 * and a submit it held goes ahead once they are done.
 */
export function markShrinking(input: HTMLInputElement, busy: boolean): void {
  if (busy === input.hasAttribute(SHRINKING_ATTRIBUTE)) return;
  input.toggleAttribute(SHRINKING_ATTRIBUTE, busy);
  input.dispatchEvent(new Event(FILES_REPLACED_EVENT, { bubbles: true }));
}

/** Whether a file input of `form` is still shrinking its pictures. */
export function formIsShrinking(form: HTMLFormElement): boolean {
  return form.querySelector(`input[type="file"][${SHRINKING_ATTRIBUTE}]`) !== null;
}

/** Total size of the files chosen in every file input of `form`. */
export function formFilesBytes(form: HTMLFormElement): number {
  let total = 0;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    total += totalBytes(input.files ?? []);
  }
  return total;
}
