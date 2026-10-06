import "server-only";

import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { canViewFile } from "@/server/storage/file-access";
import { discardStoredFiles, type SavedFile } from "@/server/storage/uploads";

import {
  assertPreparedPictures,
  consumePictureAllowance,
  fileUrl,
  storePictures,
  type MediaUpload,
} from "./shared";

// Profile pictures (files.purpose 'user_avatar', users.avatar_file_id). Customers and admins
// set their own; mechanics are shown to customers with their profile photo instead, which
// they manage on /mechanic/profile. A replaced or removed picture is deleted (row and bytes).
// Who may see a picture: the account itself, admins, and a mechanic on a confirmed (or later)
// booking with that customer (src/server/storage/file-access.ts).

export type MyAvatar = { fileId: string; src: string };

const AVATAR_ROLES: readonly Viewer["role"][] = ["customer", "admin"];

function assertAvatarRole(viewer: Viewer): void {
  if (!AVATAR_ROLES.includes(viewer.role)) {
    throw new DomainError(
      "forbidden",
      "Mechanics show customers their profile photo instead. Change it on your profile page.",
    );
  }
}

/** The viewer's own profile picture, or null. */
export async function getMyAvatar(ctx: AppContext, viewer: Viewer): Promise<MyAvatar | null> {
  const row = await ctx.db
    .selectFrom("users")
    .select("avatar_file_id")
    .where("id", "=", viewer.id)
    .executeTakeFirst();
  const fileId = row?.avatar_file_id ?? null;
  return fileId ? { fileId, src: fileUrl(fileId) } : null;
}

/**
 * The picture for the viewer's own header avatar: a mechanic's profile photo, anyone else's
 * profile picture. Null when there is none (show initials).
 */
export async function getHeaderAvatarSrc(ctx: AppContext, viewer: Viewer): Promise<string | null> {
  if (viewer.role === "mechanic") {
    const profile = await ctx.db
      .selectFrom("mechanic_profiles")
      .select("profile_photo_file_id")
      .where("user_id", "=", viewer.id)
      .executeTakeFirst();
    if (profile?.profile_photo_file_id) return fileUrl(profile.profile_photo_file_id);
  }
  return (await getMyAvatar(ctx, viewer))?.src ?? null;
}

/**
 * Another account's profile picture when the viewer may see it (e.g. the booked mechanic
 * looking at the customer of a confirmed booking), otherwise null.
 */
export async function getVisibleAvatarSrc(ctx: AppContext, viewer: Viewer, userId: string): Promise<string | null> {
  const row = await ctx.db
    .selectFrom("users")
    .select("avatar_file_id")
    .where("id", "=", userId)
    .executeTakeFirst();
  const fileId = row?.avatar_file_id ?? null;
  if (!fileId || !(await canViewFile(ctx, viewer, fileId))) return null;
  return fileUrl(fileId);
}

/** Sets (or replaces) the viewer's profile picture. */
export async function setMyAvatar(ctx: AppContext, viewer: Viewer, upload: MediaUpload): Promise<MyAvatar> {
  assertAvatarRole(viewer);
  assertPreparedPictures([upload], "user_avatar");
  const saved: SavedFile[] = [];
  let outcome: { fileId: string; previousKey: string | null };
  try {
    outcome = await writeTx(ctx.db, async (trx) => {
      const current = await trx
        .selectFrom("users as u")
        .leftJoin("files as f", "f.id", "u.avatar_file_id")
        .select(["u.avatar_file_id", "f.storage_key", "f.owner_user_id"])
        .where("u.id", "=", viewer.id)
        .executeTakeFirst();
      if (!current) throw new DomainError("not_found", "Your account wasn't found. Log in again.");
      await consumePictureAllowance(trx, ctx.now, viewer.id, 1);

      const [file] = await storePictures(trx, ctx, viewer.id, [upload], "user_avatar", saved);
      await trx
        .updateTable("users")
        .set({ avatar_file_id: file.id, updated_at: ctx.now.toISOString() })
        .where("id", "=", viewer.id)
        .execute();
      const previousId = current.avatar_file_id;
      const removePrevious = previousId !== null && current.owner_user_id === viewer.id;
      if (removePrevious) await trx.deleteFrom("files").where("id", "=", previousId).execute();
      await recordAudit(trx, {
        actor: viewer,
        action: "account.avatar_set",
        entityType: "user",
        entityId: viewer.id,
        metadata: { fileId: file.id, previousFileId: previousId },
        at: ctx.now,
      });
      return { fileId: file.id, previousKey: removePrevious ? current.storage_key : null };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
  // The old picture's row is gone; its bytes are removed once the change is committed.
  if (outcome.previousKey) await discardStoredFiles(ctx, [{ storageKey: outcome.previousKey }]);
  return { fileId: outcome.fileId, src: fileUrl(outcome.fileId) };
}

/** Removes the viewer's profile picture (initials are shown instead). Returns false if there was none. */
export async function removeMyAvatar(ctx: AppContext, viewer: Viewer): Promise<boolean> {
  assertAvatarRole(viewer);
  const removed = await writeTx(ctx.db, async (trx) => {
    const current = await trx
      .selectFrom("users as u")
      .innerJoin("files as f", "f.id", "u.avatar_file_id")
      .select(["f.id", "f.storage_key", "f.owner_user_id"])
      .where("u.id", "=", viewer.id)
      .executeTakeFirst();
    if (!current) return null;
    await trx
      .updateTable("users")
      .set({ avatar_file_id: null, updated_at: ctx.now.toISOString() })
      .where("id", "=", viewer.id)
      .execute();
    if (current.owner_user_id === viewer.id) await trx.deleteFrom("files").where("id", "=", current.id).execute();
    await recordAudit(trx, {
      actor: viewer,
      action: "account.avatar_remove",
      entityType: "user",
      entityId: viewer.id,
      metadata: { fileId: current.id },
      at: ctx.now,
    });
    return current.owner_user_id === viewer.id ? current.storage_key : null;
  });
  if (removed) await discardStoredFiles(ctx, [{ storageKey: removed }]);
  return removed !== null;
}
