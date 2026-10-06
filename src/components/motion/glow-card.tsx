"use client";

import { useRef, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { prefersReducedMotion } from "./hydration";

type GlowCardProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  as?: "div" | "li" | "article" | "section";
  /** Tilt in 3D toward the pointer (mouse only; off under reduced motion). */
  tilt?: boolean;
  /** Maximum tilt in degrees. */
  maxTilt?: number;
  glow?: "cyan" | "violet";
  children?: ReactNode;
};

const glowColors = {
  cyan: "var(--color-neon-cyan)",
  violet: "var(--color-neon-violet)",
} as const;

/**
 * A wrapper that lights up under the pointer (a soft neon spotlight following the mouse) and
 * optionally tilts in 3D. Style the card itself through `className` (e.g. "glass-lite
 * rounded-2xl p-6"). Pointer work is batched per animation frame and never re-renders React.
 */
export function GlowCard({
  as = "div",
  tilt = false,
  maxTilt = 6,
  glow = "cyan",
  className,
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const Component = as as "div";

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    const element = ref.current;
    if (!element || event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      element.style.setProperty("--mx", `${x}px`);
      element.style.setProperty("--my", `${y}px`);
      if (tilt && !prefersReducedMotion()) {
        const rotateX = (y / rect.height - 0.5) * -2 * maxTilt;
        const rotateY = (x / rect.width - 0.5) * 2 * maxTilt;
        element.style.transition = "transform 120ms ease-out";
        element.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
      }
    });
  };

  const handleLeave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    const element = ref.current;
    cancelAnimationFrame(frame.current);
    if (element && tilt) {
      element.style.transition = "transform 500ms cubic-bezier(0.16, 1, 0.3, 1)";
      element.style.transform = "";
    }
  };

  return (
    <Component
      {...rest}
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn("group/glow relative isolate", className)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/glow:opacity-100"
        style={{
          background: `radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklab, ${glowColors[glow]} 16%, transparent), transparent 46%)`,
        }}
      />
      {children}
    </Component>
  );
}

/** GlowCard with 3D tilt on by default. */
export function TiltCard(props: GlowCardProps) {
  return <GlowCard tilt {...props} />;
}
