import { useId } from "react";

import { cn } from "@/lib/cn";

// A holographic radar for the job board hero (decorative, aria-hidden by its parent). Blips
// are the board's jobs placed by their real bearing and distance from the mechanic's base
// (both approximate ZIP centroids), so the art echoes the map. CSS-only motion: the sweep
// turns and the blips pulse; both stop under reduced motion.

export type RadarBlip = {
  /** Degrees clockwise from north. */
  bearing: number;
  /** 0 (at the base) to 1 (the outer ring). */
  distance: number;
  tone: "cyan" | "violet" | "success" | "warning" | "neutral";
};

const TONE_COLORS: Readonly<Record<RadarBlip["tone"], string>> = {
  cyan: "var(--color-neon-cyan)",
  violet: "var(--color-neon-violet)",
  success: "var(--color-success-600)",
  warning: "var(--color-warning-600)",
  neutral: "var(--color-slate-500)",
};

const SIZE = 240;
const C = SIZE / 2;
const R = 104;

export function RadarArt({ blips, className }: { blips: readonly RadarBlip[]; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={cn("w-56", className)} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-neon-cyan)" stopOpacity="0.18" />
          <stop offset="60%" stopColor="var(--color-neon-blue)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--color-neon-violet)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-neon-cyan)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--color-neon-cyan)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 12} fill={`url(#${id}-bg)`} />
      {[1, 0.72, 0.44].map((scale) => (
        <circle key={scale} cx={C} cy={C} r={R * scale} stroke="var(--color-neon-cyan)" strokeOpacity={0.28} strokeWidth={1} />
      ))}
      <circle cx={C} cy={C} r={R} stroke="var(--color-neon-cyan)" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="2 6" />
      <path d={`M${C - R} ${C}H${C + R}M${C} ${C - R}V${C + R}`} stroke="var(--color-neon-cyan)" strokeOpacity={0.16} />
      {/* Tick marks every 30 degrees. */}
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * Math.PI) / 6;
        const x1 = C + Math.sin(angle) * (R + 4);
        const y1 = C - Math.cos(angle) * (R + 4);
        const x2 = C + Math.sin(angle) * (R + 10);
        const y2 = C - Math.cos(angle) * (R + 10);
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-neon-cyan)" strokeOpacity={0.45} />;
      })}
      <g className="origin-center motion-safe:animate-[spin_6s_linear_infinite] [transform-box:view-box]">
        <path d={`M${C} ${C}L${C + R} ${C}A${R} ${R} 0 0 0 ${C + R * Math.cos(-0.9)} ${C + R * Math.sin(-0.9)}Z`} fill={`url(#${id}-sweep)`} />
        <line x1={C} y1={C} x2={C + R} y2={C} stroke="var(--color-neon-cyan)" strokeOpacity={0.9} strokeWidth={1.5} />
      </g>
      {blips.slice(0, 12).map((blip, index) => {
        const radians = (blip.bearing * Math.PI) / 180;
        const distance = Math.min(1, Math.max(0.12, blip.distance)) * (R - 8);
        const x = C + Math.sin(radians) * distance;
        const y = C - Math.cos(radians) * distance;
        const color = TONE_COLORS[blip.tone];
        return (
          <g key={`${index}-${blip.bearing.toFixed(1)}`}>
            <circle
              cx={x}
              cy={y}
              r={9}
              fill={color}
              opacity={0.25}
              className="origin-center motion-safe:animate-glow-pulse [transform-box:fill-box]"
              style={{ animationDelay: `${index * 0.4}s` }}
            />
            <circle cx={x} cy={y} r={3.5} fill={color} />
          </g>
        );
      })}
      <rect
        x={C - 6}
        y={C - 6}
        width={12}
        height={12}
        rx={2.5}
        transform={`rotate(45 ${C} ${C})`}
        fill="var(--color-neon-violet)"
        stroke="var(--color-fg)"
        strokeOpacity={0.7}
      />
    </svg>
  );
}

/** Bearing in degrees from `from` to `to` (both lat/lng in degrees), clockwise from north. */
export function bearingDegrees(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
