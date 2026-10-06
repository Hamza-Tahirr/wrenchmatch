"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { cn } from "@/lib/cn";

import type { MediaPhoto } from "./media-types";

export type LightboxOrigin = { x: number; y: number; width: number; height: number };

export type LightboxProps = {
  photos: readonly MediaPhoto[];
  /** Index of the photo shown, or null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Screen rectangle of the thumbnail that opened the viewer: the viewer zooms out of it. */
  originRect?: LightboxOrigin | null;
  /** Accessible name of the viewer, e.g. "Work gallery". */
  label?: string;
};

const ZOOM_SCALE = 2.25;
const SWIPE_DISTANCE = 56;
const EASE = [0.16, 1, 0.3, 1] as const;

type Zoom = { on: boolean; x: number; y: number };
const NO_ZOOM: Zoom = { on: false, x: 50, y: 50 };

// Direction-aware slides: `custom` is +1 (next) or -1 (previous). AnimatePresence passes the
// latest direction to the photo that is leaving, so it exits the right way.
const slide: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 90, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -90, scale: 0.97 }),
};

const roundButton =
  "grid size-11 place-items-center rounded-full border border-line-strong bg-surface/70 text-fg backdrop-blur transition-[color,border-color,box-shadow] hover:border-neon-cyan/60 hover:text-neon-cyan hover:shadow-glow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan";

/**
 * Full-screen photo viewer on the native <dialog> (focus trapped, Escape closes). Arrow keys,
 * Home/End, swipe, the side buttons and the thumbnail rail move between photos; double-click,
 * double-tap, Z or the zoom button zoom in where you point (move to pan); swipe down closes.
 * Animations use transform/opacity only and calm down with reduced motion (MotionConfig).
 */
