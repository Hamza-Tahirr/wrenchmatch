"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type LazyMountProps = {
  /** Rendered while the box is near the viewport (and only while it is displayed). */
  children: ReactNode;
  /** Shown until then (server render included). Defaults to nothing. */
  placeholder?: ReactNode;
  /** How far ahead of the viewport to mount, as an IntersectionObserver root margin. */
  rootMargin?: string;
  /**
   * Size the box (e.g. an aspect ratio) so nothing shifts when the content mounts or is
   * released again.
   */
  className?: string;
  style?: CSSProperties;
  /**
   * Accessible name of the art (the box becomes `role="img"` from the first render, so the
   * description never depends on scrolling). Render the content itself as decorative.
   */
  label?: string;
};

/**
 * Content farther than this from the viewport is released (unmounted) and mounts again on
 * the way back, so only the art within a few screens of the visitor keeps layers and
 * scroll-linked animations alive. Mounting a scene is the expensive part (render, style and
 * layer commit of a large SVG), so the margin is wide: normal back-and-forth scrolling never
 * releases anything, and the gap to the mount margin is the hysteresis.
 */
const KEEP_MARGIN = "600% 0px";

// Idle prefetch: once the page has loaded and settled, displayed boxes within the keep zone
// mount one at a time in idle periods (never while the page is scrolling), so the art is
// usually ready before the visitor scrolls to it and no mount lands in the middle of a scroll.
const IDLE_START_MS = 1600;
const waiting = new Set<() => boolean>();
let pumping = false;

type IdleHandle = (callback: () => void) => void;

const whenIdle: IdleHandle = (callback) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(callback, { timeout: 2500 });
  else window.setTimeout(callback, 250);
};

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    if (document.documentElement.hasAttribute("data-scrolling")) {
      window.setTimeout(() => whenIdle(step), 400);
      return;
    }
    for (const mount of waiting) {
      waiting.delete(mount);
      // `mount` returns false when nothing was rendered (box hidden or no longer near).
      if (mount()) break;
    }
    if (waiting.size === 0) {
      pumping = false;
      return;
    }
    whenIdle(step);
  };
  const start = () => window.setTimeout(() => whenIdle(step), IDLE_START_MS);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/**
 * Renders heavy decorative art only around the viewport: it mounts when the box comes near
 * (or in idle time while it is within a few screens) and is released again once it is far
 * away, keeping it out of the server HTML, the hydration work and the per-frame cost of the
 * rest of the page. A box that is not displayed (`display: none`, such as the art of the
 * layout a breakpoint hides) never mounts its content. Content fades in when it mounts.
 */
export function LazyMount({ children, placeholder = null, rootMargin = "90% 0px", className, style, label }: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let current = false;
    const show = (value: boolean) => {
      if (current === value) return;
      current = value;
      setShown(value);
    };

    if (typeof IntersectionObserver === "undefined") {
      const mountAnyway = () => {
        show(true);
        return true;
      };
      waiting.add(mountAnyway);
      pump();
      return () => {
        waiting.delete(mountAnyway);
      };
    }

    let near = false;
    const idleMount = () => {
      if (!near || node.getClientRects().length === 0) return false;
      show(true);
      return true;
    };
    const mountObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) show(true);
      },
      { rootMargin },
    );
    const keepObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        near = entry.isIntersecting;
        if (!near) {
          waiting.delete(idleMount);
          show(false);
        } else if (!current) {
          waiting.add(idleMount);
          pump();
        }
      },
      { rootMargin: KEEP_MARGIN },
    );
    mountObserver.observe(node);
    keepObserver.observe(node);
    return () => {
      waiting.delete(idleMount);
      mountObserver.disconnect();
      keepObserver.disconnect();
    };
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative", className)}
      style={style}
    >
      {shown ? <div className="animate-fade-in">{children}</div> : placeholder}
    </div>
  );
}
