"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import type { MediaPhoto } from "./media-types";

/**
 * A photo filling its (relative, overflow-hidden) tile: lazy-loaded with its real size known,
 * over a shimmering placeholder that is removed once the picture has loaded (or failed), so
 * a loading tile never looks empty. Pictures that finished before hydration are caught by the
 * ref, since their load event fired before React was listening.
 */
export function TileImage({ photo, className }: { photo: MediaPhoto; className?: string }) {
  const [settled, setSettled] = useState(false);

  return (
    <>
      {settled ? null : <span aria-hidden="true" className="shimmer absolute inset-0" />}
      {/* Private files are streamed by /api/files with the session cookie (no image optimizer). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={(image) => {
          if (image?.complete) setSettled(true);
        }}
        src={photo.src}
        alt={photo.alt}
        width={photo.width ?? 400}
        height={photo.height ?? 300}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setSettled(true)}
        onError={() => setSettled(true)}
        className={cn("relative size-full object-cover", className)}
      />
    </>
  );
}
