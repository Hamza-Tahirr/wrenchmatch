"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { prefersReducedMotion } from "@/components/motion/hydration";
import { formatCents } from "@/lib/format";

// A number that counts up (and animates between values when it changes). It renders the
// final value on the server and during hydration (useSyncExternalStore's server snapshot),
// so streamed pages never mismatch; a fresh mount after a client navigation counts from 0,
// a hydrated number below the fold counts when it scrolls into view, and reduced motion
// shows the value without animating. Screen readers always get the final value.

const subscribe = () => () => {};

type CountUpProps = {
  value: number;
  /** "integer" (1,234) or "cents" (integer cents → $12.34). */
  format?: "integer" | "cents";
  /** Seconds. */
  duration?: number;
  className?: string;
};

function formatValue(value: number, format: "integer" | "cents"): string {
  return format === "cents"
    ? formatCents(Math.round(value))
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function CountUp({ value, format = "integer", duration = 1, className }: CountUpProps) {
  const clientRender = useSyncExternalStore(subscribe, () => true, () => false);
  // Decided once: a fresh client mount may start from 0; a hydrated one starts at the value.
  const [freshMount] = useState(clientRender);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = (n: number) => formatValue(n, format);
    const box = element.getBoundingClientRect();
    const visible = box.bottom > 0 && box.top < window.innerHeight;
    // Later changes animate from what is shown; a fresh mount from 0; a hydrated number only
    // when it is still below the fold (no visible jump back to 0).
    const from = shown.current ?? (freshMount || !visible ? 0 : value);
    if (from === value || prefersReducedMotion()) {
      shown.current = value;
      element.textContent = text(value);
      return;
    }
    let frame = 0;
    let observer: IntersectionObserver | undefined;
    const run = (start: number) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        // The frame timestamp can precede startedAt; clamp so the count never dips below its start ("-0").
        const progress = Math.min(1, Math.max(0, (now - startedAt) / (duration * 1000)));
        const current = start + (value - start) * easeOutExpo(progress);
        shown.current = progress < 1 ? current : value;
        element.textContent = text(shown.current);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    // A changed value (a live total) always moves now; only the first count waits to be seen.
    if (visible || shown.current !== null) {
      run(from);
    } else {
      element.textContent = text(from);
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            run(from);
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(element);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [value, format, duration, freshMount]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular">
        {formatValue(freshMount && !prefersReducedMotionSafe() ? 0 : value, format)}
      </span>
      <span className="sr-only">{formatValue(value, format)}</span>
    </span>
  );
}

/** prefersReducedMotion() that is false on the server (render-safe). */
function prefersReducedMotionSafe(): boolean {
  return typeof window !== "undefined" && prefersReducedMotion();
}
