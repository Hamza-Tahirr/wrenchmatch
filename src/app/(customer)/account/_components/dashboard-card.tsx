import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A titled glass panel of the account dashboard with a count, a "view all" link and an empty state. */
export function DashboardCard({
  id,
  title,
  icon,
  count,
  viewAll,
  empty,
  isEmpty,
  footer,
  className,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  count?: number;
  viewAll?: { href: string; label: string };
  /** Shown instead of the children when `isEmpty`. */
  empty: ReactNode;
  isEmpty: boolean;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("glass-lite flex scroll-mt-24 flex-col overflow-hidden rounded-3xl", className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <h2 id={titleId} className="flex min-w-0 items-center gap-2.5 font-display text-base font-semibold text-fg">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25 [&_svg]:size-4"
          >
            {icon}
          </span>
          <span className="min-w-0 text-pretty">{title}</span>
          {count !== undefined ? (
            <span className="rounded-full border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-fg tabular">
              <span className="sr-only">(</span>
              {count}
              <span className="sr-only">)</span>
            </span>
          ) : null}
        </h2>
        {viewAll && !isEmpty ? (
          <Link
            href={viewAll.href}
            className="group -my-1 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            {viewAll.label}
            <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>
      <div className="flex-1">
        {isEmpty ? <div className="px-4 py-6 text-sm text-fg-muted sm:px-5">{empty}</div> : children}
      </div>
      {footer ? <div className="border-t border-line bg-surface-2/50 px-4 py-3 text-sm text-fg-muted sm:px-5">{footer}</div> : null}
    </section>
  );
}

/** A list inside a DashboardCard. */
export function DashboardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

/** One linked row: title, small meta line, badges and a trailing value. */
export function DashboardRow({
  href,
  title,
  meta,
  badges,
  trailing,
}: {
  href: string;
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="relative flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-fg/5 has-[a:focus-visible]:bg-fg/5 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-neon-cyan has-[a:focus-visible]:ring-inset sm:px-5">
      <div className="min-w-0 space-y-1">
        {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
        <Link
          href={href}
          className="block text-sm font-medium text-pretty text-fg after:absolute after:inset-0 focus-visible:outline-none"
        >
          {title}
        </Link>
        {meta ? <div className="text-xs text-fg-subtle">{meta}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-right text-sm text-fg">{trailing}</div> : null}
    </li>
  );
}
