import "server-only";

import { createHash } from "node:crypto";

import { sql } from "kysely";

import { pluralize } from "@/lib/format";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { saveFile, type PreparedUpload, type SavedFile } from "@/server/storage/uploads";

// Plumbing shared by the media commands (avatar, request photos, gallery, booking photos).

/** A picture already validated and sanitized by prepareUpload (see prepare.ts). */
export type MediaUpload = { prepared: PreparedUpload; originalName: string | null };

/** The picture purposes of docs/MEDIA.md (request photos added later reuse request_photo). */
export type PicturePurpose = "user_avatar" | "mechanic_gallery" | "booking_photo" | "request_photo";

/** The only URL a picture is ever shown at; the route re-checks access on every request. */
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}

export function notFound(what = "That record"): DomainError {
  return new DomainError("not_found", `${what} wasn't found. It may have been removed, or it isn't available to your account.`);
}

/**
 * Refuses uploads that did not come out of prepareUpload as a sanitized image for the
 * purpose (defense in depth: saveFile and the files CHECKs would refuse them too).
 */
export function assertPreparedPictures(uploads: readonly MediaUpload[], purpose: PicturePurpose): void {
  const limit = UPLOAD_LIMITS[purpose];
  for (const { prepared } of uploads) {
    const ok =
      prepared.mimeType === "image/jpeg" &&
      prepared.metadataStripped &&
      prepared.buffer.byteLength > 0 &&
      prepared.buffer.byteLength <= limit.maxBytes;
    if (!ok) throw new DomainError("invalid_input", "Pictures must be JPEG, PNG or WebP images.");
  }
}

/** Stores each upload (bytes + files row) inside `trx`; records them in `saved` for cleanup. */
export async function storePictures(
  trx: Tx,
  ctx: AppContext,
  ownerId: string,
  uploads: readonly MediaUpload[],
  purpose: PicturePurpose,
  saved: SavedFile[],
): Promise<SavedFile[]> {
  const stored: SavedFile[] = [];
  for (const upload of uploads) {
    const file = await saveFile(trx, ctx, ownerId, upload.prepared, purpose, upload.originalName);
    saved.push(file);
    stored.push(file);
  }
  return stored;
}

// Control characters and invisible / bidirectional formatting characters.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

/**
 * A caption as stored: trimmed, single-spaced, without control or invisible characters;
 * null when empty. Throws invalid_input when longer than MEDIA_LIMITS.captionMaxLength.
 */
export function normalizeCaption(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new DomainError("invalid_input", "Enter the caption as text.");
  const cleaned = raw.normalize("NFC").replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (Array.from(cleaned).length > MEDIA_LIMITS.captionMaxLength) {
    throw new DomainError(
      "invalid_input",
      `Keep the caption to ${MEDIA_LIMITS.captionMaxLength} characters or fewer.`,
      { field: "caption" },
    );
  }
  return cleaned;
}

/** "1 photo", "3 photos". */
export function photoCount(count: number): string {
  return pluralize(count, "photo");
}

// ---------------------------------------------------------------------------------
// Per-account allowance: MEDIA_LIMITS.picturesPerHour pictures in a fixed one-hour window,
// counted in the shared rate_limits table under its own bucket name. Called inside the
// command's transaction, so only pictures that are actually stored are counted.
// ---------------------------------------------------------------------------------

const WINDOW_MINUTES = 60;

function allowanceBucket(userId: string): string {
  return `media_pictures:${createHash("sha256").update(userId, "utf8").digest("hex")}`;
}

/** Counts `count` pictures for the account; throws rate_limited when over the hourly limit. */
export async function consumePictureAllowance(trx: Tx, now: Date, userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  const windowMs = WINDOW_MINUTES * 60_000;
  const nowIso = now.toISOString();
  const expiredBefore = new Date(now.getTime() - windowMs).toISOString();
  // In an UPSERT, column references on the right-hand side read the existing row.
  const row = await trx
    .insertInto("rate_limits")
    .values({ bucket_key: allowanceBucket(userId), window_started_at: nowIso, attempt_count: count })
    .onConflict((oc) =>
      oc.column("bucket_key").doUpdateSet({
        window_started_at: sql<string>`CASE WHEN rate_limits.window_started_at <= ${expiredBefore}
          THEN excluded.window_started_at ELSE rate_limits.window_started_at END`,
        attempt_count: sql<number>`CASE WHEN rate_limits.window_started_at <= ${expiredBefore}
          THEN ${count} ELSE rate_limits.attempt_count + ${count} END`,
      }),
    )
    .returning(["window_started_at", "attempt_count"])
    .executeTakeFirstOrThrow();

  if (row.attempt_count <= MEDIA_LIMITS.picturesPerHour) return;
  const resetMs = Date.parse(row.window_started_at) + windowMs;
  const minutes = Math.max(1, Math.ceil((resetMs - now.getTime()) / 60_000));
  throw new DomainError(
    "rate_limited",
    `You can add up to ${MEDIA_LIMITS.picturesPerHour} pictures an hour. Try again in ${pluralize(minutes, "minute")}.`,
    { limit: "media_pictures", retryAfterMinutes: minutes },
  );
}
