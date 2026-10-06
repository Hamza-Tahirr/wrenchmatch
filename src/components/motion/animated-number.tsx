"use client";

import { useEffect, useRef, useState } from "react";

import { formatCents } from "@/lib/format";

import { prefersReducedMotion, useMountedInHydration } from "./hydration";

export type AnimatedNumberFormat = "integer" | "decimal" | "cents" | "percent" | "compact";

type AnimatedNumberProps = {
  value: number;
  /**
   * integer (1,234) · decimal (1,234.5, see `decimals`) · cents (integer cents → $12.34) ·
   * percent (0.42 → 42%) · compact (1.2K).
   */
  format?: AnimatedNumberFormat;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Seconds. */
  duration?: number;
  className?: string;
};

function formatValue(value: number, format: AnimatedNumberFormat, decimals: number): string {
  switch (format) {
    case "cents":
      return formatCents(Math.round(value));
    case "percent":
      return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: decimals }).format(value);
    case "compact":
      return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    case "decimal":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    default:
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
  }
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

// Values already shown in this tab (format + value). A value counts up from zero only the
// first time it appears; navigating back to a page shows it at once instead of re-counting.
const seen = new Set<string>();
const seenKey = (value: number, format: AnimatedNumberFormat) => `${format}:${value}`;

/**
 * A number that counts up when it scrolls into view (and animates between values when it
 * changes). The server renders the final value, screen readers always get the final value,
 * and reduced motion shows it without animating. A value counts up from zero only the first
 * time it appears in the tab (no re-count after every navigation); money (format="cents")
 * never counts up from zero, it only tweens when the amount changes in place (live totals).
 */
export function AnimatedNumber({
  value,
  format = "integer",
  decimals = 1,
  prefix = "",
  suffix = "",
  duration = 1.1,
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Mounted after hydration (client navigation): the count can start from zero without a flash.
  const mountedInHydration = useMountedInHydration();
  const [initial] = useState(() => {
    const countFromZero =
      !mountedInHydration && format !== "cents" && !seen.has(seenKey(value, format)) && !prefersReducedMotion();
    return countFromZero ? 0 : value;
  });
  const shown = useRef(initial);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = (n: number) => `${prefix}${formatValue(n, format, decimals)}${suffix}`;
    const from = shown.current;
    seen.add(seenKey(value, format));
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

    const rect = element.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (visible) {
      run(from);
    } else {
      // Below the fold: count when it scrolls into view.
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
  }, [value, format, decimals, prefix, suffix, duration]);

  const finalText = `${prefix}${formatValue(value, format, decimals)}${suffix}`;
  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular">
        {`${prefix}${formatValue(initial, format, decimals)}${suffix}`}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}
