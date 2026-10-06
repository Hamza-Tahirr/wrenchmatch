"use client";

import { m } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { BoardTab, BoardTabItem } from "./board-tab-keys";

// The job board's views as ARIA tabs that switch instantly on the client (every panel is
// already rendered on the server) and keep ?tab= in the address bar, so links and reloads
// open the same view. A glowing bar slides between the tabs (transform only).

type BoardTabsProps = {
  items: readonly BoardTabItem[];
  current: BoardTab;
  onChange: (tab: BoardTab) => void;
  idPrefix: string;
};

/** Base width of the sliding bar; it is scaled to the active tab's width. */
const BAR_BASE = 100;

export function BoardTabs({ items, current, onChange, idPrefix }: BoardTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; y: number; scale: number } | null>(null);

  // Phones show the tabs as a 2 x 2 grid, so the bar follows the active tab in both axes.
  const measure = useCallback(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
    if (!active) return;
    setBar({
      x: active.offsetLeft + 12,
      y: active.offsetTop + active.offsetHeight - 2,
      scale: Math.max(0.2, (active.offsetWidth - 24) / BAR_BASE),
    });
  }, [current]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.key === current);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const tab = items[next].key;
    onChange(tab);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
  }

  return (
    <div className="glass-lite relative rounded-2xl p-1.5">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Job board views"
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-2 gap-1 sm:flex"
      >
        {items.map((item) => {
          const active = item.key === current;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.key}`}
              data-tab={item.key}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel-${item.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.key)}
              className={cn(
                "relative inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200 sm:px-4",
                active ? "text-fg" : "text-fg-muted hover:bg-fg/5 hover:text-fg",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 animate-[wm-tab-in_0.35s_var(--ease-out-expo)_both] rounded-xl border border-neon-cyan/35 bg-neon-cyan/10"
                />
              ) : null}
              <span className="relative">{item.label}</span>
              <span
                className={cn(
                  "relative min-w-6 rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums transition-colors",
                  active ? "bg-neon-cyan text-on-brand" : "bg-surface-2 text-fg-muted ring-1 ring-line",
                )}
              >
                {item.count}
              </span>
            </button>
          );
        })}
        {bar ? (
          <m.span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 h-0.5 origin-left rounded-full bg-neon-cyan shadow-[0_0_12px_var(--color-neon-cyan)]"
            style={{ width: BAR_BASE }}
            initial={false}
            animate={{ x: bar.x, y: bar.y, scaleX: bar.scale }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The panel of one tab. Hidden panels stay in the DOM (instant switching, nothing refetched);
 * showing a panel replays its CSS entrance (and its cards' stagger).
 */
export function BoardTabPanel({
  tab,
  current,
  idPrefix,
  children,
}: {
  tab: BoardTab;
  current: BoardTab;
  idPrefix: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tab}`}
      aria-labelledby={`${idPrefix}-tab-${tab}`}
      hidden={tab !== current}
      tabIndex={0}
      className="animate-fade-in rounded-2xl focus-visible:outline-offset-4"
    >
      {children}
    </div>
  );
}
