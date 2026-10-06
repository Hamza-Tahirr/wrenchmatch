import { Check, Circle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { BadgeTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

export type TimelineEntry = {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  /** UTC ISO time; omitted for steps that haven't happened yet. */
  at?: string | null;
  tone: BadgeTone;
  /** "upcoming" steps are drawn hollow and muted. */
  state?: "done" | "upcoming";
};

const dotTones: Record<BadgeTone, string> = {
  neutral: "bg-fg-subtle text-on-brand",
  info: "bg-brand-600 text-on-brand shadow-[0_0_14px_-2px_var(--color-neon-cyan)]",
  success: "bg-success-600 text-on-brand shadow-[0_0_14px_-2px_var(--color-success-500)]",
  warning: "bg-warning-600 text-on-brand shadow-[0_0_14px_-2px_var(--color-warning-500)]",
  danger: "bg-danger-600 text-on-brand shadow-[0_0_14px_-2px_var(--color-danger-500)]",
};

/** A vertical history: a glowing dot per event joined by a neon line, times in `timeZone`. */
export function Timeline({
  entries,
  timeZone,
  label,
  className,
}: {
  entries: readonly TimelineEntry[];
  timeZone: string;
  label: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("stagger-children relative space-y-5", className)}>
      {entries.map((entry, index) => {
        const upcoming = entry.state === "upcoming";
        const last = index === entries.length - 1;
        const nextUpcoming = entries[index + 1]?.state === "upcoming";
        return (
          <li key={entry.id} className="relative flex gap-3">
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-[-1.25rem] left-[0.6875rem] w-px",
                  upcoming || nextUpcoming
                    ? "bg-line-strong"
                    : "bg-linear-to-b from-neon-cyan/70 to-neon-violet/40",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                upcoming ? "border border-dashed border-line-strong bg-surface-2 text-fg-subtle" : dotTones[entry.tone],
              )}
            >
              {upcoming ? <Circle className="size-2" /> : <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 pb-0.5">
              <p className={cn("text-sm font-medium", upcoming ? "text-fg-subtle" : "text-fg")}>
                {entry.title}
                {upcoming ? <span className="sr-only"> (not yet)</span> : null}
              </p>
              {entry.detail ? <div className="mt-0.5 text-sm text-pretty text-fg-muted">{entry.detail}</div> : null}
              {entry.at ? (
                <p className="mt-0.5 font-mono text-xs text-fg-subtle tabular">
                  <time dateTime={entry.at}>{formatDateTime(entry.at, timeZone)}</time>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
