"use client";

import { Columns3, LayoutList } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type View = "cards" | "table";

const VIEWS: ReadonlyArray<{ id: View; label: string; icon: ReactNode }> = [
  { id: "cards", label: "Cards & map", icon: <LayoutList /> },
  { id: "table", label: "Side by side", icon: <Columns3 /> },
];

/**
 * Switches the quotes between cards with the map and a side-by-side table (from 768px with
 * two or more quotes; phones always get one quote per card). A tablist with a sliding indicator.
 */
export function QuoteViews({ cards, table }: { cards: ReactNode; table: ReactNode | null }) {
  const [view, setView] = useState<View>("cards");
  const baseId = useId();
  if (!table) return <>{cards}</>;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next: View = event.key === "Home" ? "cards" : event.key === "End" ? "table" : view === "cards" ? "table" : "cards";
    setView(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to show the quotes"
        onKeyDown={onKeyDown}
        className="glass-lite relative isolate hidden w-fit items-center gap-1 rounded-2xl p-1 md:flex"
      >
        {VIEWS.map((item) => {
          const selected = view === item.id;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setView(item.id)}
              className={cn(
                "relative isolate inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors [&_svg]:size-4",
                selected ? "text-on-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 animate-[wm-tab-in_0.3s_var(--ease-out-expo)_both] rounded-xl bg-linear-to-r from-neon-cyan to-neon-blue shadow-glow-sm"
                />
              ) : null}
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>
      {/* Phones have no tabs and always see the cards. */}
      <div
        id={`${baseId}-panel-cards`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-cards`}
        className={cn(view === "cards" ? "animate-fade-in" : "md:hidden")}
      >
        {cards}
      </div>
      <div
        id={`${baseId}-panel-table`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-table`}
        hidden={view !== "table"}
        className={cn("hidden md:block", view === "table" && "animate-fade-in")}
      >
        {table}
      </div>
    </div>
  );
}
