"use client";

import { m, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { useMountedInHydration } from "./hydration";

type InViewTag = "div" | "section" | "article" | "li" | "ul" | "span" | "header" | "figure";

const motionTags = {
  div: m.div,
  section: m.section,
  article: m.article,
  li: m.li,
  ul: m.ul,
  span: m.span,
  header: m.header,
  figure: m.figure,
} as const;

export type InViewVariant = "slide-up" | "fade" | "scale" | "slide-left" | "slide-right";

const variantsByName: Record<InViewVariant, Variants> = {
  "slide-up": { hidden: { opacity: 0, y: 28 }, shown: { opacity: 1, y: 0 } },
  fade: { hidden: { opacity: 0 }, shown: { opacity: 1 } },
  scale: { hidden: { opacity: 0, scale: 0.94 }, shown: { opacity: 1, scale: 1 } },
  "slide-left": { hidden: { opacity: 0, x: 32 }, shown: { opacity: 1, x: 0 } },
  "slide-right": { hidden: { opacity: 0, x: -32 }, shown: { opacity: 1, x: 0 } },
};

type InViewProps = {
  as?: InViewTag;
  variant?: InViewVariant;
  /** Seconds. */
  delay?: number;
  /** Seconds. */
  duration?: number;
  /** Fraction of the element that must be visible (0–1). */
  amount?: number;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children?: ReactNode;
};

/**
 * Reveals its content when it scrolls into view. On the first page load it uses a CSS
 * scroll timeline (content is never hidden while JavaScript loads); after client-side
 * navigations it uses Motion's whileInView. Reduced motion shows the final state.
 */
export function InView({
  as = "div",
  variant = "slide-up",
  delay = 0,
  duration = 0.6,
  amount = 0.2,
  className,
  children,
  ...rest
}: InViewProps) {
  // Decided once at mount: server and hydration renders must match the server markup.
  const animateWithJs = !useMountedInHydration();
  const Component = motionTags[as] as unknown as typeof m.div;

  if (!animateWithJs) {
    return (
      <Component {...rest} data-reveal="" className={cn(variant === "scale" ? "reveal-scale" : "reveal", className)}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      {...rest}
      data-reveal=""
      className={className}
      variants={variantsByName[variant]}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}
