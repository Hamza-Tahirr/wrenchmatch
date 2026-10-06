"use client";

import { useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { m, useMotionValue, useReducedMotion, useTransform } from "motion/react";

import { cn } from "@/lib/cn";
import { ParallaxContext, PointerContext, type ParallaxContextValue } from "./context";

export type ParallaxLayerProps = {
  children: ReactNode;
  /**
   * How far away the layer is. 0 moves with the page; positive values are background
   * (they lag behind the scroll, 0.2-0.6 is typical); negative values are foreground
   * (they move faster, -0.1 to -0.4).
   */
  depth: number;
  /** Multiplier for the pointer (mouse) shift inside a PointerTracker. Default 1. */
  pointer?: number;
  /**
   * true (default): an absolutely positioned, full-size, non-interactive art plane.
   * false: a normal block (use it to drift text or cards).
   */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Pixel shift of a depth-1 layer when the pointer is at the edge of a PointerTracker. */
const POINTER_SHIFT = 16;

type Keyframes = { input: number[]; transforms: string[]; opacities: number[] };

const STILL: Keyframes = { input: [0, 1], transforms: ["translateY(0px)", "translateY(0px)"], opacities: [1, 1] };

const round = (value: number) => Math.round(value * 100) / 100;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Scroll keyframes for one layer. The drift is linear in the scroll progress, so two
 * keyframes describe it exactly; an entrance adds a rise, a scale-up and a fade-in that end
 * later for nearer layers. Range-based keyframes let motion hand the animation to a native
 * scroll timeline (compositor) when the browser has one.
 */
function layerKeyframes(scene: ParallaxContextValue | null, depth: number): Keyframes {
  if (!scene) return STILL;
  const unit = scene.travel === undefined ? "px" : "%";
  const amplitude = (scene.travel === undefined ? scene.distance : scene.travel * 100) * depth;
  const drift = (p: number) => round((p - scene.rest) * amplitude);
  const entrance = scene.entrance;
  if (!entrance) {
    return {
      input: [0, 1],
      transforms: [`translateY(${drift(0)}${unit})`, `translateY(${drift(1)}${unit})`],
      opacities: [1, 1],
    };
  }
  // 0 for the far backdrop → 1 for the nearest floating cards.
  const near = clamp01((0.45 - depth) / 0.8);
  const start = Math.min(0.9, entrance.start + entrance.stagger * near);
  const mid = Math.min(0.94, start + entrance.span * 0.45);
  const end = Math.min(0.97, start + entrance.span);
  const rise = 5 + 16 * near; // % of the layer height
  const scale0 = 1 - 0.09 * near;
  const fade0 = near < 0.35 ? 1 : near < 0.7 ? 0.35 : 0;
  const frame = (p: number, riseLeft: number, scale: number) =>
    `translateY(${round(drift(p) + rise * riseLeft)}${unit}) scale(${round(scale)})`;
  return {
    input: [0, start, mid, end, 1],
    transforms: [
      frame(0, 1, scale0),
      frame(start, 1, scale0),
      frame(mid, 0.3, scale0 + (1 - scale0) * 0.75),
      frame(end, 0, 1),
      frame(1, 0, 1),
    ],
    opacities: [fade0, fade0, round(fade0 + (1 - fade0) * 0.8), 1, 1],
  };
}

/**
 * One depth plane of a ParallaxScene (and/or PointerTracker). Moves only with transforms
 * (on the compositor where scroll-driven animations are supported); outside a scene, before
 * hydration and under reduced motion it simply renders in place.
 */
export function ParallaxLayer({ children, depth, pointer = 1, fill = true, className, style }: ParallaxLayerProps) {
  const scene = useContext(ParallaxContext);
  const tracker = useContext(PointerContext);
  const reduce = useReducedMotion();
  const fallback = useMotionValue(0);
  const progress = scene?.progress ?? fallback;

  const keyframes = useMemo(() => layerKeyframes(scene, depth), [scene, depth]);
  const transform = useTransform(progress, keyframes.input, keyframes.transforms);
  const opacity = useTransform(progress, keyframes.input, keyframes.opacities);

  const pointerX = tracker?.x ?? fallback;
  const pointerY = tracker?.y ?? fallback;
  const shift = POINTER_SHIFT * depth * pointer;
  const x = useTransform(() => pointerX.get() * shift);
  const y = useTransform(() => pointerY.get() * shift);

  const moving = Boolean(scene?.ready) && reduce !== true;
  const position = fill ? "pointer-events-none absolute inset-0" : "relative";
  return (
    <m.div
      className={cn(position, moving && "will-change-transform", className)}
      style={{
        ...style,
        transform: moving ? transform : style?.transform,
        opacity: moving && scene?.entrance ? opacity : style?.opacity,
      }}
    >
      <m.div className={fill ? "absolute inset-0" : "relative"} style={tracker?.enabled ? { x, y } : undefined}>
        {children}
      </m.div>
    </m.div>
  );
}
