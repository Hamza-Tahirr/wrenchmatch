"use server";

import "server-only";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";

import type { MediaActionState } from "@/components/media/media-types";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";

import { removeMyAvatar, setMyAvatar } from "./avatar";
import { addBookingPhotos, isBookingPhotoPhase, removeBookingPhoto } from "./booking-photos";
import { addGalleryPhotos, moveGalleryPhoto, removeGalleryPhoto, reorderGallery, updateGalleryCaption } from "./gallery";
import { preparePictures } from "./prepare";
import { addRequestPhotos, getRequestPhotoAllowance } from "./request-photos";
import { photoCount } from "./shared";

// Server Actions for every media form (docs/MEDIA.md). They are shared by the drop-in
// components in src/components/media, which render on many pages, so each action refreshes
// the page it was called from (refresh()) instead of naming a route. Each one re-checks the
// role, reads ids with a strict schema, prepares the pictures outside any transaction
// (prepareUpload: type from the bytes, metadata removed) and calls a domain command that
// checks ownership and state again.

const RECORD_ID = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z-]+$/);

const MISSING_RECORD = "That record wasn't found. Refresh the page and try again.";

function readId(formData: FormData, name: string): string | null {
  const parsed = RECORD_ID.safeParse(formData.get(name));
  return parsed.success ? parsed.data : null;
}

function nextVersion(previous: MediaActionState | undefined): number {
  return (previous?.version ?? 0) + 1;
}

function success(previous: MediaActionState | undefined, message: string): MediaActionState {
  return { status: "success", message, errors: [], version: nextVersion(previous) };
}

function failure(previous: MediaActionState | undefined, message: string | null, errors: readonly string[] = []): MediaActionState {
  return { status: "error", message, errors, version: nextVersion(previous) };
}

/** The state for a refused domain command; anything that is not a DomainError is a bug and is rethrown. */
function refused(previous: MediaActionState | undefined, error: unknown): MediaActionState {
  if (!isDomainError(error)) throw error;
  return failure(previous, error.userMessage);
}

function readCaption(formData: FormData): string | null {
  const value = formData.get("caption");
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------------------
// Profile picture (customers and admins)
// ---------------------------------------------------------------------------------

export async function setMyAvatarAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole(["customer", "admin"]);
  const prepared = await preparePictures(formData, "user_avatar", { maxFiles: 1 });
  if (!prepared.ok) return failure(previous, "That picture couldn't be used.", prepared.errors);
  try {
    await setMyAvatar(createAppContext(), viewer, prepared.uploads[0]);
  } catch (error) {
    return refused(previous, error);
  }
  // The header shows the picture on every page.
  revalidatePath("/", "layout");
  return success(previous, "Profile picture updated.");
}

export async function removeMyAvatarAction(previous: MediaActionState): Promise<MediaActionState> {
  const viewer = await requireRole(["customer", "admin"]);
  let removed: boolean;
  try {
    removed = await removeMyAvatar(createAppContext(), viewer);
  } catch (error) {
    return refused(previous, error);
  }
  revalidatePath("/", "layout");
  return success(previous, removed ? "Profile picture removed. Your initials are shown instead." : "You have no profile picture.");
}

// ---------------------------------------------------------------------------------
// Photos added to a repair request (its customer)
// ---------------------------------------------------------------------------------

export async function addRequestPhotosAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("customer");
  const requestId = readId(formData, "requestId");
  if (!requestId) return failure(previous, MISSING_RECORD);
  const ctx = createAppContext();
  let perUpload: number;
  try {
    const allowance = await getRequestPhotoAllowance(ctx, viewer, requestId);
    if (allowance.remaining === 0) return failure(previous, allowance.closedReason);
    perUpload = allowance.perUpload;
  } catch (error) {
    return refused(previous, error);
  }
  const prepared = await preparePictures(formData, "request_photo", { maxFiles: perUpload });
  if (!prepared.ok) return failure(previous, "Some photos couldn't be added.", prepared.errors);
  let added: number;
  try {
    ({ added } = await addRequestPhotos(ctx, viewer, { requestId, uploads: prepared.uploads }));
  } catch (error) {
    return refused(previous, error);
  }
  refresh();
  return success(previous, `${photoCount(added)} added. Matched mechanics can see ${added === 1 ? "it" : "them"} now.`);
}

