import "server-only";

import { sql } from "kysely";

import type { MediaPhoto } from "@/components/media/media-types";
import { recordAudit } from "@/server/audit";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { notify } from "@/server/notifications/notify";
import { canViewFile } from "@/server/storage/file-access";
import { discardStoredFiles, type SavedFile } from "@/server/storage/uploads";

import {
  assertPreparedPictures,
  consumePictureAllowance,
  fileUrl,
  notFound,
  photoCount,
  storePictures,
  type MediaUpload,
} from "./shared";

// Photos a customer adds to their own repair request after sending it. They are stored and
// shared exactly like the photos sent with the request: sanitized request_photo files in
// request_media, shareable_before_booking = 1, so the request's matched (approved) mechanics
// see them on the job page. Allowed while the request is open or quoted, up to
// MEDIA_LIMITS.requestPhotosTotal photos in all.

const OPEN_FOR_PHOTOS = ["open", "quoted"] as const;

export type RequestPhotoAllowance = {
  requestId: string;
  photoCount: number;
  limit: number;
  /** The request is open or quoted (photos can be added while it has room). */
  acceptsPhotos: boolean;
  /** Photos that can still be added (0 when the request is closed or full). */
  remaining: number;
  /** Photos accepted in one submission (the per-upload cap and `remaining`, whichever is lower). */
  perUpload: number;
  /** Why no photos can be added, when `remaining` is 0. */
  closedReason: string | null;
};

const CLOSED_MESSAGE = "Photos can be added while the request is open for quotes.";

