"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { markHydrated } from "./hydration";

/**
 * Root motion setup (rendered once by the root layout): LazyMotion with the small
 * `domAnimation` feature bundle (non-strict, so `motion.*` also works, but prefer `m.*`), and
 * MotionConfig reducedMotion="user" so transform animations stop when the OS asks for
 * reduced motion. `layout`/drag features are not loaded.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    markHydrated();
  }, []);

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
