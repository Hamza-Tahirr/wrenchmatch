import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { SpotIllustration, type SpotIllustrationName } from "@/components/illustrations";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { GlowCard } from "@/components/motion/glow-card";
import { cn } from "@/lib/cn";

import { TAP_TARGET } from "../_lib/ui";

// The admin "operations console" building blocks: a page header with a holographic title,
// glass panels, KPI tiles with counting numbers, section headings and illustrated empty
// states. Server Components (KpiTile embeds two small client islands). Colors come only
// from the semantic tokens in src/app/globals.css.

export type ConsoleTone = "cyan" | "violet" | "success" | "warning" | "danger" | "neutral";

/** Hairline and icon colors per tone (decoration only; meaning is always in text). */
const toneStyles: Record<ConsoleTone, { line: string; icon: string }> = {
  cyan: {
    line: "via-neon-cyan/60",
    icon: "text-neon-cyan bg-neon-cyan/10 ring-neon-cyan/30 shadow-[0_0_18px_-6px_var(--color-neon-cyan)]",
  },
  violet: {
    line: "via-neon-violet/60",
    icon: "text-neon-violet bg-neon-violet/10 ring-neon-violet/30 shadow-[0_0_18px_-6px_var(--color-neon-violet)]",
  },
  success: {
    line: "via-success-500/60",
    icon: "text-success-700 bg-success-50 ring-success-300/50 shadow-[0_0_18px_-6px_var(--color-success-500)]",
  },
  warning: {
    line: "via-warning-500/60",
    icon: "text-warning-700 bg-warning-50 ring-warning-300/50 shadow-[0_0_18px_-6px_var(--color-warning-500)]",
  },
  danger: {
    line: "via-danger-500/60",
    icon: "text-danger-700 bg-danger-50 ring-danger-300/50 shadow-[0_0_18px_-6px_var(--color-danger-500)]",
  },
  neutral: {
    line: "via-fg-subtle/40",
    icon: "text-fg-muted bg-surface-2 ring-line-strong",
  },
};

/** A small square icon well in a tone (decorative). */
export function IconWell({ icon, tone = "cyan", size = "md" }: { icon: ReactNode; tone?: ConsoleTone; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-xl ring-1",
        size === "sm" ? "size-8 [&_svg]:size-4" : "size-10 [&_svg]:size-5",
        toneStyles[tone].icon,
      )}
    >
      {icon}
    </span>
  );
}

/** "← All mechanics": the way back to a record's list. */
export function ConsoleBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg",
        TAP_TARGET,
      )}
    >
      <ArrowLeft aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
      {label}
    </Link>
  );
}

