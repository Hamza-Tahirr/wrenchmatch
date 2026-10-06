"use client";

import { ArrowLeft, ArrowRight, CircleCheck, Expand, GripVertical, Trash2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

import type { MediaAction } from "./dropzone";
import { Lightbox, type LightboxOrigin } from "./lightbox";
import { INITIAL_MEDIA_STATE, type GalleryPhotoView, type MediaActionState } from "./media-types";
import { TileImage } from "./tile-image";

export type GalleryManagerProps = {
  photos: readonly GalleryPhotoView[];
  captionMaxLength: number;
  captionAction: MediaAction;
  moveAction: MediaAction;
  reorderAction: MediaAction;
  removeAction: MediaAction;
};

type Override = { basedOn: string; order: string[] };

const iconButton =
  "grid size-11 place-items-center rounded-lg border border-line sm:size-9 bg-surface-2/60 text-fg-muted transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan disabled:pointer-events-none disabled:opacity-35";

/**
 * The mechanic's own gallery: open a photo full screen, write a caption, put photos in order
 * (drag a card onto another, or use the earlier/later buttons, which also work with the
 * keyboard and on touch screens) and remove photos. Order changes show at once and are saved
 * in the background; a refused save puts the old order back.
 */
export function GalleryManager({ photos, captionMaxLength, captionAction, moveAction, reorderAction, removeAction }: GalleryManagerProps) {
  const [override, setOverride] = useState<Override | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<MediaActionState>(INITIAL_MEDIA_STATE);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [origin, setOrigin] = useState<LightboxOrigin | null>(null);
  const [pending, startTransition] = useTransition();

  const serverKey = photos.map((photo) => photo.id).join(",");
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  // A local order applies only to the list it was made from; fresh server data wins.
  const ordered =
    override && override.basedOn === serverKey
      ? override.order.map((id) => byId.get(id)).filter((photo): photo is GalleryPhotoView => photo !== undefined)
      : [...photos];

  function submit(action: MediaAction, formData: FormData, onFailure?: () => void) {
    const previous = status;
    startTransition(async () => {
      const next = await action(previous, formData);
      setStatus(next);
      if (next.status === "error") {
        onFailure?.();
        if (next.message) toast.error(next.message);
      }
    });
  }

  function saveOrder(ids: string[]) {
    setOverride({ basedOn: serverKey, order: ids });
    const formData = new FormData();
    for (const id of ids) formData.append("photoIds", id);
    submit(reorderAction, formData, () => setOverride(null));
  }

  function move(photoId: string, direction: "earlier" | "later") {
    const ids = ordered.map((photo) => photo.id);
    const from = ids.indexOf(photoId);
    const to = direction === "earlier" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setOverride({ basedOn: serverKey, order: ids });
    const formData = new FormData();
    formData.set("photoId", photoId);
    formData.set("direction", direction);
    submit(moveAction, formData, () => setOverride(null));
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((photo) => photo.id).filter((id) => id !== dragId);
    const targetIndex = ids.indexOf(targetId);
    const fromIndex = ordered.findIndex((photo) => photo.id === dragId);
    const toIndex = ordered.findIndex((photo) => photo.id === targetId);
    ids.splice(fromIndex < toIndex ? targetIndex + 1 : targetIndex, 0, dragId);
    setDragId(null);
    setOverId(null);
    saveOrder(ids);
  }

  if (ordered.length === 0) return null;

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="empty:hidden">
        {status.status === "error" ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-800">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" /> {status.message}
          </p>
        ) : status.status === "success" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success-700">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> {status.message}
          </p>
        ) : null}
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Your work gallery, in display order">
        {ordered.map((photo, index) => (
            <li
              key={photo.id}
              draggable={!pending}
              onDragStart={(event: DragEvent<HTMLLIElement>) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", photo.id);
                setDragId(photo.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(event: DragEvent<HTMLLIElement>) => {
                if (!dragId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overId !== photo.id) setOverId(photo.id);
              }}
              onDrop={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                handleDrop(photo.id);
              }}
              className={cn(
                "glass-lite overflow-hidden rounded-2xl transition-[transform,opacity,box-shadow] duration-300 ease-out motion-safe:animate-scale-in",
                dragId === photo.id && "opacity-45",
                overId === photo.id && dragId !== photo.id && "shadow-glow ring-1 ring-neon-cyan/60 motion-safe:scale-[1.02]",
              )}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setOrigin({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
                    setOpenIndex(index);
                  }}
                  aria-label={`Open photo ${index + 1} full screen`}
                  className="group relative block aspect-[4/3] w-full overflow-hidden bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon-cyan"
                >
                  <TileImage photo={photo} className="transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.05]" />
                  <span aria-hidden="true" className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-canvas/70 text-fg ring-1 ring-line-strong backdrop-blur">
                    <Expand className="size-4" />
                  </span>
                </button>
                <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-full bg-canvas/75 px-2 py-1 font-mono text-[11px] text-fg ring-1 ring-line-strong backdrop-blur tabular">
                  <GripVertical aria-hidden="true" className="hidden size-3.5 text-fg-subtle sm:block" />#{index + 1}
                </span>
              </div>

              <div className="space-y-3 p-4">
                <CaptionForm photo={photo} index={index} maxLength={captionMaxLength} action={captionAction} disabled={pending} onResult={setStatus} />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => move(photo.id, "earlier")}
                    disabled={pending || index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                    title="Move earlier"
                    className={iconButton}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(photo.id, "later")}
                    disabled={pending || index === ordered.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                    title="Move later"
                    className={iconButton}
                  >
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </button>
                  <RemoveButton photoId={photo.id} index={index} action={removeAction} disabled={pending} onResult={setStatus} />
                </div>
              </div>
            </li>
          ))}
      </ol>

      <Lightbox
        photos={ordered}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        originRect={origin}
        label="Your work gallery"
      />
    </div>
  );
}