// ---------------------------------------------------------------------------------
// Mechanic work gallery
// ---------------------------------------------------------------------------------

function refreshGalleryPages(): void {
  revalidatePath("/mechanic/gallery");
  revalidatePath("/mechanic/profile");
  refresh();
}

export async function addGalleryPhotosAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic");
  const prepared = await preparePictures(formData, "mechanic_gallery");
  if (!prepared.ok) return failure(previous, "Some photos couldn't be added.", prepared.errors);
  let added: number;
  try {
    ({ added } = await addGalleryPhotos(createAppContext(), viewer, { uploads: prepared.uploads, caption: readCaption(formData) }));
  } catch (error) {
    return refused(previous, error);
  }
  refreshGalleryPages();
  return success(previous, `${photoCount(added)} added to your gallery.`);
}

export async function updateGalleryCaptionAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic");
  const photoId = readId(formData, "photoId");
  if (!photoId) return failure(previous, MISSING_RECORD);
  let caption: string | null;
  try {
    ({ caption } = await updateGalleryCaption(createAppContext(), viewer, { photoId, caption: readCaption(formData) }));
  } catch (error) {
    return refused(previous, error);
  }
  refreshGalleryPages();
  return success(previous, caption ? "Caption saved." : "Caption removed.");
}

/** Saves a full new order: one "photoIds" entry per photo, first to last. */
export async function reorderGalleryAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic");
  const ids = formData.getAll("photoIds").map((value) => RECORD_ID.safeParse(value));
  if (ids.length === 0 || ids.some((parsed) => !parsed.success)) return failure(previous, MISSING_RECORD);
  try {
    await reorderGallery(createAppContext(), viewer, { photoIds: ids.map((parsed) => parsed.data ?? "") });
  } catch (error) {
    return refused(previous, error);
  }
  refreshGalleryPages();
  return success(previous, "Gallery order saved.");
}

/** Moves one photo: "photoId" and "direction" = "earlier" | "later". */
export async function moveGalleryPhotoAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic");
  const photoId = readId(formData, "photoId");
  const direction = formData.get("direction");
  if (!photoId || (direction !== "earlier" && direction !== "later")) return failure(previous, MISSING_RECORD);
  try {
    await moveGalleryPhoto(createAppContext(), viewer, { photoId, direction });
  } catch (error) {
    return refused(previous, error);
  }
  refreshGalleryPages();
  return success(previous, direction === "earlier" ? "Photo moved earlier." : "Photo moved later.");
}

export async function removeGalleryPhotoAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic");
  const photoId = readId(formData, "photoId");
  if (!photoId) return failure(previous, MISSING_RECORD);
  try {
    await removeGalleryPhoto(createAppContext(), viewer, { photoId });
  } catch (error) {
    return refused(previous, error);
  }
  refreshGalleryPages();
  return success(previous, "Photo removed from your gallery.");
}

// ---------------------------------------------------------------------------------
// Booking photos (the booking's customer or mechanic)
// ---------------------------------------------------------------------------------

export async function addBookingPhotosAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole(["customer", "mechanic"]);
  const bookingId = readId(formData, "bookingId");
  if (!bookingId) return failure(previous, MISSING_RECORD);
  const phase = formData.get("phase");
  if (!isBookingPhotoPhase(phase)) return failure(previous, "Choose whether these are before, after or other photos.");
  const prepared = await preparePictures(formData, "booking_photo");
  if (!prepared.ok) return failure(previous, "Some photos couldn't be added.", prepared.errors);
  let added: number;
  try {
    ({ added } = await addBookingPhotos(createAppContext(), viewer, {
      bookingId,
      phase,
      caption: readCaption(formData),
      uploads: prepared.uploads,
    }));
  } catch (error) {
    return refused(previous, error);
  }
  refresh();
  return success(previous, `${photoCount(added)} added to the booking.`);
}

export async function removeBookingPhotoAction(previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const viewer = await requireRole(["customer", "mechanic"]);
  const photoId = readId(formData, "photoId");
  if (!photoId) return failure(previous, MISSING_RECORD);
  try {
    await removeBookingPhoto(createAppContext(), viewer, { photoId });
  } catch (error) {
    return refused(previous, error);
  }
  refresh();
  return success(previous, "Photo removed.");
}
