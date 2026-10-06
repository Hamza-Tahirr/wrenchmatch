import "server-only";

import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";

// The single policy for private files (ARCHITECTURE section 8). Every file is readable by
// its owner and by admins; beyond that:
//
//   request photo (shared before booking)   the request's customer; a mechanic matched to
//                                           the request while that mechanic is approved; a
//                                           mechanic on a confirmed/in-progress/completed/
//                                           disputed booking for the request
//   request video, unshared photos          the request's customer; the booked mechanic
//                                           (confirmed/in-progress/completed/disputed) only
//   mechanic profile photo (current one)    customers the mechanic quoted for or is booked with
//   mechanic gallery photo (in the gallery) the same customers as the profile photo
//   mechanic document                       owner and admins only
//   profile picture (user_avatar, current)  a mechanic on a confirmed/in-progress/completed/
//                                           disputed booking with that customer (never before)
//   booking photo                           the booking's customer; its mechanic while the
//                                           booking is confirmed/in-progress/completed/disputed
//
// Anything else, including signed-out visitors, is refused. Callers answer refusals with
// "not found" so file ids cannot be probed. docs/MEDIA.md describes the picture purposes.

export type FilePurpose =
  | "request_photo"
  | "request_video"
  | "mechanic_profile_photo"
  | "mechanic_document"
  | "user_avatar"
  | "mechanic_gallery"
  | "booking_photo";

export type ViewableFile = {
  id: string;
  purpose: FilePurpose;
  mimeType: string;
  sizeBytes: number;
  /** Internal storage key for ctx.storage.read(); never sent to the browser. */
  storageKey: string;
};

type FileRow = {
  id: string;
  owner_user_id: string;
  purpose: FilePurpose;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
};

const FILE_PURPOSES: readonly string[] = [
  "request_photo",
  "request_video",
  "mechanic_profile_photo",
  "mechanic_document",
  "user_avatar",
  "mechanic_gallery",
  "booking_photo",
] satisfies readonly FilePurpose[];

function isFilePurpose(value: string): value is FilePurpose {
  return FILE_PURPOSES.includes(value);
}

/**
 * Booking states in which the booked mechanic may see the request's media (and the customer's
 * profile picture and booking photos). A booking only becomes disputed after it was confirmed,
 * so the booked mechanic keeps the same access (as with the contact reveal) while an admin
 * reviews the dispute.
 */
export const BOOKED_MEDIA_STATUSES = ["confirmed", "in_progress", "completed", "disputed"] as const;

const FILE_ID_PATTERN = /^[0-9A-Za-z-]{1,64}$/;

async function loadFile(ctx: AppContext, fileId: string): Promise<FileRow | undefined> {
  if (typeof fileId !== "string" || !FILE_ID_PATTERN.test(fileId)) return undefined;
  const row = await ctx.db
    .selectFrom("files")
    .select(["id", "owner_user_id", "purpose", "mime_type", "size_bytes", "storage_key"])
    .where("id", "=", fileId)
    .executeTakeFirst();
  const purpose = row?.purpose;
  if (!row || !purpose || !isFilePurpose(purpose)) return undefined;
  return { ...row, purpose };
}

async function canViewRequestMedia(ctx: AppContext, viewer: Viewer, file: FileRow): Promise<boolean> {
  const media = await ctx.db
    .selectFrom("request_media")
    .innerJoin("repair_requests", "repair_requests.id", "request_media.request_id")
    .select([
      "request_media.request_id as requestId",
      "request_media.kind as kind",
      "request_media.shareable_before_booking as shareable",
      "repair_requests.customer_id as customerId",
    ])
    .where("request_media.file_id", "=", file.id)
    .executeTakeFirst();
  if (!media) return false;

  if (viewer.role === "customer") return media.customerId === viewer.id;
  if (viewer.role !== "mechanic") return false;

  const booked = await ctx.db
    .selectFrom("bookings")
    .select("id")
    .where("request_id", "=", media.requestId)
    .where("mechanic_id", "=", viewer.id)
    .where("status", "in", BOOKED_MEDIA_STATUSES)
    .executeTakeFirst();
  if (booked) return true;

  // Before a confirmed booking: sanitized, shareable photos only, and only while approved.
  const shareablePhoto = file.purpose === "request_photo" && media.kind === "photo" && media.shareable === 1;
  if (!shareablePhoto) return false;
  const matched = await ctx.db
    .selectFrom("job_matches")
    .innerJoin("mechanic_profiles", "mechanic_profiles.user_id", "job_matches.mechanic_id")
    .select("job_matches.id")
    .where("job_matches.request_id", "=", media.requestId)
    .where("job_matches.mechanic_id", "=", viewer.id)
    .where("mechanic_profiles.status", "=", "approved")
    .executeTakeFirst();
  return matched !== undefined;
}

/**
 * Whether the mechanic has quoted on one of the customer's requests or has a booking with
 * them: who may see the mechanic's profile photo and work gallery (ARCHITECTURE section 8).
 */
export async function customerKnowsMechanic(ctx: AppContext, customerId: string, mechanicId: string): Promise<boolean> {
  const quoted = await ctx.db
    .selectFrom("quotes")
    .innerJoin("repair_requests", "repair_requests.id", "quotes.request_id")
    .select("quotes.id")
    .where("quotes.mechanic_id", "=", mechanicId)
    .where("repair_requests.customer_id", "=", customerId)
    .executeTakeFirst();
  if (quoted) return true;

  const booked = await ctx.db
    .selectFrom("bookings")
    .select("id")
    .where("mechanic_id", "=", mechanicId)
    .where("customer_id", "=", customerId)
    .executeTakeFirst();
  return booked !== undefined;
}

