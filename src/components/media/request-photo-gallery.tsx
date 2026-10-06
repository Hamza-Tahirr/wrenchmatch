import "server-only";

import { getViewer } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { listRequestPhotos } from "@/server/media/request-photos";

import { PhotoGrid } from "./photo-grid";

export type RequestPhotoGalleryProps = {
  requestId: string;
  /** "grid" (default) or "strip" for a compact row. */
  layout?: "grid" | "strip";
  /** Accessible name of the list and the viewer. */
  label?: string;
  className?: string;
};

/**
 * Drop-in: the request's photos the viewer may see (each one passes the same policy check as
 * /api/files), as tiles that open the full-screen viewer. Works for the request's customer,
 * a matched (approved) mechanic, the booked mechanic and admins. Renders nothing when there
 * are no photos to show.
 */
export async function RequestPhotoGallery({ requestId, layout = "grid", label = "Photos of the problem", className }: RequestPhotoGalleryProps) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const photos = await listRequestPhotos(createAppContext(), viewer, requestId);
  if (photos.length === 0) return null;
  return <PhotoGrid photos={photos} label={label} layout={layout} className={className} />;
}
