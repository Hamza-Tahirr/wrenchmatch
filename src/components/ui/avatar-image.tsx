"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The photo layer of Avatar: lazy-loaded, explicit size (no layout shift), and removed when it
 * fails so the initials underneath show. Decorative: Avatar labels the whole element.
 */
export function AvatarImage({ src, size }: { src: string; size: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // The image may have failed before hydration attached onError.
    const image = ref.current;
    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) return null;
  return (
    // Plain <img>: private files need the session cookie, which the image optimizer would not send.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-cover"
    />
  );
}
