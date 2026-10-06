"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type ExpandableMapProps = {
  /** CSS height of the map, e.g. "clamp(13rem, 36vh, 20rem)". */
  height: string;
  /** CSS height while expanded, e.g. "min(72vh, 36rem)". */
  expandedHeight: string;
  /** The map, sized with `height="var(--wm-map-h)"`. */
  children: ReactNode;
  /** Hide the button from `lg` up, where the map is tall anyway. */
  hideToggleOnDesktop?: boolean;
  className?: string;
};

/**
 * A map with an "Expand map" button over its top-left corner: on a phone the map starts short
 * so the list below stays in view, and one tap makes it tall. The height is a CSS variable
 * (`--wm-map-h`) that MapView reads; MapLibre redraws when its container resizes.
 */
export function ExpandableMap({ height, expandedHeight, children, hideToggleOnDesktop = false, className }: ExpandableMapProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("relative", className)} style={{ "--wm-map-h": expanded ? expandedHeight : height } as CSSProperties}>
      {children}
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={cn(
          "glass-strong absolute top-3 left-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-fg transition-[box-shadow,color,transform] duration-200 hover:text-fg hover:shadow-glow-sm active:scale-[0.97]",
          hideToggleOnDesktop ? "lg:hidden" : null,
        )}
      >
        {expanded ? <Minimize2 aria-hidden="true" className="size-4 text-neon-cyan" /> : <Maximize2 aria-hidden="true" className="size-4 text-neon-cyan" />}
        {expanded ? "Smaller map" : "Expand map"}
      </button>
    </div>
  );
}
