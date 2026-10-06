"use client";

import { createContext, useCallback, useSyncExternalStore } from "react";
import type { MotionValue } from "motion/react";

/**
 * Layered entrance for a scene scrolling into view (the phone "How it works" story): each
 * layer rises, scales up and fades in over its own slice of the scroll, background first and
 * foreground last, then keeps drifting with the parallax.
 */
export type ParallaxEntrance = {
  /** Scroll progress (0 → 1) at which the first (farthest) layer starts arriving. */
  start: number;
  /** Extra delay for the nearest layer (the delay grows linearly with closeness). */
  stagger: number;
  /** Progress each layer takes to arrive. */
  span: number;
};

/** Scroll state shared by a ParallaxScene (or a story scene) with its layers. */
export type ParallaxContextValue = {
  /** Scroll progress of the scene, 0 → 1. */
  progress: MotionValue<number>;
  /** Progress at which every layer sits at its designed position. */
  rest: number;
  /** Travel in px of a depth-1 layer across the whole 0 → 1 range (used without `travel`). */
  distance: number;
  /**
   * Travel of a depth-1 layer across the whole range as a fraction of the layer's own height
   * (resolution independent, so the same art drifts less on a small phone). Overrides
   * `distance` when set.
   */
  travel?: number;
  /** 1 when motion is allowed, 0 under prefers-reduced-motion (layers stay put). */
  factor: MotionValue<number>;
  /**
   * False during server rendering and hydration: layers render at their designed position
   * and only start following the scroll once the client has measured the scene.
   */
  ready: boolean;
  /** Optional layered entrance (see ParallaxEntrance). */
  entrance?: ParallaxEntrance;
};

export const ParallaxContext = createContext<ParallaxContextValue | null>(null);

/** Normalised pointer position over a PointerTracker: -1 (left/top) → 1 (right/bottom). */
export type PointerContextValue = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** False on touch devices and under prefers-reduced-motion. */
  enabled: boolean;
};

export const PointerContext = createContext<PointerContextValue | null>(null);

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

function subscribeFinePointer(onChange: () => void): () => void {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True for a mouse or trackpad (never on the server or on touch-only screens). */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}

/** Whether a media query matches (always false on the server and while hydrating). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noopSubscribe = () => () => {};

/** False on the server and while hydrating, true afterwards (a re-render follows hydration). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
