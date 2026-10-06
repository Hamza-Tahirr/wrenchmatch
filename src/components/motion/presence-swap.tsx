"use client";

import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";

type PresenceSwapProps = {
  /** Change it to animate the old content out and the new content in. */
  swapKey: string | number;
  variant?: "fade" | "slide" | "scale";
  className?: string;
  children: ReactNode;
};

const variants = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slide: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } },
  scale: { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.98 } },
} as const;

/** Cross-fades between states (e.g. a form and its success message). Client only. */
export function PresenceSwap({ swapKey, variant = "slide", className, children }: PresenceSwapProps) {
  const v = variants[variant];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={swapKey}
        className={className}
        initial={v.initial}
        animate={v.animate}
        exit={v.exit}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