function CaptionForm({
  photo,
  index,
  maxLength,
  action,
  disabled,
  onResult,
}: {
  photo: GalleryPhotoView;
  index: number;
  maxLength: number;
  action: MediaAction;
  disabled: boolean;
  onResult: (state: MediaActionState) => void;
}) {
  const inputId = useId();
  const counterId = useId();
  const serverCaption = photo.caption ?? "";
  const [value, setValue] = useState(serverCaption);
  const [savedCaption, setSavedCaption] = useState(serverCaption);
  const [syncedServer, setSyncedServer] = useState(serverCaption);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const lastResult = useRef<MediaActionState>(INITIAL_MEDIA_STATE);
  // The server's caption changed (this save landed, or another tab saved): adopt it unless
  // the person is mid-edit. Adjusted during render, as React recommends for prop changes.
  if (serverCaption !== syncedServer) {
    setSyncedServer(serverCaption);
    if (value === savedCaption) {
      setSavedCaption(serverCaption);
      setValue(serverCaption);
    }
  }
  const dirty = value.trim() !== savedCaption.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    const formData = new FormData(event.currentTarget);
    const submitted = value.trim();
    setSaving(true);
    startTransition(async () => {
      let next: MediaActionState;
      try {
        next = await action(lastResult.current, formData);
      } finally {
        setSaving(false);
      }
      lastResult.current = next;
      onResult(next);
      if (next.message) (next.status === "success" ? toast.success : toast.error)(next.message);
      if (next.status === "success") {
        setSavedCaption(submitted);
        setValue(submitted);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <input type="hidden" name="photoId" value={photo.id} />
      <label htmlFor={inputId} className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Caption for photo {index + 1}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          name="caption"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          maxLength={maxLength}
          placeholder="e.g. Front brake pads and rotors replaced"
          aria-describedby={counterId}
          disabled={disabled && !saving}
          className="min-h-10 w-full min-w-0 rounded-lg border border-control bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:border-neon-cyan focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-cyan sm:text-sm"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!dirty} loading={saving} loadingText="Saving">
          Save
        </Button>
      </div>
      <p id={counterId} className="text-right font-mono text-[11px] text-fg-subtle tabular">
        {value.length}/{maxLength}
      </p>
    </form>
  );
}

function RemoveButton({
  photoId,
  index,
  action,
  disabled,
  onResult,
}: {
  photoId: string;
  index: number;
  action: MediaAction;
  disabled: boolean;
  onResult: (state: MediaActionState) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    const formData = new FormData();
    formData.set("photoId", photoId);
    startTransition(async () => {
      const next = await action(INITIAL_MEDIA_STATE, formData);
      onResult(next);
      if (next.message) (next.status === "success" ? toast.success : toast.error)(next.message);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        aria-label={`Remove photo ${index + 1}`}
        leadingIcon={<Trash2 aria-hidden="true" />}
        className="ml-auto"
      >
        Remove
      </Button>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1.5">
      <Button variant="danger" size="sm" onClick={remove} loading={pending} loadingText="Removing">
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Keep
      </Button>
    </span>
  );
}
