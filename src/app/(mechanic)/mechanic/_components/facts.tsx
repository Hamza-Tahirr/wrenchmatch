import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A wrapping row of small icon + text facts (job cards, headers). */
export function FactList({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted", className)}>
      {children}
    </ul>
  );
}

export function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className="shrink-0 text-neon-cyan/80 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** A labelled value with a neon icon tile, for detail grids ("Preferred time", "Area"...). */
export function DetailItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="relative min-w-0 pl-12">
      <dt className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 grid size-9 place-items-center rounded-xl bg-neon-cyan/8 text-neon-cyan ring-1 ring-neon-cyan/20 [&_svg]:size-4"
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
