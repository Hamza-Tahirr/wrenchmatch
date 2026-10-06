import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A wrapping row of small icon + text facts (cards, headers). */
export function FactList({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted", className)}>
      {children}
    </ul>
  );
}

export function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex min-w-0 items-start gap-1.5">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** A labelled value with an icon tile, for detail grids ("Preferred time", "Area"...). */
export function DetailItem({
  icon,
  label,
  children,
  className,
}: {
  icon: ReactNode;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 pl-12", className)}>
      <dt className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 grid size-9 place-items-center rounded-xl border border-line bg-surface-2 text-brand-700 [&_svg]:size-4"
        >
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

/** A responsive grid of DetailItems inside one <dl>. */
export function DetailGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2", className)}>{children}</dl>;
}

/** A small note with an icon, e.g. who can see a piece of information. */
export function InlineNote({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-sm text-fg-muted", className)}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-fg-subtle [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A glass panel with an optional mono eyebrow and title: the customer pages' building block. */
export function Panel({
  as: Tag = "section",
  title,
  titleId,
  eyebrow,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  as?: "section" | "div" | "article" | "aside";
  title?: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Tag aria-labelledby={title && titleId ? titleId : undefined} className={cn("glass-lite rounded-3xl", className)}>
      {title || eyebrow || actions ? (
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <div className="text-sm text-pretty text-fg-muted">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </Tag>
  );
}
