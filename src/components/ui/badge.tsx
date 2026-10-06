import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-fg/[0.06] text-fg-muted ring-line-strong",
  info: "bg-neon-cyan/10 text-brand-800 ring-neon-cyan/30 shadow-[0_0_14px_-6px_var(--color-neon-cyan)]",
  success: "bg-success-500/12 text-success-800 ring-success-500/35 shadow-[0_0_14px_-6px_var(--color-success-500)]",
  warning: "bg-warning-500/12 text-warning-800 ring-warning-500/35 shadow-[0_0_14px_-6px_var(--color-warning-500)]",
  danger: "bg-danger-500/12 text-danger-800 ring-danger-500/35 shadow-[0_0_14px_-6px_var(--color-danger-500)]",
};

const dotTones: Record<BadgeTone, string> = {
  neutral: "bg-fg-subtle",
  info: "bg-neon-cyan shadow-[0_0_8px_var(--color-neon-cyan)]",
  success: "bg-success-600 shadow-[0_0_8px_var(--color-success-600)]",
  warning: "bg-warning-600 shadow-[0_0_8px_var(--color-warning-600)]",
  danger: "bg-danger-600 shadow-[0_0_8px_var(--color-danger-600)]",
};

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0";

export type BadgeProps = {
  tone?: BadgeTone;
  /** Optional icon element shown before the text. */
  icon?: ReactNode;
  /** A glowing status dot before the text (`"pulse"` animates it for live states). */
  dot?: boolean | "pulse";
  className?: string;
  children: ReactNode;
};

/** Short status label (a neon chip). Always pair color with text; the tone is never the only signal. */
export function Badge({ tone = "neutral", icon, dot = false, className, children }: BadgeProps) {
  return (
    <span className={cn(badgeBase, tones[tone], className)}>
      {dot ? (
        <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
          {dot === "pulse" ? (
            <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", dotTones[tone])} />
          ) : null}
          <span className={cn("relative size-1.5 rounded-full", dotTones[tone])} />
        </span>
      ) : null}
      {icon}
      {children}
    </span>
  );
}

export type DemoBadgeProps = {
  description?: string;
  className?: string;
};

/**
 * @deprecated Presentation mode (3 Oct 2026): the UI shows no "DEMO" labels. Seeded records
 * keep `is_demo_fixture = 1` internally. This renders nothing; remove it from pages.
 */
export function DemoBadge(props: DemoBadgeProps): null {
  void props;
  return null;
}
