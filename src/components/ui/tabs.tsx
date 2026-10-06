import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ScrollCurrentIntoView } from "./scroll-current-into-view";

export type TabItem = {
  href: string;
  label: ReactNode;
  /** Optional count shown after the label (e.g. number of items in that view). */
  count?: number;
  /** Compared with `current`; defaults to href. */
  key?: string;
};

export type TabsProps = {
  /** Accessible name of the tab navigation, e.g. "Application status". */
  label: string;
  items: readonly TabItem[];
  /** Key (or href) of the view being shown; that link gets aria-current="page". */
  current: string;
  className?: string;
};

/**
 * Link-based view switcher (each tab is a URL, e.g. ?status=applied). Uses a nav with
 * aria-current rather than the ARIA tab pattern because every tab loads a page. A glass
 * segmented bar: the current tab glows and its neon indicator grows in; on narrow screens
 * the bar scrolls sideways and keeps the current tab in view.
 */
export function Tabs({ label, items, current, className }: TabsProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "glass-lite max-w-full overflow-x-auto rounded-2xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <ScrollCurrentIntoView />
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = (item.key ?? item.href) === current;
          return (
            <li key={item.key ?? item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-200 sm:min-h-9",
                  active
                    ? "bg-linear-to-b from-fg/[0.13] to-fg/[0.05] text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong),0_0_22px_-10px_var(--color-neon-cyan)] after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-center after:animate-[wm-tab-in_0.35s_var(--ease-out-expo)_both] after:rounded-full after:bg-linear-to-r after:from-neon-cyan after:to-neon-violet after:shadow-[0_0_10px_var(--color-neon-cyan)]"
                    : "text-fg-muted hover:bg-fg/[0.06] hover:text-fg",
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
                      active ? "bg-neon-cyan/15 text-brand-800 ring-1 ring-neon-cyan/30" : "bg-fg/[0.07] text-fg-muted",
                    )}
                  >
                    {item.count}
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
