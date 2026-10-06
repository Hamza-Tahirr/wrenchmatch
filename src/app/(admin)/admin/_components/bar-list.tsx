import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

// A single-series horizontal bar list (one hue for every bar, value labelled at the right,
// 4px rounded data end, square at the baseline). Bars grow in on mount (CSS, transform
// only); the numbers are always text, so nothing depends on color or animation.

export type BarListRow = {
  key: string;
  label: ReactNode;
  value: number;
  /** Smaller text under the label (an explanation). */
  hint?: ReactNode;
  href?: string;
  /** Spoken after the value, e.g. "mechanics". */
  unit?: string;
};

export function BarList({
  label,
  rows,
  className,
}: {
  /** Accessible name of the list. */
  label: string;
  rows: readonly BarListRow[];
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className={cn("space-y-1", className)}>
      {rows.map((row, index) => {
        const width = row.value === 0 ? 0 : Math.max(3, Math.round((row.value / max) * 100));
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm text-fg-muted transition-colors group-hover:text-fg">
                {row.label}
                {row.hint ? <span className="mt-0.5 block text-xs text-fg-subtle">{row.hint}</span> : null}
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold text-fg tabular">
                {row.value}
                {row.unit ? <span className="sr-only"> {row.unit}</span> : null}
              </span>
            </span>
            <span aria-hidden="true" className="mt-1.5 block h-1.5 rounded-r bg-fg/[0.06]">
              <span
                className="block h-full origin-left animate-[wm-tab-in_0.9s_var(--ease-out-expo)_both] rounded-r bg-gradient-to-r from-brand-400 to-neon-cyan shadow-[0_0_12px_-2px_var(--color-neon-cyan)]"
                style={{ width: `${width}%`, animationDelay: `${index * 50}ms` }}
              />
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="group -mx-2 block rounded-lg px-2 py-2 transition-colors hover:bg-fg/[0.04]">
                {content}
              </Link>
            ) : (
              <div className="group py-2">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