export function Lightbox({ photos, index, onIndexChange, onClose, originRect, label = "Photo viewer" }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastTap = useRef(0);
  const [direction, setDirection] = useState(1);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [zoomFor, setZoomFor] = useState<string | null>(null);
  const captionId = useId();
  const open = index !== null && photos.length > 0;
  const position = open ? Math.min(Math.max(index, 0), photos.length - 1) : 0;
  const current = open ? photos[position] : null;
  // Each photo starts unzoomed (derived, instead of resetting state in an effect).
  const activeZoom = current && zoomFor === current.id ? zoom : NO_ZOOM;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // No page scrolling behind the viewer.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // Warm the cache for the neighbours so moving through the photos feels instant.
  useEffect(() => {
    if (!open || photos.length < 2) return;
    for (const offset of [1, -1]) {
      const neighbour = photos[(position + offset + photos.length) % photos.length];
      const image = new Image();
      image.decoding = "async";
      image.src = neighbour.src;
    }
  }, [open, position, photos]);

  function go(step: number) {
    if (!open || photos.length < 2) return;
    setDirection(step);
    onIndexChange((position + step + photos.length) % photos.length);
  }

  function jump(target: number) {
    if (!open || target === position) return;
    setDirection(target > position ? 1 : -1);
    onIndexChange(target);
  }

  function toggleZoom(x = 50, y = 50) {
    if (!current) return;
    setZoomFor(current.id);
    setZoom(activeZoom.on ? NO_ZOOM : { on: true, x, y });
  }

  function pointAt(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => go(1),
      ArrowLeft: () => go(-1),
      Home: () => jump(0),
      End: () => jump(photos.length - 1),
      z: () => toggleZoom(),
      Z: () => toggleZoom(),
      "+": () => toggleZoom(),
      "-": () => toggleZoom(),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    // While zoomed, the zoom point follows the pointer (move the mouse, or drag a finger).
    if (!activeZoom.on) return;
    if (event.pointerType !== "mouse" && pointerStart.current === null) return;
    setZoom({ on: true, ...pointAt(event) });
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (event.pointerType !== "mouse" && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      // A double tap toggles the zoom on touch screens.
      if (event.timeStamp - lastTap.current < 320) {
        const point = pointAt(event);
        toggleZoom(point.x, point.y);
        lastTap.current = 0;
      } else {
        lastTap.current = event.timeStamp;
      }
      return;
    }
    if (activeZoom.on) return;
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
    else if (dy > SWIPE_DISTANCE * 1.6 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
  }

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const origin = originRect ? `${originRect.x + originRect.width / 2}px ${originRect.y + originRect.height / 2}px` : "50% 50%";

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      aria-describedby={current?.caption ? captionId : undefined}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-fg backdrop:bg-canvas/85 backdrop:backdrop-blur-xl"
    >
      {open && current ? (
        <m.div
          className="relative flex size-full flex-col"
          style={{ transformOrigin: origin }}
          initial={{ opacity: 0, scale: originRect ? 0.4 : 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.34, ease: EASE }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,color-mix(in_oklab,var(--color-neon-cyan)_11%,transparent),transparent_70%)]"
          />

          <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6">
            <p className="rounded-full border border-line bg-surface/70 px-3 py-1 font-mono text-xs text-fg-muted tabular backdrop-blur">
              <span className="sr-only">Photo </span>
              {position + 1} / {photos.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleZoom()}
                aria-pressed={activeZoom.on}
                aria-label="Zoom"
                className={roundButton}
              >
                {activeZoom.on ? <ZoomOut aria-hidden="true" className="size-5" /> : <ZoomIn aria-hidden="true" className="size-5" />}
              </button>
              <button type="button" autoFocus onClick={onClose} aria-label="Close photo viewer" className={roundButton}>
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
          </header>

          <div
            className={cn(
              "relative min-h-0 flex-1 touch-none overflow-hidden select-none",
              activeZoom.on ? "cursor-zoom-out" : "cursor-zoom-in",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            onDoubleClick={(event) => {
              const point = pointAt(event);
              toggleZoom(point.x, point.y);
            }}
          >
            <AnimatePresence initial={false} custom={direction}>
              <m.div
                key={current.id}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: EASE }}
                className="absolute inset-0 flex items-center justify-center px-2 sm:px-20"
              >
                {/* Private files are served by /api/files with the session cookie (no image optimizer). */}
                <m.img
                  src={current.src}
                  alt={current.alt}
                  width={current.width ?? undefined}
                  height={current.height ?? undefined}
                  draggable={false}
                  decoding="async"
                  className="h-auto max-h-full w-auto max-w-full rounded-xl object-contain shadow-[0_30px_80px_-30px_oklch(0_0_0/0.9)] ring-1 ring-line-strong light:shadow-[0_30px_80px_-30px_oklch(0.3_0.05_262/0.45)]"
                  style={{ transformOrigin: `${activeZoom.x}% ${activeZoom.y}%` }}
                  animate={{ scale: activeZoom.on ? ZOOM_SCALE : 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                />
              </m.div>
            </AnimatePresence>

            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    stop(event);
                    go(-1);
                  }}
                  onPointerDown={stop}
                  onPointerUp={stop}
                  onDoubleClick={stop}
                  aria-label="Previous photo"
                  className={cn(roundButton, "absolute top-1/2 left-3 z-10 hidden size-12 -translate-y-1/2 shadow-glow-sm sm:grid")}
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    stop(event);
                    go(1);
                  }}
                  onPointerDown={stop}
                  onPointerUp={stop}
                  onDoubleClick={stop}
                  aria-label="Next photo"
                  className={cn(roundButton, "absolute top-1/2 right-3 z-10 hidden size-12 -translate-y-1/2 shadow-glow-sm sm:grid")}
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </button>
              </>
            ) : null}
          </div>

          <footer className="relative z-10 space-y-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <p id={captionId} className={cn("mx-auto max-w-2xl text-center text-sm text-fg sm:text-base", !current.caption && "sr-only")}>
              {current.caption ?? current.alt}
            </p>
            {photos.length > 1 ? (
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={cn(roundButton, "shrink-0 sm:hidden")}>
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
                <ol className="flex max-w-full gap-2 overflow-x-auto p-1 [scrollbar-width:none]" aria-label="All photos">
                  {photos.map((photo, photoIndex) => {
                    const selected = photoIndex === position;
                    return (
                      <li key={photo.id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => jump(photoIndex)}
                          aria-label={`Show photo ${photoIndex + 1}`}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "block size-12 overflow-hidden rounded-lg ring-1 transition-[box-shadow,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan",
                            selected ? "opacity-100 shadow-glow ring-neon-cyan" : "opacity-55 ring-line hover:opacity-90",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className={cn(roundButton, "shrink-0 sm:hidden")}>
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              </div>
            ) : null}
            <p className="hidden text-center text-xs text-fg-subtle sm:block">Arrow keys to browse · double-click to zoom · Esc to close</p>
          </footer>
        </m.div>
      ) : null}
    </dialog>
  );
}
