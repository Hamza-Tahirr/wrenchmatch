"use client";

import { AnimatePresence, m } from "motion/react";
import { Expand, Trash2 } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

import type { MediaAction } from "./dropzone";
import { Lightbox, type LightboxOrigin } from "./lightbox";
import { INITIAL_MEDIA_STATE, type MediaActionState, type MediaPhoto } from "./media-types";
import { TileImage } from "./tile-image";

export type PhotoGridProps = {
  photos: readonly MediaPhoto[];
  /** Accessible name of the list and of the viewer, e.g. "Work gallery". */
  label: string;
  /** "grid": responsive tiles; "strip": one swipeable row (cards, previews). */
  layout?: "grid" | "strip";
  /** Removes a photo (receives "photoId" = MediaPhoto.id). Shown on photos in `removableIds`. */
  removeAction?: MediaAction;
  removableIds?: readonly string[];
  /** Small text over a tile, e.g. "Before" or "Added by you" (keyed by MediaPhoto.id). */
  badges?: Readonly<Record<string, string>>;
  /** Shown when there are no photos (default: nothing). */
  empty?: ReactNode;
  className?: string;
};

/**
 * Thumbnails that open the Lightbox. Each tile is a button (keyboard and screen-reader
 * friendly), images load lazily with their real aspect ratio known, and tiles lift and glow
 * on hover. Removing asks for a second click before it deletes.
 */
export function PhotoGrid({
  photos,
  label,
  layout = "grid",
  removeAction,
  removableIds = [],
  badges,
  empty = null,
  className,
}: PhotoGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [origin, setOrigin] = useState<LightboxOrigin | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removeState, setRemoveState] = useState<MediaActionState>(INITIAL_MEDIA_STATE);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggers = useRef(new Map<string, HTMLButtonElement>());

  if (photos.length === 0) return <>{empty}</>;

  function openAt(index: number, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    setOrigin({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    setOpenIndex(index);
  }

  function close() {
    const photo = openIndex === null ? undefined : photos[openIndex];
    setOpenIndex(null);
    // Focus goes back to the tile of the photo that was showing.
    const trigger = photo ? triggers.current.get(photo.id) : undefined;
    if (trigger?.isConnected) trigger.focus();
  }

  function remove(photoId: string) {
    if (!removeAction) return;
    const formData = new FormData();
    formData.set("photoId", photoId);
    setRemovingId(photoId);
    const previous = removeState;
    startTransition(async () => {
      const next = await removeAction(previous, formData);
      setRemoveState(next);
      if (next.message) (next.status === "success" ? toast.success : toast.error)(next.message);
      // On success the tile stays dimmed ("Removing…") until the refreshed list drops it.
      if (next.status !== "success") {
        setConfirming(null);
        setRemovingId(null);
      }
    });
  }

  const strip = layout === "strip";

  return (
    <div className={className}>
      <ul
        aria-label={label}
        className={cn(
          strip
            ? "-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-1 pb-3 [scrollbar-width:thin] [mask-image:linear-gradient(90deg,#000_88%,transparent)]"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        )}
      >
        <AnimatePresence initial={false}>
          {photos.map((photo, index) => {
            const removable = removeAction !== undefined && removableIds.includes(photo.id);
            const badge = badges?.[photo.id];
            const isRemoving = removingId === photo.id;
            return (
              <m.li
                key={photo.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 8) * 0.03 }}
                className={cn("group relative", strip && "w-44 shrink-0 snap-start sm:w-52")}
              >
                <button
                  type="button"
                  ref={(element) => {
                    if (element) triggers.current.set(photo.id, element);
                    else triggers.current.delete(photo.id);
                  }}
                  onClick={(event) => openAt(index, event.currentTarget)}
                  aria-label={`Open ${photo.caption ? `“${photo.caption}”` : `photo ${index + 1}`} full screen`}
                  className={cn(
                    "card-hover relative block w-full overflow-hidden rounded-xl border border-line bg-surface-2 text-left",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan",
                    strip ? "aspect-[4/3]" : "aspect-square",
                    isRemoving && "opacity-50",
                  )}
                >
                  <TileImage photo={photo} className="transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.06]" />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-linear-to-t from-canvas/85 via-canvas/0 to-canvas/0 opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-canvas/70 text-fg opacity-0 ring-1 ring-line-strong backdrop-blur transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <Expand className="size-4" />
                  </span>
                  {badge ? (
                    <span className="absolute top-2 left-2 rounded-full bg-canvas/75 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-neon-cyan uppercase ring-1 ring-neon-cyan/30 backdrop-blur">
                      {badge}
                    </span>
                  ) : null}
                  {photo.caption ? (
                    <span className="absolute inset-x-0 bottom-2 line-clamp-2 px-2.5 text-xs leading-snug font-medium text-fg">{photo.caption}</span>
                  ) : null}
                </button>

                {removable ? (
                  <div className="mt-1.5 flex min-h-9 items-center gap-1.5">
                    {confirming === photo.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(photo.id)}
                          disabled={pending}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-danger-700 px-2.5 text-xs font-semibold text-on-brand hover:bg-danger-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan disabled:opacity-60"
                        >
                          {isRemoving ? "Removing…" : "Remove"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          disabled={pending}
                          className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-fg-muted sm:min-h-9 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-neon-cyan"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(photo.id)}
                        aria-label={`Remove photo ${index + 1}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-fg-muted transition-colors sm:min-h-9 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-neon-cyan"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                ) : null}
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <p aria-live="polite" className="text-sm empty:hidden">
        {removeState.status === "error" ? <span className="text-danger-700">{removeState.message}</span> : null}
        {removeState.status === "success" ? <span className="sr-only">{removeState.message}</span> : null}
      </p>

      <Lightbox
        photos={photos}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={close}
        originRect={origin}
        label={label}
      />
    </div>
  );
}
