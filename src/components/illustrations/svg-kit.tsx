import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { AmbientStyles } from "./ambient";
import { ink, neon } from "./palette";

/** Props every illustration accepts. */
export type IllustrationProps = {
  /** Accessible name (role="img"). Each illustration has a sensible default. */
  title?: string;
  /** Longer accessible description. */
  desc?: string;
  /**
   * Hide from assistive technology when nearby text already says the same thing
   * (empty states, cards with a heading). Defaults to false.
   */
  decorative?: boolean;
  /** Size with a width class (e.g. `w-40`); the height follows the viewBox. */
  className?: string;
  /** Gentle ambient loops (float, twinkle, pulse). Always off under prefers-reduced-motion. */
  animated?: boolean;
};

/** Builds per-instance ids so gradients and filters never collide between copies. */
export function useSvgIds(): (name: string) => string {
  const base = `wm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (name: string) => `${base}-${name}`;
}

/** `url(#id)` helper. */
export function ref(id: string): string {
  return `url(#${id})`;
}

type IllustrationSvgProps = {
  viewBox: string;
  id: (name: string) => string;
  title: string;
  desc?: string;
  decorative?: boolean;
  className?: string;
  /** Fixed font stack (static renders); in the browser text inherits the page font. */
  fontFamily?: string;
  preserveAspectRatio?: string;
  children: ReactNode;
};

/** Root <svg> with the accessibility wiring shared by every illustration. */
export function IllustrationSvg({
  viewBox,
  id,
  title,
  desc,
  decorative = false,
  className,
  fontFamily,
  preserveAspectRatio,
  children,
}: IllustrationSvgProps) {
  const titleId = id("title");
  const descId = id("desc");
  return (
    <>
    <AmbientStyles />
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      className={cn("block h-auto max-w-full select-none", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : desc ? `${titleId} ${descId}` : titleId}
      focusable="false"
      fontFamily={fontFamily}
    >
      {decorative ? null : <title id={titleId}>{title}</title>}
      {decorative || !desc ? null : <desc id={descId}>{desc}</desc>}
      {children}
    </svg>
    </>
  );
}

/** Soft bloom: blurred copy under the source graphic. */
export function GlowFilter({ id, blur = 4, strength = 1 }: { id: string; blur?: number; strength?: number }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      {strength === 1 ? null : (
        <feComponentTransfer in="blur" result="blur">
          <feFuncA type="linear" slope={strength} />
        </feComponentTransfer>
      )}
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Pure blur (for light pools and volumetric beams). */
export function BlurFilter({ id, blur = 12 }: { id: string; blur?: number }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
      <feGaussianBlur stdDeviation={blur} />
    </filter>
  );
}

type Stop = readonly [offset: number, color: string, opacity?: number];

export function LinearGradient({
  id,
  stops,
  x1 = 0,
  y1 = 0,
  x2 = 1,
  y2 = 0,
  units,
  stopClassName,
}: {
  id: string;
  stops: readonly Stop[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  units?: "userSpaceOnUse";
  /** Class on every stop: a hook for theme-specific CSS (e.g. the daylight art). */
  stopClassName?: string;
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits={units}>
      {stops.map(([offset, color, opacity = 1]) => (
        <stop key={`${offset}-${color}`} offset={offset} stopColor={color} stopOpacity={opacity} className={stopClassName} />
      ))}
    </linearGradient>
  );
}

export function RadialGradient({
  id,
  stops,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
  fx,
  fy,
  units,
}: {
  id: string;
  stops: readonly Stop[];
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  units?: "userSpaceOnUse";
}) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r} fx={fx} fy={fy} gradientUnits={units}>
      {stops.map(([offset, color, opacity = 1]) => (
        <stop key={`${offset}-${color}`} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </radialGradient>
  );
}

/** Glass panel fill + luminous edge used by holographic cards. */
export function GlassDefs({ id }: { id: (name: string) => string }) {
  return (
    <>
      <LinearGradient
        id={id("glass")}
        x1={0}
        y1={0}
        x2={0.35}
        y2={1}
        stops={[
          [0, "#1d2b6b", 0.88],
          [0.55, ink.navy, 0.9],
          [1, ink.deep, 0.94],
        ]}
      />
      <LinearGradient
        id={id("edge")}
        x1={0}
        y1={0}
        x2={1}
        y2={1}
        stops={[
          [0, neon.cyanSoft, 0.95],
          [0.5, neon.blueSoft, 0.35],
          [1, neon.violet, 0.9],
        ]}
      />
      <LinearGradient
        id={id("sheen")}
        x1={0}
        y1={0}
        x2={0}
        y2={1}
        stops={[
          [0, "#ffffff", 0.16],
          [0.4, "#ffffff", 0.02],
          [1, "#ffffff", 0],
        ]}
      />
    </>
  );
}

/** Map-pin path: round head of radius r centred on (cx, cy), tip below. */
export function pinPath(cx: number, cy: number, r: number): string {
  const tip = cy + r * 2.25;
  return [
    `M${cx} ${tip}`,
    `C${cx - r * 0.35} ${cy + r * 1.55} ${cx - r} ${cy + r * 0.95} ${cx - r} ${cy}`,
    `A${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `C${cx + r} ${cy + r * 0.95} ${cx + r * 0.35} ${cy + r * 1.55} ${cx} ${tip}Z`,
  ].join(" ");
}

/** Gear outline with `teeth` square-ish teeth. */
export function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const parts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    const points: Array<[number, number]> = [
      [a - step * 0.25, inner],
      [a - step * 0.16, outer],
      [a + step * 0.16, outer],
      [a + step * 0.25, inner],
    ];
    for (const [angle, radius] of points) {
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      parts.push(`${parts.length === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  }
  return `${parts.join(" ")}Z`;
}

/** Deterministic pseudo-random generator (same art on server, client and in static renders). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Round to 1 decimal to keep path data short. */
export function r1(value: number): number {
  return Math.round(value * 10) / 10;
}
