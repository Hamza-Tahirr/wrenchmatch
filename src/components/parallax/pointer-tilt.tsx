"use client";

import { useContext, useMemo, type PointerEvent, type ReactNode } from "react";
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

import { cn } from "@/lib/cn";
import { PointerContext, useFinePointer, type PointerContextValue } from "./context";

const SPRING = { stiffness: 140, damping: 22, mass: 0.6 } as const;

export type PointerTrackerProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Measures the mouse position over its area (normalised -1 → 1, spring-smoothed) for the
 * Tilt and ParallaxLayers inside it. Inactive on touch screens and under reduced motion.
 */
export function PointerTracker({ children, className }: PointerTrackerProps) {
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const enabled = fine && reduce !== true;
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, SPRING);
  const y = useSpring(rawY, SPRING);
  const value = useMemo<PointerContextValue>(() => ({ x, y, enabled }), [x, y, enabled]);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || event.pointerType === "touch") {
      rawX.set(0);
      rawY.set(0);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    rawX.set(Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)));
    rawY.set(Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)));
  }

  function handleLeave() {
    rawX.set(0);
    rawY.set(0);
  }

  return (
    <PointerContext.Provider value={value}>
      {/* No pointer handlers at all on touch screens: nothing runs while a finger scrolls. */}
      <div
        className={className}
        onPointerMove={enabled ? handleMove : undefined}
        onPointerLeave={enabled ? handleLeave : undefined}
      >
        {children}
      </div>
    </PointerContext.Provider>
  );
}

export type TiltProps = {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees at the tracker's edge. Default 4. */
  max?: number;
};

/** Rotates its content in 3D following the nearest PointerTracker. */
export function Tilt({ children, className, max = 4 }: TiltProps) {
  const tracker = useContext(PointerContext);
  const zero = useMotionValue(0);
  // The tracker leaves x/y at 0 on touch screens and under reduced motion.
  const px = tracker?.x ?? zero;
  const py = tracker?.y ?? zero;
  const rotateY = useTransform(() => px.get() * max);
  const rotateX = useTransform(() => -py.get() * max);
  return (
    <div className={cn("[perspective:1600px]", className)}>
      <m.div className="relative size-full will-change-transform [transform-style:preserve-3d]" style={{ rotateX, rotateY }}>
        {children}
      </m.div>
    </div>
  );
}

export type PointerTiltProps = TiltProps;

/** PointerTracker + Tilt for a single card or scene. */
export function PointerTilt({ children, className, max }: PointerTiltProps) {
  return (
    <PointerTracker className={className}>
      <Tilt max={max} className="size-full">
        {children}
      </Tilt>
    </PointerTracker>
  );
}