async function countPhotos(db: AppContext["db"] | Tx, requestId: string): Promise<number> {
  const row = await db
    .selectFrom("request_media")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("request_id", "=", requestId)
    .where("kind", "=", "photo")
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/**
 * How many photos the customer can still add to their request. Throws not_found for anyone
 * but the request's customer.
 */
export async function getRequestPhotoAllowance(
  ctx: AppContext,
  viewer: Viewer,
  requestId: string,
): Promise<RequestPhotoAllowance> {
  if (viewer.role !== "customer") throw notFound("That request");
  const request = await ctx.db
    .selectFrom("repair_requests")
    .select(["id", "status", "expires_at"])
    .where("id", "=", requestId)
    .where("customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!request) throw notFound("That request");

  const count = await countPhotos(ctx.db, request.id);
  const limit = MEDIA_LIMITS.requestPhotosTotal;
  const open =
    (OPEN_FOR_PHOTOS as readonly string[]).includes(request.status) &&
    (request.expires_at === null || request.expires_at > ctx.now.toISOString());
  const remaining = open ? Math.max(0, limit - count) : 0;
  return {
    requestId: request.id,
    photoCount: count,
    limit,
    acceptsPhotos: open,
    remaining,
    perUpload: Math.min(remaining, UPLOAD_LIMITS.request_photo.maxFiles),
    closedReason: open ? (remaining === 0 ? `This request already has ${limit} photos, the most it can hold.` : null) : CLOSED_MESSAGE,
  };
}

/**
 * The request's photos that the viewer may see, in upload order: everything for the
 * customer, booked mechanic and admins; shared photos for a matched, approved mechanic
 * (canViewFile decides each one). Empty for anyone else.
 */
export async function listRequestPhotos(ctx: AppContext, viewer: Viewer, requestId: string): Promise<MediaPhoto[]> {
  const rows = await ctx.db
    .selectFrom("request_media as m")
    .innerJoin("files as f", "f.id", "m.file_id")
    .select(["m.file_id", "f.width", "f.height"])
    .where("m.request_id", "=", requestId)
    .where("m.kind", "=", "photo")
    .orderBy("m.created_at")
    // upload order within one batch, as on the request page
    .orderBy(sql`m.rowid`)
    .execute();
  const photos: MediaPhoto[] = [];
  for (const row of rows) {
    if (!(await canViewFile(ctx, viewer, row.file_id))) continue;
    photos.push({
      id: row.file_id,
      fileId: row.file_id,
      src: fileUrl(row.file_id),
      width: row.width,
      height: row.height,
      caption: null,
      alt: `Photo ${photos.length + 1} of the problem`,
    });
  }
  return photos;
}

type RequestFacts = { categoryName: string; vehicle: string };

async function loadFacts(trx: Tx, requestId: string): Promise<RequestFacts> {
  const row = await trx
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select(["c.name as categoryName", "r.vehicle_year", "r.vehicle_make", "r.vehicle_model"])
    .where("r.id", "=", requestId)
    .executeTakeFirstOrThrow();
  return { categoryName: row.categoryName, vehicle: `${row.vehicle_year} ${row.vehicle_make} ${row.vehicle_model}` };
}

/** Matched mechanics who are still approved and have not passed on the job. */
async function interestedMechanicIds(trx: Tx, requestId: string): Promise<string[]> {
  const rows = await trx
    .selectFrom("job_matches as j")
    .innerJoin("mechanic_profiles as p", "p.user_id", "j.mechanic_id")
    .select("j.mechanic_id")
    .where("j.request_id", "=", requestId)
    .where("j.status", "!=", "passed")
    .where("p.status", "=", "approved")
    .orderBy("j.rank")
    .execute();
  return rows.map((row) => row.mechanic_id);
}

/**
 * Adds photos to the viewer's own open or quoted request. They are shared with the request's
 * matched mechanics like the original photos, and those mechanics are notified.
 */
export async function addRequestPhotos(
  ctx: AppContext,
  viewer: Viewer,
  input: { requestId: string; uploads: readonly MediaUpload[] },
): Promise<{ added: number; photoCount: number }> {
  if (viewer.role !== "customer") throw notFound("That request");
  if (input.uploads.length === 0) throw new DomainError("invalid_input", "Choose at least one photo to add.");
  assertPreparedPictures(input.uploads, "request_photo");

  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      await expireStaleRecords(trx, ctx.now);
      const request = await trx
        .selectFrom("repair_requests")
        .select(["id", "status"])
        .where("id", "=", input.requestId)
        .where("customer_id", "=", viewer.id)
        .executeTakeFirst();
      if (!request) throw notFound("That request");
      if (!(OPEN_FOR_PHOTOS as readonly string[]).includes(request.status)) {
        throw new DomainError("conflict", CLOSED_MESSAGE);
      }

      const existing = await countPhotos(trx, request.id);
      const limit = MEDIA_LIMITS.requestPhotosTotal;
      if (existing + input.uploads.length > limit) {
        const left = Math.max(0, limit - existing);
        throw new DomainError(
          "invalid_input",
          left === 0
            ? `This request already has ${limit} photos, the most it can hold.`
            : `A request can have up to ${limit} photos. You can add ${photoCount(left)} more.`,
          { reason: "too_many_files" },
        );
      }
      await consumePictureAllowance(trx, ctx.now, viewer.id, input.uploads.length);

      const nowIso = ctx.now.toISOString();
      const files = await storePictures(trx, ctx, viewer.id, input.uploads, "request_photo", saved);
      for (const file of files) {
        await trx
          .insertInto("request_media")
          .values({
            file_id: file.id,
            request_id: request.id,
            kind: "photo",
            // Sanitized photos are shared with matched mechanics, like the ones sent with the request.
            shareable_before_booking: 1,
            created_at: nowIso,
          })
          .execute();
      }
      await trx
        .updateTable("repair_requests")
        .set({ updated_at: nowIso })
        .where("id", "=", request.id)
        .execute();

      const facts = await loadFacts(trx, request.id);
      for (const mechanicId of await interestedMechanicIds(trx, request.id)) {
        await notify(trx, {
          userId: mechanicId,
          type: "request.photos_added",
          title: "New photos on a job you were matched to",
          body: `The customer added ${photoCount(files.length)} to the ${facts.categoryName} request for a ${facts.vehicle}.`,
          linkPath: `/mechanic/jobs/${request.id}`,
          at: ctx.now,
        });
      }
      await recordAudit(trx, {
        actor: viewer,
        action: "request.photos_add",
        entityType: "request",
        entityId: request.id,
        metadata: { fileIds: files.map((file) => file.id), count: files.length },
        at: ctx.now,
      });
      return { added: files.length, photoCount: existing + files.length };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}
