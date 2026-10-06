"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useMotionValue, useReducedMotion, useScroll, type MotionValue } from "motion/react";

import { cn } from "@/lib/cn";
import { ParallaxContext, useIsClient, type ParallaxContextValue, type ParallaxEntrance } from "./context";
import { useScrollActivity } from "./scroll-activity";

/** 1 while motion is allowed, 0 under prefers-reduced-motion. */
export function useMotionFactor(): MotionValue<number> {
  const reduce = useReducedMotion();
  const factor = useMotionValue(1);
  useEffect(() => {
    factor.set(reduce ? 0 : 1);
  }, [reduce, factor]);
  return factor;
}

export type ParallaxSceneProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  /**
   * "top": for a section at the top of the page (the hero). Layers start at their designed
   * position and drift as the section scrolls away.
   * "center" (default): layers line up when the section is centred in the viewport.
   */
  anchor?: "top" | "center";
  /** Travel in px of a depth-1 layer over the whole scroll range. Default 160. */
  distance?: number;
  /**
   * Travel of a depth-1 layer over the whole range as a fraction of the layer's own height
   * (e.g. 0.3). Preferred for art: the drift scales with the rendered size, so phones get a
   * lighter amplitude. Overrides `distance`.
   */
  travel?: number;
  /**
   * Which element's scroll position drives the layers: the scene itself (default) or its
   * closest <section>, e.g. so a hero's art starts drifting with the very first scroll even
   * when it sits below the headline on phones.
   */
  track?: "self" | "section";
  /** Layered entrance as the scene scrolls in (see ParallaxEntrance). */
  entrance?: ParallaxEntrance;
  /** Rendered element; defaults to a div. */
  as?: "div" | "section" | "figure";
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/**
 * Tracks its own scroll position and drives the ParallaxLayers inside it. The layers move
 * with transforms only and, where the browser supports scroll-driven animations, on the
 * compositor (a native ViewTimeline), so they stay smooth on phones even while the main
 * thread is busy. Under prefers-reduced-motion every layer stays at its designed position.
 */
export function ParallaxScene({
  children,
  className,
  id,
  anchor = "center",
  distance = 160,
  travel,
  track = "self",
  entrance,
  as: Tag = "div",
  ...aria
}: ParallaxSceneProps) {
  const targetRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: anchor === "top" ? ["start start", "end start"] : ["start end", "end start"],
  });
  const factor = useMotionFactor();
  const ready = useIsClient();
  useScrollActivity();
  const value = useMemo<ParallaxContextValue>(
    () => ({ progress: scrollYProgress, rest: anchor === "top" ? 0 : 0.5, distance, travel, factor, ready, entrance }),
    [scrollYProgress, anchor, distance, travel, factor, ready, entrance],
  );
  return (
    <ParallaxContext.Provider value={value}>
      <Tag
        ref={(node: HTMLElement | null) => {
          targetRef.current = track === "section" ? (node?.closest("section") ?? node) : node;
        }}
        id={id}
        // Positioned by default (layers are absolute); an explicit position in className wins.
        className={cn(/(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? "") ? undefined : "relative", className)}
        {...aria}
      >
        {children}
      </Tag>
    </ParallaxContext.Provider>
  );
}
