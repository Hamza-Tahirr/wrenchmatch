import "server-only";

import {
  BOOKING_PHASE_LABELS,
  BOOKING_PHOTO_PHASES,
  type BookingPhotoPhase,
  type BookingPhotoView,
} from "@/components/media/media-types";
import { sql } from "kysely";

import { recordAudit } from "@/server/audit";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { BOOKED_MEDIA_STATUSES } from "@/server/storage/file-access";
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

// Before/after photos on a booking (booking_photos + files.purpose 'booking_photo'). The
// booking's customer and mechanic add them once the booking is confirmed (confirmed, in
// progress, completed or disputed; a trigger enforces this too) and may remove their own.
// Visible to the booking's customer, to its mechanic while the booking is confirmed or later,
// and to admins; the other party is notified when photos are added.

export type BookingPhotosOverview = {
  bookingId: string;
  viewerRole: "customer" | "mechanic" | "admin";
  photos: BookingPhotoView[];
  /** The viewer (customer or mechanic of the booking) may add photos now. */
  canAdd: boolean;
  /** Why photos can't be added (null when they can, or for admins). */
  closedReason: string | null;
  remaining: number;
  perUpload: number;
  limit: number;
};

type BookingParties = { id: string; customerId: string; mechanicId: string; status: string; mechanicName: string };

const OPEN_STATUSES: readonly string[] = BOOKED_MEDIA_STATUSES;
const CLOSED_MESSAGE = "Photos can be added once the booking is confirmed.";
const CANCELLED_MESSAGE = "This booking was cancelled, so no more photos can be added.";

function closedReasonFor(status: string): string | null {
  if (OPEN_STATUSES.includes(status)) return null;
  return status === "cancelled" ? CANCELLED_MESSAGE : CLOSED_MESSAGE;
}

/** "a before photo", "an after photo", "a photo", "3 after photos". */
export function describePhotos(phase: BookingPhotoPhase, count: number): string {
  const noun = count === 1 ? "photo" : "photos";
  const label = phase === "other" ? noun : `${phase} ${noun}`;
  if (count !== 1) return `${count} ${label}`;
  return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
}

export function isBookingPhotoPhase(value: unknown): value is BookingPhotoPhase {
  return typeof value === "string" && (BOOKING_PHOTO_PHASES as readonly string[]).includes(value);
}

async function loadParties(db: AppContext["db"] | Tx, bookingId: string): Promise<BookingParties | undefined> {
  const row = await db
    .selectFrom("bookings as b")
    .innerJoin("mechanic_profiles as p", "p.user_id", "b.mechanic_id")
    .select([
      "b.id",
      "b.customer_id",
      "b.mechanic_id",
      "b.status",
      "p.display_name as mechanicName",
    ])
    .where("b.id", "=", bookingId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    customerId: row.customer_id,
    mechanicId: row.mechanic_id,
    status: row.status,
    mechanicName: row.mechanicName,
  };
}

/** The viewer's side of the booking, or null when they are not one of its parties. */
function sideOf(viewer: Viewer, booking: BookingParties): "customer" | "mechanic" | null {
  if (viewer.role === "customer" && booking.customerId === viewer.id) return "customer";
  if (viewer.role === "mechanic" && booking.mechanicId === viewer.id) return "mechanic";
  return null;
}