/**
 * Whether the mechanic has a confirmed (or in-progress, completed, disputed) booking with the
 * customer: who may see the customer's profile picture. Pending-payment and cancelled
 * bookings grant nothing.
 */
export async function mechanicIsBookedWithCustomer(ctx: AppContext, mechanicId: string, customerId: string): Promise<boolean> {
  const booked = await ctx.db
    .selectFrom("bookings")
    .select("id")
    .where("mechanic_id", "=", mechanicId)
    .where("customer_id", "=", customerId)
    .where("status", "in", BOOKED_MEDIA_STATUSES)
    .executeTakeFirst();
  return booked !== undefined;
}

async function canCustomerViewProfilePhoto(ctx: AppContext, customerId: string, file: FileRow): Promise<boolean> {
  const mechanicId = file.owner_user_id;
  // Only the mechanic's current profile photo, not ones they have replaced.
  const current = await ctx.db
    .selectFrom("mechanic_profiles")
    .select("user_id")
    .where("user_id", "=", mechanicId)
    .where("profile_photo_file_id", "=", file.id)
    .executeTakeFirst();
  return current !== undefined && customerKnowsMechanic(ctx, customerId, mechanicId);
}

async function canCustomerViewGalleryPhoto(ctx: AppContext, customerId: string, file: FileRow): Promise<boolean> {
  // Only photos still in the owner's gallery (removed ones are deleted anyway).
  const entry = await ctx.db
    .selectFrom("mechanic_gallery")
    .select("mechanic_id")
    .where("file_id", "=", file.id)
    .where("mechanic_id", "=", file.owner_user_id)
    .executeTakeFirst();
  return entry !== undefined && customerKnowsMechanic(ctx, customerId, entry.mechanic_id);
}

async function canMechanicViewAvatar(ctx: AppContext, mechanicId: string, file: FileRow): Promise<boolean> {
  // Only the account's current picture, and only for a mechanic booked with that customer.
  const owner = await ctx.db
    .selectFrom("users")
    .select(["id", "role"])
    .where("id", "=", file.owner_user_id)
    .where("avatar_file_id", "=", file.id)
    .executeTakeFirst();
  return owner?.role === "customer" && mechanicIsBookedWithCustomer(ctx, mechanicId, owner.id);
}

async function canViewBookingPhoto(ctx: AppContext, viewer: Viewer, file: FileRow): Promise<boolean> {
  const photo = await ctx.db
    .selectFrom("booking_photos")
    .innerJoin("bookings", "bookings.id", "booking_photos.booking_id")
    .select(["bookings.customer_id as customerId", "bookings.mechanic_id as mechanicId", "bookings.status as status"])
    .where("booking_photos.file_id", "=", file.id)
    .executeTakeFirst();
  if (!photo) return false;
  if (viewer.role === "customer") return photo.customerId === viewer.id;
  if (viewer.role !== "mechanic" || photo.mechanicId !== viewer.id) return false;
  return (BOOKED_MEDIA_STATUSES as readonly string[]).includes(photo.status);
}

async function isAllowed(ctx: AppContext, viewer: Viewer, file: FileRow): Promise<boolean> {
  if (file.owner_user_id === viewer.id || viewer.role === "admin") return true;
  switch (file.purpose) {
    case "request_photo":
    case "request_video":
      return canViewRequestMedia(ctx, viewer, file);
    case "mechanic_profile_photo":
      return viewer.role === "customer" && canCustomerViewProfilePhoto(ctx, viewer.id, file);
    case "mechanic_gallery":
      return viewer.role === "customer" && canCustomerViewGalleryPhoto(ctx, viewer.id, file);
    case "user_avatar":
      return viewer.role === "mechanic" && canMechanicViewAvatar(ctx, viewer.id, file);
    case "booking_photo":
      return canViewBookingPhoto(ctx, viewer, file);
    case "mechanic_document":
      // Owner and admins only (handled above).
      return false;
  }
}

/** Whether `viewer` may see the file. False for signed-out visitors and unknown ids. */
export async function canViewFile(ctx: AppContext, viewer: Viewer | null, fileId: string): Promise<boolean> {
  if (!viewer) return false;
  const file = await loadFile(ctx, fileId);
  return file !== undefined && (await isAllowed(ctx, viewer, file));
}

async function recordDocumentView(ctx: AppContext, viewer: Viewer, file: FileRow): Promise<void> {
  const document = await ctx.db
    .selectFrom("mechanic_documents")
    .select(["id", "mechanic_id", "kind"])
    .where("file_id", "=", file.id)
    .executeTakeFirst();
  await writeTx(ctx.db, (trx) =>
    recordAudit(trx, {
      actor: viewer,
      action: "mechanic_document.view",
      entityType: "mechanic_document",
      entityId: document?.id ?? file.id,
      metadata: { fileId: file.id, mechanicId: document?.mechanic_id ?? file.owner_user_id, kind: document?.kind ?? null },
      at: ctx.now,
    }),
  );
}

/**
 * The file's metadata when `viewer` may see it, otherwise null (missing, not allowed or
 * signed out: the caller cannot tell these apart). Each admin view of a mechanic document
 * is recorded in the audit log.
 */
export async function getViewableFile(
  ctx: AppContext,
  viewer: Viewer | null,
  fileId: string,
): Promise<ViewableFile | null> {
  if (!viewer) return null;
  const file = await loadFile(ctx, fileId);
  if (!file || !(await isAllowed(ctx, viewer, file))) return null;

  if (viewer.role === "admin" && file.purpose === "mechanic_document" && file.owner_user_id !== viewer.id) {
    await recordDocumentView(ctx, viewer, file);
  }
  return {
    id: file.id,
    purpose: file.purpose,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    storageKey: file.storage_key,
  };
}
