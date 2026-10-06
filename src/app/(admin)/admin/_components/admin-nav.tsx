"use client";

import {
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Radar,
  ScrollText,
  Settings,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import type { AdminNavCounts } from "@/server/admin/counts";

import { SCROLL_FADE, SCROLL_ROW } from "../_lib/ui";

// The admin console's navigation: a glass sidebar from the lg breakpoint (the current
// section carries a neon rail) and, on phones and tablets, a row of section pills above the
// page that scrolls sideways and keeps the current section in view. Counts flag work waiting
// in a section; they are counted from the database per request.

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path is current (the dashboard). */
  exact?: boolean;
  count?: { key: keyof AdminNavCounts; label: string };
};

const ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/mechanics", label: "Mechanics", icon: Users, count: { key: "mechanicsAwaitingReview", label: "awaiting review" } },
  { href: "/admin/requests", label: "Requests", icon: ClipboardList },
  { href: "/admin/matching", label: "Matching", icon: Radar, count: { key: "matchingFailures", label: "need follow-up" } },
  { href: "/admin/marketplace", label: "Marketplace", icon: Store },
  { href: "/admin/support", label: "Help desk", icon: LifeBuoy, count: { key: "supportOpen", label: "open" } },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/mailbox", label: "Email outbox", icon: Mail },
];

function isCurrent(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function CountBadge({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-full border border-warning-300/60 bg-warning-50 px-1.5 font-mono text-[11px] font-semibold text-warning-800 shadow-[0_0_12px_-3px_var(--color-warning-500)] tabular",
        className,
      )}
    >
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">
        ({value} {label})
      </span>
    </span>
  );
}

export function AdminNav({ counts }: { counts: AdminNavCounts }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="hidden lg:block">
        <nav aria-label="Admin" className="glass sticky top-24 rounded-2xl p-2.5">
          <div className="border-b border-line px-3 pt-2 pb-3">
            <p className="font-mono text-[10px] tracking-[0.24em] text-fg-subtle uppercase">Operations</p>
            <p className="mt-1 flex items-center gap-2 font-display text-sm font-semibold text-fg">
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-success-500 opacity-60" />
                <span className="relative size-2 rounded-full bg-success-500 shadow-[0_0_8px_var(--color-success-500)]" />
              </span>
              Command center
            </p>
          </div>
          <ul className="mt-2 space-y-0.5">
            {ITEMS.map((item) => {
              const value = item.count ? counts[item.count.key] : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(pathname, item) ? "page" : undefined}
                    className="group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition-all duration-200 hover:bg-fg/[0.05] hover:text-fg aria-[current=page]:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-neon-cyan)_16%,transparent),transparent_85%)] aria-[current=page]:text-fg"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-0.5 scale-y-0 rounded-full bg-neon-cyan opacity-0 shadow-[0_0_10px_var(--color-neon-cyan)] transition-all duration-300 group-aria-[current=page]:scale-y-100 group-aria-[current=page]:opacity-100"
                    />
                    <Icon
                      aria-hidden="true"
                      className="size-4.5 shrink-0 text-fg-subtle transition-colors group-hover:text-fg group-aria-[current=page]:text-neon-cyan group-aria-[current=page]:drop-shadow-[0_0_6px_var(--color-neon-cyan)]"
                    />
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.count && value > 0 ? <CountBadge value={value} label={item.count.label} className="ml-auto" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-line px-3 pt-3 pb-1 text-xs leading-relaxed text-fg-subtle">
            Online payments are coming soon: checkout stays disabled and no money moves.
          </p>
        </nav>
      </aside>
      <SectionPills pathname={pathname} counts={counts} />
    </>
  );
}

/**
 * Below lg: every admin section as a pill in one row that scrolls sideways (one tap to switch).
 * The current section is highlighted and scrolled into the middle of the row, including after
 * moving between sections (the layout, and so this row, stays mounted).
 */
function SectionPills({ pathname, counts }: { pathname: string; counts: AdminNavCounts }) {
  const rowRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const left = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [pathname]);

  return (
    <nav aria-label="Admin" className="-mx-4 mb-6 sm:-mx-6 lg:hidden">
      <ul ref={rowRef} className={cn(SCROLL_ROW, SCROLL_FADE, "relative scroll-px-4 px-4 py-1 sm:scroll-px-6 sm:px-6")}>
        {ITEMS.map((item) => {
          const current = isCurrent(pathname, item);
          const value = item.count ? counts[item.count.key] : 0;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0 snap-start">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-200 active:scale-[0.97]",
                  current
                    ? "border-neon-cyan/50 bg-neon-cyan/12 text-fg shadow-glow-sm"
                    : "border-line-strong bg-fg/[0.03] text-fg-muted hover:border-neon-cyan/40 hover:text-fg",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-4 shrink-0", current ? "text-neon-cyan" : "text-fg-subtle group-hover:text-fg")}
                />
                {item.label}
                {item.count && value > 0 ? <CountBadge value={value} label={item.count.label} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
