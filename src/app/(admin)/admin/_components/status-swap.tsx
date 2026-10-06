"use client";

import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";

/**
 * Animates a status chip when the status changes (after an admin action refreshes the page):
 * the old chip drops out, the new one pops in under a brief glow. Transform and opacity only;
 * reduced motion swaps instantly (MotionConfig in the root layout).
 */
export function StatusSwap({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span className="relative inline-grid">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={status}
          className="relative col-start-1 row-start-1 inline-flex"
          initial={{ opacity: 0, scale: 0.6, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 6 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          <m.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1.5 rounded-full bg-neon-cyan/25 blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          {children}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
