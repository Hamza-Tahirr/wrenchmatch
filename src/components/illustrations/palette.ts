// Shared colours for every WrenchMatch illustration: deep-space navy grounds, electric
// cyan / violet / blue neon used as accents, warm amber only for warning lights.
// Kept as plain hex strings so the same art renders in the browser and in sharp (librsvg).

export const ink = {
  void: "#03050f",
  night: "#060a1c",
  deep: "#0a1029",
  navy: "#0d1536",
  navy2: "#121c47",
  steel: "#1a2559",
  slate: "#26336e",
  line: "#33448a",
  mist: "#8fa3d9",
  ice: "#dff7ff",
  white: "#f5f9ff",
} as const;

export const neon = {
  cyan: "#22d3ee",
  cyanSoft: "#67e8f9",
  cyanDeep: "#0891b2",
  blue: "#3b82f6",
  blueSoft: "#7aa7ff",
  violet: "#8b5cf6",
  violetSoft: "#b4a2ff",
  magenta: "#e879f9",
  amber: "#fbbf24",
  orange: "#fb923c",
  rose: "#fb7185",
  red: "#f43f5e",
  green: "#34d399",
  greenSoft: "#6ee7b7",
} as const;

export type Tone = "cyan" | "violet" | "amber" | "emerald" | "rose";

/** Primary + secondary glow colour for each tone. */
export const toneColors: Record<Tone, { main: string; soft: string; alt: string }> = {
  cyan: { main: neon.cyan, soft: neon.cyanSoft, alt: neon.violet },
  violet: { main: neon.violet, soft: neon.violetSoft, alt: neon.cyan },
  amber: { main: neon.amber, soft: "#fde68a", alt: neon.orange },
  emerald: { main: neon.green, soft: neon.greenSoft, alt: neon.cyan },
  rose: { main: neon.rose, soft: "#fecdd3", alt: neon.violet },
};

/** Font stacks used by text inside illustrations (the browser inherits Geist from the page). */
export const artFont = {
  sans: "var(--font-geist-sans, 'Segoe UI'), 'Segoe UI', system-ui, sans-serif",
  mono: "var(--font-geist-mono, Consolas), Consolas, 'SFMono-Regular', monospace",
} as const;
