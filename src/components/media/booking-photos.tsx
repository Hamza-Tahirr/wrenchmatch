import "server-only";

import { Camera } from "lucide-react";

import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/viewer";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import { addBookingPhotosAction, removeBookingPhotoAction } from "@/server/media/actions";
import { getBookingPhotos, type BookingPhotosOverview } from "@/server/media/booking-photos";
import { uploadBudgetFor } from "@/server/storage/config";

import { Dropzone } from "./dropzone";
import { BOOKING_PHASE_LABELS, BOOKING_PHOTO_PHASES, type BookingPhotoPhase, type BookingPhotoView } from "./media-types";
import { PhotoGrid } from "./photo-grid";

export type BookingPhotosProps = {
  bookingId: string;
  /** Whose booking page this is on; wording only (access is always checked on the server). */
  viewerRole: "customer" | "mechanic" | "admin";
  className?: string;
};

const PHASE_HINTS: Readonly<Record<BookingPhotoPhase, string>> = {
  before: "The car as it was",
  after: "The finished work",
  other: "Parts, receipts, anything else",
};

/**
 * Drop-in for booking pages: before / after / other photos added by the booking's customer
 * and mechanic once the booking is confirmed, with a full-screen viewer and an uploader for
 * the two parties (each may remove their own photos). The other party is notified of new
 * photos. Admins see the photos without the uploader. Renders nothing for anyone else.
 */
export async function BookingPhotos({ bookingId, viewerRole, className }: BookingPhotosProps) {
  const viewer = await getViewer();
  if (!viewer) return null;
  let overview: BookingPhotosOverview;
  try {
    overview = await getBookingPhotos(createAppContext(), viewer, bookingId);
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }

  const groups = BOOKING_PHOTO_PHASES.map((phase) => ({
    phase,
    photos: overview.photos.filter((photo) => photo.phase === phase),
  })).filter((group) => group.photos.length > 0);
  const removable = overview.photos.filter((photo) => photo.mine).map((photo) => photo.id);
  const badges = Object.fromEntries(overview.photos.map((photo) => [photo.id, badgeFor(photo)]));
  const defaultPhase: BookingPhotoPhase = overview.viewerRole === "mechanic" ? "after" : "before";
  const headingId = `booking-photos-${bookingId}`;
  const counterpart = viewerRole === "mechanic" ? "the customer" : viewerRole === "customer" ? "your mechanic" : "the other party";

  return (
    <section aria-labelledby={headingId} className={cn("glass rounded-2xl p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-neon-cyan ring-1 ring-neon-cyan/30">
            <Camera className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 id={headingId} className="text-lg font-semibold text-fg">
              Before &amp; after photos
            </h2>
            <p className="text-sm text-fg-muted">
              {viewerRole === "admin"
                ? "Photos the customer and the mechanic added to this booking."
                : `Share how the car looked before and after the work. ${capitalize(counterpart)} is notified when you add photos.`}
            </p>
          </div>
        </div>
        <p className="rounded-full border border-line bg-surface-2/70 px-3 py-1 font-mono text-xs text-fg-muted tabular">
          {overview.photos.length}/{overview.limit}
        </p>
      </div>

      {groups.length > 0 ? (
        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <div key={group.phase} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-fg uppercase">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-neon-cyan shadow-glow-sm" />
                {BOOKING_PHASE_LABELS[group.phase]}
                <span className="font-normal tracking-normal text-fg-subtle normal-case">· {group.photos.length}</span>
              </h3>
              <PhotoGrid
                photos={group.photos}
                label={`${BOOKING_PHASE_LABELS[group.phase]} photos`}
                removeAction={overview.canAdd || removable.length > 0 ? removeBookingPhotoAction : undefined}
                removableIds={removable}
                badges={badges}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
          {viewerRole === "admin" ? "No photos on this booking." : "No photos yet."}
        </p>
      )}

      {overview.canAdd ? (
        <Dropzone
          action={addBookingPhotosAction}
          fields={{ bookingId }}
          maxFiles={overview.perUpload}
          maxBytes={UPLOAD_LIMITS.booking_photo.maxBytes}
          budget={uploadBudgetFor("booking_photo")}
          label="Add photos to this booking"
          hint="Drag photos here, paste them, or click to choose."
          submitVerb="Add"
          compact
          className="mt-6 border-t border-line pt-6"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg">These photos show</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {BOOKING_PHOTO_PHASES.map((phase) => (
                <label
                  key={phase}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-neon-cyan/50 has-[:checked]:border-neon-cyan has-[:checked]:bg-brand-50/70 has-[:checked]:shadow-glow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon-cyan"
                >
                  <input type="radio" name="phase" value={phase} defaultChecked={phase === defaultPhase} className="mt-1 accent-[var(--color-neon-cyan)]" />
                  <span>
                    <span className="block text-sm font-semibold text-fg">{BOOKING_PHASE_LABELS[phase]}</span>
                    <span className="block text-xs text-fg-muted">{PHASE_HINTS[phase]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor={`${headingId}-caption`} className="text-sm font-semibold text-fg">
              Caption <span className="font-normal text-fg-muted">(optional, for all photos in this upload)</span>
            </label>
            <input
              id={`${headingId}-caption`}
              name="caption"
              maxLength={MEDIA_LIMITS.captionMaxLength}
              placeholder="e.g. Worn front pads"
              className="min-h-11 w-full rounded-lg border border-control bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:border-neon-cyan focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-cyan sm:text-sm"
            />
          </div>
        </Dropzone>
      ) : overview.closedReason && viewerRole !== "admin" ? (
        <p className="mt-5 text-sm text-fg-muted">{overview.closedReason}</p>
      ) : null}
    </section>
  );
}

function badgeFor(photo: BookingPhotoView): string {
  if (photo.mine) return "You";
  return photo.uploadedByRole === "mechanic" ? "Mechanic" : "Customer";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
