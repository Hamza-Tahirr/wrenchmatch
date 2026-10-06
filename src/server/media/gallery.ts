import "server-only";

import { sql } from "kysely";

import type { GalleryPhotoView } from "@/components/media/media-types";
import { recordAudit } from "@/server/audit";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { customerKnowsMechanic } from "@/server/storage/file-access";
import { discardStoredFiles, type SavedFile } from "@/server/storage/uploads";

import {
  assertPreparedPictures,
  consumePictureAllowance,
  fileUrl,
  normalizeCaption,
  notFound,
  photoCount,
  storePictures,
  type MediaUpload,
} from "./shared";

// A mechanic's work gallery (mechanic_gallery + files.purpose 'mechanic_gallery'): up to
// MEDIA_LIMITS.galleryPhotosTotal photos with optional captions, in the mechanic's order.
// Visible to the mechanic, admins and the customers who may see the mechanic's profile photo
// (they received a quote from the mechanic or are booked with them).

type GalleryRow = {
  id: string;
  file_id: string;
  caption: string | null;
  sort_order: number;
  width: number | null;
  height: number | null;
};

function toView(row: GalleryRow, index: number, mechanicName: string): GalleryPhotoView {
  return {
    id: row.id,
    fileId: row.file_id,
    src: fileUrl(row.file_id),
    width: row.width,
    height: row.height,
    caption: row.caption,
    alt: row.caption ? `${row.caption} (work by ${mechanicName})` : `Work photo ${index + 1} by ${mechanicName}`,
    sortOrder: row.sort_order,
  };
}

async function loadGallery(db: AppContext["db"] | Tx, mechanicId: string): Promise<GalleryRow[]> {
  return db
    .selectFrom("mechanic_gallery as g")
    .innerJoin("files as f", "f.id", "g.file_id")
    .select(["g.id", "g.file_id", "g.caption", "g.sort_order", "f.width", "f.height"])
    .where("g.mechanic_id", "=", mechanicId)
    .orderBy("g.sort_order")
    .orderBy("g.created_at")
    .orderBy(sql`g.rowid`)
    .execute();
}

async function mechanicDisplayName(db: AppContext["db"] | Tx, mechanicId: string): Promise<string | null> {
  const row = await db
    .selectFrom("mechanic_profiles")
    .select("display_name")
    .where("user_id", "=", mechanicId)
    .executeTakeFirst();
  return row?.display_name ?? null;
}

async function requireOwnProfile(trx: Tx, viewer: Viewer): Promise<void> {
  if (viewer.role !== "mechanic") throw notFound("That gallery");
  const profile = await trx
    .selectFrom("mechanic_profiles")
    .select("user_id")
    .where("user_id", "=", viewer.id)
    .executeTakeFirst();
  if (!profile) {
    throw new DomainError("conflict", "Finish your mechanic application before adding work photos.");
  }
}

/** Rewrites sort_order as 0..n-1 in the given order. */
async function writeOrder(trx: Tx, mechanicId: string, orderedIds: readonly string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await trx
      .updateTable("mechanic_gallery")
      .set({ sort_order: index })
      .where("id", "=", id)
      .where("mechanic_id", "=", mechanicId)
      .execute();
  }
}

export type MyGalleryOverview = {
  /** False until the mechanic has applied (no profile yet). */
  hasProfile: boolean;
  photos: GalleryPhotoView[];
  limit: number;
  remaining: number;
  /** Photos accepted in one upload. */
  perUpload: number;
};

/** The viewer's gallery page data (mechanics only). */
export async function getMyGalleryOverview(ctx: AppContext, viewer: Viewer): Promise<MyGalleryOverview> {
  if (viewer.role !== "mechanic") throw notFound("That gallery");
  const name = await mechanicDisplayName(ctx.db, viewer.id);
  const limit = MEDIA_LIMITS.galleryPhotosTotal;
  if (name === null) return { hasProfile: false, photos: [], limit, remaining: 0, perUpload: 0 };
  const photos = (await loadGallery(ctx.db, viewer.id)).map((row, index) => toView(row, index, name));
  const remaining = Math.max(0, limit - photos.length);
  return { hasProfile: true, photos, limit, remaining, perUpload: Math.min(remaining, UPLOAD_LIMITS.mechanic_gallery.maxFiles) };
}

/** The viewer's own gallery (mechanics only). */
export async function listMyGallery(ctx: AppContext, viewer: Viewer): Promise<GalleryPhotoView[]> {
  if (viewer.role !== "mechanic") throw notFound("That gallery");
  const name = (await mechanicDisplayName(ctx.db, viewer.id)) ?? viewer.displayName;
  return (await loadGallery(ctx.db, viewer.id)).map((row, index) => toView(row, index, name));
}

/**
 * A mechanic's gallery as the viewer may see it: the mechanic and admins always; a customer
 * who received a quote from the mechanic or is booked with them. Anyone else gets an empty
 * list (the same as a mechanic without photos).
 */
export async function listMechanicGallery(ctx: AppContext, viewer: Viewer, mechanicId: string): Promise<GalleryPhotoView[]> {
  const allowed =
    viewer.role === "admin" ||
    (viewer.role === "mechanic" && viewer.id === mechanicId) ||
    (viewer.role === "customer" && (await customerKnowsMechanic(ctx, viewer.id, mechanicId)));
  if (!allowed) return [];
  const name = await mechanicDisplayName(ctx.db, mechanicId);
  if (name === null) return [];
  return (await loadGallery(ctx.db, mechanicId)).map((row, index) => toView(row, index, name));
}

