import "server-only";

import { Images } from "lucide-react";

import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { listMechanicGallery } from "@/server/media/gallery";

import { PhotoGrid } from "./photo-grid";

export type MechanicGalleryStripProps = {
  mechanicId: string;
  /** Heading above the strip (default "Recent work"). Pass null for no heading. */
  title?: string | null;
  /** "strip" (default): one swipeable row for cards; "grid" for a profile section. */
  layout?: "strip" | "grid";
  className?: string;
};

/**
 * Drop-in for quote cards and mechanic profiles: the mechanic's work gallery, for the people
 * who may see it (the mechanic, admins, and customers the mechanic quoted for or is booked
 * with). Tiles open the full-screen viewer. Renders nothing when there is nothing to show.
 */
export async function MechanicGalleryStrip({ mechanicId, title = "Recent work", layout = "strip", className }: MechanicGalleryStripProps) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const photos = await listMechanicGallery(createAppContext(), viewer, mechanicId);
  if (photos.length === 0) return null;
  return (
    <div className={cn("space-y-2.5", className)}>
      {title ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Images aria-hidden="true" className="size-4 text-neon-cyan" />
          {title}
          <span className="font-mono text-xs font-normal text-fg-subtle tabular">{photos.length}</span>
        </p>
      ) : null}
      <PhotoGrid photos={photos} label={title ?? "Work gallery"} layout={layout} />
    </div>
  );
}
