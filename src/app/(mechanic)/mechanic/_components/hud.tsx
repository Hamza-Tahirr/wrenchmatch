import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { TAP_WITHIN } from "./tap";

// The mechanic area's futuristic building blocks (server-safe, CSS-only motion): the page
// hero with its holographic title, glass panels with a neon icon tile, and small HUD labels.
// Colors come from the semantic tokens in src/app/globals.css (docs/UI.md).

/** Four thin neon corner brackets around a panel (decorative). */
export function HudCorners({ className }: { className?: string }) {
  const corner = "absolute size-4 border-neon-cyan/60";
  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute inset-2 sm:inset-3", className)}>
      <span className={cn(corner, "top-0 left-0 rounded-tl-lg border-t border-l")} />
      <span className={cn(corner, "top-0 right-0 rounded-tr-lg border-t border-r")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-lg border-b border-l")} />
      <span className={cn(corner, "right-0 bottom-0 rounded-br-lg border-r border-b")} />
    </span>
  );
}

/** Small monospace HUD label, e.g. "JOB 7F3A" or "LIVE". */
export function HudLabel({ children, className, tone = "cyan" }: { children: ReactNode; className?: string; tone?: "cyan" | "violet" | "muted" }) {
  return (
    <span
      className={cn(
        "font-mono text-[0.6875rem] font-semibold tracking-[0.18em] uppercase",
        tone === "cyan" ? "text-neon-cyan" : tone === "violet" ? "text-neon-violet" : "text-fg-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A pulsing status dot ("live"), colored by tone. */
export function LiveDot({ tone = "success", className }: { tone?: "success" | "warning" | "danger" | "cyan"; className?: string }) {
  const color = {
    success: "bg-success-600",
    warning: "bg-warning-600",
    danger: "bg-danger-600",
    cyan: "bg-neon-cyan",
  }[tone];
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-2.5 shrink-0", className)}>
      <span className={cn("absolute inset-0 rounded-full opacity-70 motion-safe:animate-pulse-ring", color)} />
      <span className={cn("relative inline-flex size-2.5 rounded-full shadow-[0_0_10px_currentColor]", color)} />
    </span>
  );
}

type MechanicHeroProps = {
  title: ReactNode;
  /** Short monospace line above the title, e.g. "Mechanic console". */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Badges under the title. */
  meta?: ReactNode;
  /** Buttons aligned to the end on wide screens. */
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Decorative art shown on the right on wide screens (aria-hidden). */
  art?: ReactNode;
  /** Extra content inside the hero, below the description (e.g. stats). */
  children?: ReactNode;
  className?: string;
};

/**
 * The page's single h1 in a glass "command deck": aurora glow, a faint moving grid, neon
 * corner brackets and a holographic title. Static under reduced motion.
 */
export function MechanicHero({ title, eyebrow, description, meta, actions, back, art, children, className }: MechanicHeroProps) {
  return (
    <header
      className={cn(
        "glass aurora grid-bg relative isolate overflow-hidden rounded-3xl px-4 py-6 sm:px-8 sm:py-8",
        "animate-fade-in",
        className,
      )}
    >
      <HudCorners />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/70 to-transparent"
      />
      {art ? (
        <div aria-hidden="true" className="pointer-events-none absolute top-1/2 right-8 hidden -translate-y-1/2 lg:block">
          {art}
        </div>
      ) : null}
      <div className={cn("relative min-w-0", art ? "lg:pr-64 xl:pr-72" : null)}>
        {back ? (
          <Link
            href={back.href}
            className="group mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface/60 px-3.5 text-sm font-medium text-fg-muted transition-colors hover:border-neon-cyan/50 hover:text-fg sm:min-h-9 sm:px-3"
          >
            <ArrowLeft aria-hidden="true" className="size-4 transition-transform group-hover:-translate-x-0.5" />
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            {eyebrow ? (
              <p className="flex items-center gap-2">
                <LiveDot tone="cyan" className="size-2" />
                <HudLabel>{eyebrow}</HudLabel>
              </p>
            ) : null}
            <h1 className="holo-text font-display text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl lg:text-[2.75rem]">
              {title}
            </h1>
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
            {description ? <div className="max-w-2xl text-base text-pretty text-fg-muted">{description}</div> : null}
          </div>
          {actions ? <div className={cn("flex shrink-0 flex-wrap gap-2 lg:justify-end", TAP_WITHIN)}>{actions}</div> : null}
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </header>
  );
}

type PanelProps = {
  /** Anchor id; the title gets `${id}-title`. */
  id?: string;
  title: ReactNode;
  titleAs?: "h2" | "h3";
  /** Monospace label above the title. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Icon element for the neon tile. */
  icon?: ReactNode;
  actions?: ReactNode;
  /** Accent of the icon tile and the top edge. */
  tone?: "cyan" | "violet" | "success" | "warning" | "danger";
  /** Use the heavier blurred glass (for a few hero panels; lists use the cheap default). */
  strong?: boolean;
  as?: "section" | "div" | "article" | "aside";
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

const PANEL_TONES = {
  cyan: { tile: "text-neon-cyan bg-neon-cyan/10 ring-neon-cyan/30 shadow-glow-sm", edge: "via-neon-cyan/60" },
  violet: { tile: "text-neon-violet bg-neon-violet/10 ring-neon-violet/30 shadow-glow-violet", edge: "via-neon-violet/60" },
  success: { tile: "text-success-600 bg-success-600/10 ring-success-600/30 shadow-glow-success", edge: "via-success-600/60" },
  warning: { tile: "text-warning-600 bg-warning-600/10 ring-warning-600/30", edge: "via-warning-600/60" },
  danger: { tile: "text-danger-600 bg-danger-600/10 ring-danger-600/30 shadow-glow-danger", edge: "via-danger-600/60" },
} as const;

/** A glass section with a neon icon tile, title, description and actions. */
export function Panel({
  id,
  title,
  titleAs: Title = "h2",
  eyebrow,
  description,
  icon,
  actions,
  tone = "cyan",
  strong = false,
  as: Tag = "section",
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const titleId = id ? `${id}-title` : undefined;
  const toneClasses = PANEL_TONES[tone];
  return (
    <Tag
      id={id}
      aria-labelledby={Tag === "section" || Tag === "aside" ? titleId : undefined}
      className={cn(
        strong ? "glass" : "glass-lite",
        "relative scroll-mt-28 overflow-hidden rounded-2xl",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent", toneClasses.edge)}
      />
      <div className="flex flex-col gap-3 px-4 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className={cn("grid size-10 shrink-0 place-items-center rounded-xl ring-1 [&_svg]:size-5", toneClasses.tile)}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1">
            {eyebrow ? <HudLabel tone="muted">{eyebrow}</HudLabel> : null}
            <Title id={titleId} className="font-display text-lg font-semibold tracking-tight text-fg">
              {title}
            </Title>
            {description ? <div className="text-sm text-pretty text-fg-muted">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className={cn("flex shrink-0 flex-wrap items-center gap-2", TAP_WITHIN)}>{actions}</div> : null}
      </div>
      <div className={cn("px-4 pt-4 pb-5 sm:px-6 sm:pb-6", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** A thin glowing divider with an optional centered label. */
export function NeonDivider({ label, className }: { label?: ReactNode; className?: string }) {
  if (!label) {
    return (
      <span
        aria-hidden="true"
        className={cn("block h-px w-full bg-gradient-to-r from-transparent via-line-strong to-transparent", className)}
      />
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent to-line-strong" />
      <HudLabel tone="muted">{label}</HudLabel>
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-l from-transparent to-line-strong" />
    </div>
  );
}

type EmptyPanelProps = {
  /** A spot illustration (decorative), e.g. <NoJobs decorative className="w-40" />. */
  art?: ReactNode;
  title: ReactNode;
  titleAs?: "h2" | "h3";
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** An honest empty state: illustration, what is going on, and the next step. */
export function EmptyPanel({ art, title, titleAs: Title = "h3", children, action, className }: EmptyPanelProps) {
  return (
    <div
      className={cn(
        "glass-lite relative overflow-hidden rounded-2xl px-5 py-8 text-center sm:px-10 sm:py-10",
        "animate-scale-in",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/50 to-transparent"
      />
      {art ? <div className="mx-auto flex justify-center">{art}</div> : null}
      <Title className="mt-4 font-display text-lg font-semibold tracking-tight text-fg">{title}</Title>
      {children ? <div className="mx-auto mt-2 max-w-lg text-sm text-pretty text-fg-muted">{children}</div> : null}
      {action ? <div className={cn("mt-6 flex flex-wrap justify-center gap-2", TAP_WITHIN)}>{action}</div> : null}
    </div>
  );
}

/** A compact fact chip with a neon icon (job cards, headers). */
export function FactChip({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <li
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-xs text-fg-muted ring-1 ring-line",
        className,
      )}
    >
      <span aria-hidden="true" className="shrink-0 text-neon-cyan/90 [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}
