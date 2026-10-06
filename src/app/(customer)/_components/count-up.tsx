"use client";

import { useSyncExternalStore } from "react";

import { AnimatedNumber, type AnimatedNumberFormat } from "@/components/motion/animated-number";
import { formatCents } from "@/lib/format";

// AnimatedNumber for content that streams in after the root layout has hydrated (pages with
// a loading state): during hydration it renders exactly the server's text, and only then
// hands over to AnimatedNumber, which counts up (in view) or waits until scrolled to.

const subscribe = () => () => {};

function staticText(value: number, format: AnimatedNumberFormat): string {
  if (format === "cents") return formatCents(Math.round(value));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function CountUp({
  value,
  format = "integer",
  duration,
  className,
}: {
  value: number;
  format?: Extract<AnimatedNumberFormat, "integer" | "cents">;
  duration?: number;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!hydrated) {
    const text = staticText(value, format);
    return (
      <span className={className}>
        <span aria-hidden="true" className="tabular">
          {text}
        </span>
        <span className="sr-only">{text}</span>
      </span>
    );
  }
  return <AnimatedNumber value={value} format={format} duration={duration} className={className} />;
}
