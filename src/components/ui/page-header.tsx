import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Primary page actions, aligned right on wide screens and stacked on phones. */
  actions?: ReactNode;
  /** A link back to the parent page, shown above the title. */
  back?: { href: string; label: string };
  /** Small line above the title, e.g. an area name or a status badge row. */
  eyebrow?: ReactNode;
  /** Badges or facts shown under the title. */
  meta?: ReactNode;
  /** Animated holographic title (default true). */
  holo?: boolean;
  /** An aurora + grid glow band behind the header (landing-like pages, dashboards). */
  aurora?: boolean;
  /** Decorative art (e.g. a spot illustration) shown at the end on wide screens. */
  art?: ReactNode;
  className?: string;
};

/** The page's h1 with optional description, actions and back link. One per page. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  meta,
  holo = true,
  aurora = false,
  art,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("relative isolate space-y-4", aurora && "py-4 sm:py-6", className)}>
      {aurora ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-4 -top-10 -bottom-8 -z-10 overflow-hidden [mask-image:radial-gradient(ellipse_75%_90%_at_30%_20%,#000_35%,transparent_78%)] sm:-inset-x-10"
        >
          <div className="aurora grid-bg size-full opacity-90" />
        </div>
      ) : null}
      {back ? (
        <Link
          href={back.href}
          className="group relative inline-flex animate-fade-in items-center gap-1.5 rounded-full border border-line bg-fg/[0.04] px-3 py-1 text-sm font-medium text-fg-muted transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:border-neon-cyan/40 hover:text-fg sm:after:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-4 transition-transform group-hover:-translate-x-0.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <div className="animate-slide-up font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="animate-slide-up font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
            {/* Inline, so the holographic gradient spans the words rather than the full-width block. */}
            {holo ? <span className="holo-text">{title}</span> : title}
          </h1>
          {meta ? (
            <div className="flex animate-slide-up flex-wrap items-center gap-2 [animation-delay:80ms]">{meta}</div>
          ) : null}
          {description ? (
            <div className="max-w-2xl animate-slide-up text-base text-pretty text-fg-muted [animation-delay:120ms]">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 animate-slide-up flex-wrap items-center gap-2 [animation-delay:160ms]">{actions}</div>
        ) : null}
        {art ? (
          <div aria-hidden="true" className="hidden shrink-0 animate-scale-in lg:block">
            {art}
          </div>
        ) : null}
      </div>
    </header>
  );
}
