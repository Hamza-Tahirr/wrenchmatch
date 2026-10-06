import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { CountUp } from "./count-up";

export type StatTileItem = {
  label: string;
  /** Always computed from the customer's own records. */
  value: number;
  icon: ReactNode;
  hint?: string;
  href?: string;
  tone?: "cyan" | "violet" | "success" | "warning";
};

const toneClasses: Record<NonNullable<StatTileItem["tone"]>, string> = {
  cyan: "bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/25",
  violet: "bg-neon-violet/10 text-neon-violet ring-neon-violet/25",
  success: "bg-success-500/10 text-success-600 ring-success-500/25",
  warning: "bg-warning-500/10 text-warning-600 ring-warning-500/25",
};

/** A row of counters that count up into view; each can link to its list. */
export function StatTiles({ items, label, className }: { items: readonly StatTileItem[]; label: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("stagger-children grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>
      {items.map((item) => {
        const body = (
          <>
            <span
              aria-hidden="true"
              className={cn("grid size-10 place-items-center rounded-xl ring-1 [&_svg]:size-5", toneClasses[item.tone ?? "cyan"])}
            >
              {item.icon}
            </span>
            <span className="mt-4 block font-mono text-3xl font-semibold tracking-tight text-fg tabular text-glow sm:text-4xl">
              <CountUp value={item.value} />
            </span>
            <span className="mt-1 block text-sm font-medium text-fg">{item.label}</span>
            {item.hint ? <span className="mt-0.5 block text-xs text-fg-subtle">{item.hint}</span> : null}
          </>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className="glass-lite card-hover block h-full rounded-3xl p-4 sm:p-5">
                {body}
              </Link>
            ) : (
              <div className="glass-lite h-full rounded-3xl p-4 sm:p-5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
