import { cn } from "@/lib/cn";
import { AvatarImage } from "./avatar-image";

const sizes = {
  sm: { classes: "size-8 text-xs", px: 32 },
  md: { classes: "size-10 text-sm", px: 40 },
  lg: { classes: "size-14 text-lg", px: 56 },
  xl: { classes: "size-20 text-2xl", px: 80 },
} as const;

/** Up to two initials, ignoring parenthesised notes: "Marco R." → "MR", "Avery (Admin)" → "A". */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
  return initials || "?";
}

export type AvatarProps = {
  name: string;
  /** Image URL, e.g. a profile photo served by /api/files/[id]. Falls back to initials. */
  src?: string | null;
  size?: keyof typeof sizes;
  /** Set false when the avatar is shown without the person's name next to it. */
  decorative?: boolean;
  /** Neon glow ring (default true). */
  glow?: boolean;
  className?: string;
};

/** Round avatar with a neon ring: lazy-loaded photo, initials fallback (also when the photo fails). */
export function Avatar({ name, src, size = "md", decorative = true, glow = true, className }: AvatarProps) {
  const { classes: sizeClasses, px } = sizes[size];
  const classes = cn(
    "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-linear-to-br from-brand-200 via-brand-100 to-[oklch(0.32_0.12_295)] font-display font-semibold text-brand-950 ring-1 light:to-[oklch(0.86_0.07_295)]",
    glow ? "ring-neon-cyan/45 shadow-[0_0_18px_-6px_var(--color-neon-cyan)]" : "ring-line-strong",
    sizeClasses,
    className,
  );
  const initials = (
    <span aria-hidden="true" className="select-none">
      {initialsOf(name)}
    </span>
  );
  return (
    <span className={classes} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}>
      {initials}
      {src ? <AvatarImage src={src} size={px} /> : null}
    </span>
  );
}