/** Adds photos to the end of the viewer's gallery. */
export async function addGalleryPhotos(
  ctx: AppContext,
  viewer: Viewer,
  input: { uploads: readonly MediaUpload[]; caption?: string | null },
): Promise<{ added: number; total: number }> {
  if (viewer.role !== "mechanic") throw notFound("That gallery");
  if (input.uploads.length === 0) throw new DomainError("invalid_input", "Choose at least one photo to add.");
  assertPreparedPictures(input.uploads, "mechanic_gallery");
  const caption = normalizeCaption(input.caption ?? null);

  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      await requireOwnProfile(trx, viewer);
      const existing = await loadGallery(trx, viewer.id);
      const limit = MEDIA_LIMITS.galleryPhotosTotal;
      if (existing.length + input.uploads.length > limit) {
        const left = Math.max(0, limit - existing.length);
        throw new DomainError(
          "invalid_input",
          left === 0
            ? `Your gallery holds up to ${limit} photos. Remove one to add another.`
            : `Your gallery holds up to ${limit} photos. You can add ${photoCount(left)} more.`,
          { reason: "too_many_files" },
        );
      }
      await consumePictureAllowance(trx, ctx.now, viewer.id, input.uploads.length);

      const nowIso = ctx.now.toISOString();
      const files = await storePictures(trx, ctx, viewer.id, input.uploads, "mechanic_gallery", saved);
      const ids: string[] = [];
      for (const [index, file] of files.entries()) {
        const id = newId();
        ids.push(id);
        await trx
          .insertInto("mechanic_gallery")
          .values({
            id,
            mechanic_id: viewer.id,
            file_id: file.id,
            caption,
            sort_order: existing.length + index,
            created_at: nowIso,
          })
          .execute();
      }
      await recordAudit(trx, {
        actor: viewer,
        action: "mechanic.gallery_add",
        entityType: "mechanic",
        entityId: viewer.id,
        metadata: { photoIds: ids, count: ids.length },
        at: ctx.now,
      });
      return { added: ids.length, total: existing.length + ids.length };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}

/** Sets or clears the caption of one of the viewer's gallery photos. */
export async function updateGalleryCaption(
  ctx: AppContext,
  viewer: Viewer,
  input: { photoId: string; caption: string | null },
): Promise<{ caption: string | null }> {
  if (viewer.role !== "mechanic") throw notFound("That photo");
  const caption = normalizeCaption(input.caption);
  return writeTx(ctx.db, async (trx) => {
    const result = await trx
      .updateTable("mechanic_gallery")
      .set({ caption })
      .where("id", "=", input.photoId)
      .where("mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw notFound("That photo");
    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.gallery_caption",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { photoId: input.photoId, hasCaption: caption !== null },
      at: ctx.now,
    });
    return { caption };
  });
}

/**
 * Puts the viewer's gallery in the given order. `photoIds` must list every photo exactly
 * once; otherwise the gallery changed meanwhile and nothing is saved.
 */
export async function reorderGallery(ctx: AppContext, viewer: Viewer, input: { photoIds: readonly string[] }): Promise<void> {
  if (viewer.role !== "mechanic") throw notFound("That gallery");
  await writeTx(ctx.db, async (trx) => {
    const current = (await loadGallery(trx, viewer.id)).map((row) => row.id);
    const requested = new Set(input.photoIds);
    const sameSet =
      requested.size === input.photoIds.length &&
      requested.size === current.length &&
      current.every((id) => requested.has(id));
    if (!sameSet) {
      throw new DomainError("conflict", "Your gallery changed in another tab. Refresh the page and try again.");
    }
    await writeOrder(trx, viewer.id, input.photoIds);
  });
}

/** Moves one photo a place earlier or later (buttons that work without drag and drop). */
export async function moveGalleryPhoto(
  ctx: AppContext,
  viewer: Viewer,
  input: { photoId: string; direction: "earlier" | "later" },
): Promise<void> {
  if (viewer.role !== "mechanic") throw notFound("That photo");
  await writeTx(ctx.db, async (trx) => {
    const ids = (await loadGallery(trx, viewer.id)).map((row) => row.id);
    const from = ids.indexOf(input.photoId);
    if (from === -1) throw notFound("That photo");
    const to = input.direction === "earlier" ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await writeOrder(trx, viewer.id, ids);
  });
}

/** Deletes one of the viewer's gallery photos (row, file and stored bytes). */
export async function removeGalleryPhoto(ctx: AppContext, viewer: Viewer, input: { photoId: string }): Promise<void> {
  if (viewer.role !== "mechanic") throw notFound("That photo");
  const storageKey = await writeTx(ctx.db, async (trx) => {
    const photo = await trx
      .selectFrom("mechanic_gallery as g")
      .innerJoin("files as f", "f.id", "g.file_id")
      .select(["g.id", "g.file_id", "f.storage_key", "f.owner_user_id"])
      .where("g.id", "=", input.photoId)
      .where("g.mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!photo || photo.owner_user_id !== viewer.id) throw notFound("That photo");
    // Deleting the file removes the gallery row with it (ON DELETE CASCADE).
    await trx.deleteFrom("files").where("id", "=", photo.file_id).execute();
    const remaining = (await loadGallery(trx, viewer.id)).map((row) => row.id);
    await writeOrder(trx, viewer.id, remaining);
    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.gallery_remove",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { photoId: photo.id, fileId: photo.file_id },
      at: ctx.now,
    });
    return photo.storage_key;
  });
  await discardStoredFiles(ctx, [{ storageKey }]);
}