async function countPhotos(db: AppContext["db"] | Tx, bookingId: string): Promise<number> {
  const row = await db
    .selectFrom("booking_photos")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("booking_id", "=", bookingId)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/**
 * The booking's photos as the viewer may see them, plus whether they can add more. Throws
 * not_found for anyone but the booking's customer, its mechanic and admins.
 */
export async function getBookingPhotos(ctx: AppContext, viewer: Viewer, bookingId: string): Promise<BookingPhotosOverview> {
  const booking = await loadParties(ctx.db, bookingId);
  const side = booking ? sideOf(viewer, booking) : null;
  if (!booking || (side === null && viewer.role !== "admin")) throw notFound("That booking");

  const rows = await ctx.db
    .selectFrom("booking_photos as bp")
    .innerJoin("files as f", "f.id", "bp.file_id")
    .select(["bp.id", "bp.file_id", "bp.uploaded_by", "bp.phase", "bp.caption", "bp.created_at", "f.width", "f.height"])
    .where("bp.booking_id", "=", booking.id)
    .orderBy("bp.created_at")
    // upload order within one batch (same created_at)
    .orderBy(sql`bp.rowid`)
    .execute();

  // The mechanic sees the customer's photos only while the booking is confirmed or later
  // (the same rule as /api/files); their own photos always.
  const open = OPEN_STATUSES.includes(booking.status);
  const visible = rows.filter((row) => side !== "mechanic" || open || row.uploaded_by === viewer.id);
  const counters: Record<BookingPhotoPhase, number> = { before: 0, after: 0, other: 0 };
  const photos = visible.map((row): BookingPhotoView => {
    const phase: BookingPhotoPhase = isBookingPhotoPhase(row.phase) ? row.phase : "other";
    counters[phase] += 1;
    const byMechanic = row.uploaded_by === booking.mechanicId;
    const who = byMechanic ? booking.mechanicName : "the customer";
    return {
      id: row.id,
      fileId: row.file_id,
      src: fileUrl(row.file_id),
      width: row.width,
      height: row.height,
      caption: row.caption,
      alt: row.caption ?? `${BOOKING_PHASE_LABELS[phase]} photo ${counters[phase]}, added by ${who}`,
      phase,
      uploadedByRole: byMechanic ? "mechanic" : "customer",
      mine: row.uploaded_by === viewer.id,
      createdAt: row.created_at,
    };
  });

  const limit = MEDIA_LIMITS.bookingPhotosTotal;
  const remaining = side !== null && open ? Math.max(0, limit - rows.length) : 0;
  const closedReason =
    side === null ? null : (closedReasonFor(booking.status) ?? (remaining === 0 ? `This booking already has ${limit} photos, the most it can hold.` : null));
  return {
    bookingId: booking.id,
    viewerRole: side ?? "admin",
    photos,
    canAdd: side !== null && remaining > 0,
    closedReason,
    remaining,
    perUpload: Math.min(remaining, UPLOAD_LIMITS.booking_photo.maxFiles),
    limit,
  };
}

/**
 * Adds photos to a confirmed (or in-progress, completed, disputed) booking for its customer
 * or mechanic, and notifies the other party.
 */
export async function addBookingPhotos(
  ctx: AppContext,
  viewer: Viewer,
  input: { bookingId: string; phase: BookingPhotoPhase; caption?: string | null; uploads: readonly MediaUpload[] },
): Promise<{ added: number; total: number }> {
  if (viewer.role !== "customer" && viewer.role !== "mechanic") throw notFound("That booking");
  if (!isBookingPhotoPhase(input.phase)) throw new DomainError("invalid_input", "Choose before, after or other for these photos.");
  if (input.uploads.length === 0) throw new DomainError("invalid_input", "Choose at least one photo to add.");
  assertPreparedPictures(input.uploads, "booking_photo");
  const caption = normalizeCaption(input.caption ?? null);

  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      const booking = await loadParties(trx, input.bookingId);
      const side = booking ? sideOf(viewer, booking) : null;
      if (!booking || side === null) throw notFound("That booking");
      const closed = closedReasonFor(booking.status);
      if (closed) throw new DomainError("conflict", closed);

      const existing = await countPhotos(trx, booking.id);
      const limit = MEDIA_LIMITS.bookingPhotosTotal;
      if (existing + input.uploads.length > limit) {
        const left = Math.max(0, limit - existing);
        throw new DomainError(
          "invalid_input",
          left === 0
            ? `This booking already has ${limit} photos, the most it can hold.`
            : `A booking can have up to ${limit} photos. You can add ${photoCount(left)} more.`,
          { reason: "too_many_files" },
        );
      }
      await consumePictureAllowance(trx, ctx.now, viewer.id, input.uploads.length);

      const nowIso = ctx.now.toISOString();
      const files = await storePictures(trx, ctx, viewer.id, input.uploads, "booking_photo", saved);
      const ids: string[] = [];
      for (const file of files) {
        const id = newId();
        ids.push(id);
        await trx
          .insertInto("booking_photos")
          .values({
            id,
            booking_id: booking.id,
            file_id: file.id,
            uploaded_by: viewer.id,
            phase: input.phase,
            caption,
            created_at: nowIso,
          })
          .execute();
      }

      const count = describePhotos(input.phase, files.length);
      const see = files.length === 1 ? "it" : "them";
      if (side === "mechanic") {
        await notify(trx, {
          userId: booking.customerId,
          type: "booking.photos_added",
          title: `${booking.mechanicName} added ${count}`,
          body: `${booking.mechanicName} added ${count} to your booking. Open the booking to see ${see}.`,
          linkPath: `/bookings/${booking.id}`,
          at: ctx.now,
        });
      } else {
        await notify(trx, {
          userId: booking.mechanicId,
          type: "booking.photos_added",
          title: `The customer added ${count}`,
          body: `The customer added ${count} to the booking. Open the booking to see ${see}.`,
          linkPath: `/mechanic/bookings/${booking.id}`,
          at: ctx.now,
        });
      }
      await recordAudit(trx, {
        actor: viewer,
        action: "booking.photos_add",
        entityType: "booking",
        entityId: booking.id,
        metadata: { photoIds: ids, phase: input.phase, count: ids.length },
        at: ctx.now,
      });
      return { added: ids.length, total: existing + ids.length };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}

/** Removes a photo the viewer added to a booking (row, file and stored bytes). */
export async function removeBookingPhoto(ctx: AppContext, viewer: Viewer, input: { photoId: string }): Promise<{ bookingId: string }> {
  if (viewer.role !== "customer" && viewer.role !== "mechanic") throw notFound("That photo");
  const outcome = await writeTx(ctx.db, async (trx) => {
    const photo = await trx
      .selectFrom("booking_photos as bp")
      .innerJoin("files as f", "f.id", "bp.file_id")
      .select(["bp.id", "bp.booking_id", "bp.file_id", "bp.uploaded_by", "f.storage_key", "f.owner_user_id"])
      .where("bp.id", "=", input.photoId)
      .executeTakeFirst();
    // Only the person who added a photo may remove it; anyone else is told it isn't there.
    if (!photo || photo.uploaded_by !== viewer.id || photo.owner_user_id !== viewer.id) throw notFound("That photo");
    // Deleting the file removes the booking_photos row with it (ON DELETE CASCADE).
    await trx.deleteFrom("files").where("id", "=", photo.file_id).execute();
    await recordAudit(trx, {
      actor: viewer,
      action: "booking.photo_remove",
      entityType: "booking",
      entityId: photo.booking_id,
      metadata: { photoId: photo.id, fileId: photo.file_id },
      at: ctx.now,
    });
    return { bookingId: photo.booking_id, storageKey: photo.storage_key };
  });
  await discardStoredFiles(ctx, [{ storageKey: outcome.storageKey }]);
  return { bookingId: outcome.bookingId };
}