type ConsoleHeaderProps = {
  /** Mono breadcrumb above the title, e.g. "Admin / Mechanics". */
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  /** Status chips under the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
};

/** The page's single h1: mono breadcrumb, holographic title, description, status row and actions. */
export function ConsoleHeader({ eyebrow, title, description, meta, actions, back }: ConsoleHeaderProps) {
  return (
    <header className="animate-fade-in space-y-3">
      {back ? <ConsoleBackLink href={back.href} label={back.label} /> : null}
      <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-neon-cyan uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-neon-cyan shadow-[0_0_10px_var(--color-neon-cyan)]" />
        {eyebrow}
      </p>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-pretty wrap-anywhere text-fg sm:text-4xl">
            <span className="holo-text">{title}</span>
          </h1>
          {description ? <div className="max-w-3xl text-sm text-fg-muted sm:text-base">{description}</div> : null}
          {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:[&>a]:flex-1 max-sm:[&>button]:flex-1">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

type PanelProps = {
  as?: "section" | "article" | "div" | "aside" | "li";
  title?: ReactNode;
  titleAs?: "h2" | "h3";
  description?: ReactNode;
  icon?: ReactNode;
  tone?: ConsoleTone;
  actions?: ReactNode;
  /** "glass" (blurred, for a few hero panels) or "lite" (no backdrop blur; lists and long pages). */
  variant?: "glass" | "lite";
  /** Accessible name when there is no visible title. */
  label?: string;
  id?: string;
  className?: string;
  bodyClassName?: string;
  /** Rendered under the body, separated by a hairline (actions, totals). */
  footer?: ReactNode;
  children?: ReactNode;
};

/** A titled glass panel (a section of a page). */
export function Panel({
  as: Tag = "section",
  title,
  titleAs: Heading = "h2",
  description,
  icon,
  tone = "cyan",
  actions,
  variant = "lite",
  label,
  id,
  className,
  bodyClassName,
  footer,
  children,
}: PanelProps) {
  const titleId = useId();
  return (
    <Tag
      id={id}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={cn("relative rounded-2xl", variant === "glass" ? "glass" : "glass-lite", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
          toneStyles[tone].line,
        )}
      />
      {title ? (
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconWell icon={icon} tone={tone} size="sm" /> : null}
            <div className="min-w-0 space-y-1">
              <Heading id={titleId} className="font-display text-base font-semibold tracking-tight text-fg sm:text-lg">
                {title}
              </Heading>
              {description ? <div className="text-sm text-fg-muted">{description}</div> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className={cn("px-4 py-4 sm:px-6 sm:py-5", bodyClassName)}>{children}</div>
      ) : null}
      {footer ? <div className="border-t border-line px-4 py-4 sm:px-6">{footer}</div> : null}
    </Tag>
  );
}

/** An h2/h3 between panels, with an optional count and actions. */
export function SectionHeading({
  as: Heading = "h2",
  id,
  children,
  count,
  description,
  actions,
}: {
  as?: "h2" | "h3";
  id?: string;
  children: ReactNode;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <Heading id={id} className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-fg sm:text-xl">
          {children}
          {count !== undefined ? (
            <span className="rounded-full border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-xs font-medium text-fg-muted tabular">
              {count}
            </span>
          ) : null}
        </Heading>
        {description ? <div className="max-w-3xl text-sm text-fg-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type KpiTileProps = {
  label: string;
  value: number;
  hint?: ReactNode;
  icon: ReactNode;
  href?: string;
  tone?: ConsoleTone;
  /** A share of a whole, shown as a thin meter (both counted from the database). */
  meter?: { value: number; of: number; label: string };
};

/** A headline number counted from the database, counting up as it appears; links to its list. */
export function KpiTile({ label, value, hint, icon, href, tone = "cyan", meter }: KpiTileProps) {
  const share = meter && meter.of > 0 ? Math.min(1, meter.value / meter.of) : 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <IconWell icon={icon} tone={tone} size="sm" />
        {href ? (
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 text-fg-subtle transition-transform duration-300 group-hover/glow:translate-x-0.5 group-hover/glow:-translate-y-0.5 group-hover/glow:text-neon-cyan"
          />
        ) : null}
      </div>
      {/* Two lines reserved for the label, so the numbers line up across a row of tiles. */}
      <p className="mt-3 min-h-10 text-[13px] leading-5 font-medium text-fg-muted sm:mt-4 sm:text-sm">{label}</p>
      <p className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-tight text-fg sm:text-[2.5rem]">
        <AnimatedNumber value={value} />
      </p>
      {meter ? (
        <div className="mt-3">
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-fg/[0.07]">
            <span
              className="block h-full origin-left animate-[wm-tab-in_0.9s_var(--ease-out-expo)_both] rounded-full bg-gradient-to-r from-brand-400 to-neon-cyan"
              style={{ width: `${Math.max(share > 0 ? 4 : 0, Math.round(share * 100))}%` }}
            />
          </span>
          <span className="sr-only">{meter.label}</span>
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-fg-subtle">{hint}</p> : null}
    </>
  );
  return (
    <GlowCard
      as="li"
      tilt
      maxTilt={4}
      className="glass-lite card-hover relative min-w-0 rounded-2xl p-3.5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-neon-cyan sm:p-5"
      glow={tone === "violet" ? "violet" : "cyan"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
          toneStyles[tone].line,
        )}
      />
      {href ? (
        // The whole tile is the link (its ::after covers the tile); the tile shows the focus ring.
        <Link href={href} className="block outline-none after:absolute after:inset-0 after:rounded-2xl">
          {body}
        </Link>
      ) : (
        body
      )}
    </GlowCard>
  );
}

type ConsoleEmptyProps = {
  illustration: SpotIllustrationName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  /** Without a panel of its own (inside another panel). */
  bare?: boolean;
};

/** An empty state with one of the shared spot illustrations. */
export function ConsoleEmpty({ illustration, title, children, action, headingLevel = 2, bare = false }: ConsoleEmptyProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        "flex animate-scale-in flex-col items-center px-4 py-8 text-center sm:py-10",
        !bare && "glass-lite rounded-2xl",
      )}
    >
      <SpotIllustration name={illustration} decorative animated className="w-40 sm:w-48" />
      <Heading className="mt-4 font-display text-lg font-semibold tracking-tight text-fg">{title}</Heading>
      {children ? <div className="mt-1.5 max-w-md text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A quiet note (static guidance, not announced): icon, optional title, text. */
export function ConsoleNote({
  icon,
  title,
  children,
  tone = "cyan",
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  tone?: ConsoleTone;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-line bg-fg/[0.025] p-3.5 text-sm sm:p-4", className)}>
      {icon ? <IconWell icon={icon} tone={tone} size="sm" /> : null}
      <div className="min-w-0 space-y-1 text-fg-muted">
        {title ? <p className="font-semibold text-fg">{title}</p> : null}
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

export type FactItem = {
  term: ReactNode;
  description: ReactNode;
  key?: string;
  /** Long values (sentences, addresses, emails) take a whole row instead of half of one. */
  wide?: boolean;
};

/** A term and its value in a compact grid of facts: two per row even on phones. */
export function FactGrid({
  items,
  columns = 2,
  className,
}: {
  items: readonly FactItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-4 text-sm sm:gap-x-6",
        columns === 3 && "xl:grid-cols-3",
        columns === 4 && "xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={item.key ?? index} className={cn("min-w-0 space-y-1", item.wide && "col-span-2")}>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">{item.term}</dt>
          <dd className="min-w-0 wrap-anywhere text-fg">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small "link with an arrow" used inside panels (pass TAP_TARGET when it stands on its own line). */
export function ConsoleLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline-offset-4 transition-colors hover:text-neon-cyan hover:underline",
        className,
      )}
    >
      {children}
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </Link>
  );
}
