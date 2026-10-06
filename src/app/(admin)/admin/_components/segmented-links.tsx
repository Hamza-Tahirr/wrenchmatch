import Link from "next/link";

import { ScrollCurrentIntoView } from "@/components/ui/scroll-current-into-view";
import { cn } from "@/lib/cn";

import { TAP_TARGET } from "../_lib/ui";

export type SegmentedLink = { key: string; label: string; href: string; count?: number };

/**
 * A row of filter links (each one is a URL; the current one is marked with aria-current).
 * "pills" wraps onto several lines from `sm` and is one sideways-scrolling row on phones;
 * "segmented" is one glass track that scrolls sideways. Either way the current link is
 * scrolled into view, and every link is a 44px tap target on phones and touch screens.
 */
export function SegmentedLinks({
  label,
  links,
  current,
  variant = "pills",
  className,
}: {
  label: string;
  links: readonly SegmentedLink[];
  current: string;
  variant?: "pills" | "segmented";
  className?: string;
}) {
  const segmented = variant === "segmented";
  return (
    <nav
      aria-label={label}
      className={cn(
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        segmented
          ? "max-w-full overflow-x-auto"
          : "sm:max-w-full max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]",
        className,
      )}
    >
      <ScrollCurrentIntoView />
      <ul
        className={cn(
          segmented
            ? "inline-flex min-w-max gap-1 rounded-xl border border-line bg-fg/[0.03] p-1"
            : "flex gap-2 max-sm:w-max sm:flex-wrap",
        )}
      >
        {links.map((link) => {
          const active = link.key === current;
          return (
            <li key={link.key} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 text-sm font-medium whitespace-nowrap transition-all duration-200",
                  TAP_TARGET,
                  segmented ? "rounded-lg px-3 py-1.5" : "rounded-full border px-3.5 py-1.5",
                  active
                    ? segmented
                      ? "bg-neon-cyan/15 text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-neon-cyan)_45%,transparent),0_0_18px_-6px_var(--color-neon-cyan)]"
                      : "border-neon-cyan/60 bg-neon-cyan/15 text-fg shadow-[0_0_18px_-6px_var(--color-neon-cyan)]"
                    : segmented
                      ? "text-fg-muted hover:bg-fg/[0.05] hover:text-fg"
                      : "border-line-strong bg-fg/[0.03] text-fg-muted hover:border-neon-cyan/40 hover:text-fg",
                )}
              >
                {link.label}
                {link.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-xs tabular",
                      active ? "bg-neon-cyan/20 text-fg" : "bg-fg/[0.06] text-fg-subtle",
                    )}
                  >
                    {link.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
