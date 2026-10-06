import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A shimmering placeholder block; size it with className (e.g. "h-4 w-32"). Hidden from screen readers. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("shimmer rounded-lg", className)} />;
}

/** Placeholder lines for a paragraph; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cn("shimmer h-4 rounded-md", lines > 1 && index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Wraps placeholders in loading.tsx files so screen readers hear `label` instead of nothing. */
export function LoadingState({
  label = "Loading…",
  children,
  className,
}: {
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
