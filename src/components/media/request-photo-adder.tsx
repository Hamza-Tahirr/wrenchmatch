import "server-only";

import { ImagePlus } from "lucide-react";

import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/viewer";
import { UPLOAD_LIMITS } from "@/server/config";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import { addRequestPhotosAction } from "@/server/media/actions";
import { getRequestPhotoAllowance, listRequestPhotos, type RequestPhotoAllowance } from "@/server/media/request-photos";
import { uploadBudgetFor } from "@/server/storage/config";

import { Dropzone } from "./dropzone";
import { PhotoGrid } from "./photo-grid";

export type RequestPhotoAdderProps = {
  requestId: string;
  /** Also show the request's current photos above the uploader (default false). */
  showPhotos?: boolean;
  className?: string;
};

/**
 * Drop-in for the customer's request page: lets the request's customer add photos while the
 * request is open for quotes (up to 8 in all). New photos are shared with the matched
 * mechanics at once, like the ones sent with the request. Renders nothing for anyone else or
 * once the request is no longer open.
 */
export async function RequestPhotoAdder({ requestId, showPhotos = false, className }: RequestPhotoAdderProps) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "customer") return null;
  const ctx = createAppContext();
  let allowance: RequestPhotoAllowance;
  try {
    allowance = await getRequestPhotoAllowance(ctx, viewer, requestId);
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
  if (!allowance.acceptsPhotos && !showPhotos) return null;
  const photos = showPhotos ? await listRequestPhotos(ctx, viewer, requestId) : [];
  const used = Math.min(allowance.photoCount, allowance.limit);
  const headingId = `request-photos-${requestId}`;

  return (
    <section aria-labelledby={headingId} className={cn("glass rounded-2xl p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-neon-cyan ring-1 ring-neon-cyan/30">
            <ImagePlus className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 id={headingId} className="text-lg font-semibold text-fg">
              {allowance.remaining > 0 ? "Add more photos" : "Photos of the problem"}
            </h2>
            <p className="text-sm text-fg-muted">
              {allowance.remaining > 0
                ? "A clear picture helps mechanics quote accurately. Matched mechanics see new photos right away."
                : (allowance.closedReason ?? "")}
            </p>
          </div>
        </div>
        <div className="min-w-32 space-y-1.5">
          <p className="text-right font-mono text-xs text-fg-muted tabular">
            {used}/{allowance.limit} photos
          </p>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
            <div
              className="h-full origin-left rounded-full bg-linear-to-r from-neon-cyan to-neon-violet motion-safe:transition-transform motion-safe:duration-700"
              style={{ transform: `scaleX(${allowance.limit === 0 ? 0 : used / allowance.limit})` }}
            />
          </div>
        </div>
      </div>

      {photos.length > 0 ? <PhotoGrid photos={photos} label="Photos of the problem" className="mt-5" /> : null}

      {allowance.remaining > 0 ? (
        <Dropzone
          action={addRequestPhotosAction}
          fields={{ requestId }}
          maxFiles={allowance.perUpload}
          maxBytes={UPLOAD_LIMITS.request_photo.maxBytes}
          budget={uploadBudgetFor("request_photo")}
          label="Add photos of the problem"
          hint="Drag photos here, paste them, or click to choose."
          submitVerb="Add"
          compact
          className="mt-5"
        />
      ) : null}
    </section>
  );
}
