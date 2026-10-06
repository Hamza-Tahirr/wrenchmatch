import type { CSSProperties, ReactNode } from "react";

import { ParallaxLayer } from "@/components/parallax/parallax-layer";
import { cn } from "@/lib/cn";
import { AmbientStyles } from "./ambient";
import { IllustrationSvg } from "./svg-kit";

/** One depth plane of a scene. */
export type SceneLayer = {
  key: string;
  /** ParallaxLayer depth: 0 moves with the page, positive = background, negative = foreground. */
  depth: number;
  /**
   * Part of the scene this layer covers, in viewBox units [x, y, width, height]. Cropping
   * keeps each GPU layer small. Content may still overflow it (overflow is visible).
   */
  box?: readonly [number, number, number, number];
  /** Extra classes on the layer wrapper (e.g. entrance animations). */
  className?: string;
  /**
   * Ambient loop for the whole layer (e.g. a floating card). In the layered variant it runs
   * on an HTML wrapper, so the compositor animates it without repainting the SVG.
   */
  loopClassName?: string;
  style?: CSSProperties;
  content: ReactNode;
};

export type SceneDefinition = {
  width: number;
  height: number;
  defs: ReactNode;
  layers: readonly SceneLayer[];
};

/** Props shared by every big scene component. */
export type SceneProps = {
  title?: string;
  desc?: string;
  decorative?: boolean;
  className?: string;
  /** Ambient loops (pins pulsing, routes flowing). Off under prefers-reduced-motion anyway. */
  animated?: boolean;
  /**
   * "layered" (default): stacked GPU layers that move inside a ParallaxScene /
   * PointerTracker / StickyScrollStory. "flat": one static <svg> (thumbnails, exports).
   */
  variant?: "layered" | "flat";
  /** Fixed font stack, only for static exports (the browser uses the page font). */
  fontFamily?: string;
};

type RenderProps = {
  scene: SceneDefinition;
  id: (name: string) => string;
  title: string;
  desc?: string;
  decorative?: boolean;
  className?: string;
  variant?: "layered" | "flat";
  fontFamily?: string;
};

function percent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`;
}

/** Renders a scene as parallax-ready layers, or as one flat SVG. */
export function RenderScene({ scene, id, title, desc, decorative = false, className, variant = "layered", fontFamily }: RenderProps) {
  const { width, height } = scene;
  if (variant === "flat") {
    return (
      <IllustrationSvg
        viewBox={`0 0 ${width} ${height}`}
        id={id}
        title={title}
        desc={desc}
        decorative={decorative}
        className={className}
        fontFamily={fontFamily}
      >
        <defs>{scene.defs}</defs>
        {scene.layers.map((layer) => (
          <g key={layer.key} className={layer.loopClassName}>
            {layer.content}
          </g>
        ))}
      </IllustrationSvg>
    );
  }

  const descId = id("scene-desc");
  return (
    <div
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-describedby={decorative || !desc ? undefined : descId}
      aria-hidden={decorative ? true : undefined}
      className={cn("relative isolate select-none", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <AmbientStyles />
      {decorative || !desc ? null : (
        <span id={descId} hidden>
          {desc}
        </span>
      )}
      <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
        <defs>{scene.defs}</defs>
      </svg>
      {scene.layers.map((layer) => {
        const [x, y, w, h] = layer.box ?? [0, 0, width, height];
        return (
          <ParallaxLayer key={layer.key} depth={layer.depth} className={layer.className} style={layer.style}>
            <div
              className={cn("absolute", layer.loopClassName)}
              style={{ left: percent(x, width), top: percent(y, height), width: percent(w, width), height: percent(h, height) }}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox={`${x} ${y} ${w} ${h}`}
                overflow="visible"
                className="block size-full"
              >
                {layer.content}
              </svg>
            </div>
          </ParallaxLayer>
        );
      })}
    </div>
  );
}
