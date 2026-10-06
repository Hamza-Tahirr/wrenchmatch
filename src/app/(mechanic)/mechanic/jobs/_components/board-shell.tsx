"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useId, useState, type MouseEvent, type ReactNode } from "react";

import type { MapLegendItem } from "@/components/map/map-legend";
import { prefersReducedMotion } from "@/components/motion/hydration";
import { cn } from "@/lib/cn";
import type { MechanicMapBase } from "@/server/mechanic/map";

import type { MapItem } from "../../_lib/map-data";
import { ExpandableMap } from "../../_components/expandable-map";
import { JobsMap } from "../../_components/jobs-map";
import { MapSelectionProvider, useMapSelection } from "../../_components/map-selection";
import type { BoardTab, BoardTabItem } from "./board-tab-keys";
import { BoardTabPanel, BoardTabs } from "./board-tabs";

// The interactive part of the job board: the current view (tab), the map of that view and
// the selection shared by its cards and the map. Everything inside is rendered on the server
// and passed in; this only switches views and links the cards to the map.

type BoardContextValue = { tab: BoardTab; setTab: (tab: BoardTab, options?: { scroll?: boolean }) => void };

const BoardContext = createContext<BoardContextValue | null>(null);

export type BoardMapView = {
  label: string;
  items: MapItem[];
  legend: MapLegendItem[];
};

type BoardShellProps = {
  initialTab: BoardTab;
  tabs: readonly BoardTabItem[];
  panels: Readonly<Record<BoardTab, ReactNode>>;
  maps: Readonly<Record<BoardTab, BoardMapView>>;
  base: MechanicMapBase | null;
  /** Rendered above the tabs, inside the board (e.g. the stat tiles, which can switch tabs). */
  header?: ReactNode;
};

export function BoardShell(props: BoardShellProps) {
  return (
    <MapSelectionProvider>
      <BoardShellInner {...props} />
    </MapSelectionProvider>
  );
}

function BoardShellInner({ initialTab, tabs, panels, maps, base, header }: BoardShellProps) {
  const idPrefix = useId().replace(/:/g, "");
  // A link such as /mechanic/jobs?tab=quotes (a notification, a stat tile without JS)
  // re-renders the page with a new initial tab, which then wins over the local choice.
  const [view, setView] = useState<{ tab: BoardTab; initial: BoardTab }>({ tab: initialTab, initial: initialTab });
  if (view.initial !== initialTab) setView({ tab: initialTab, initial: initialTab });
  const tab = view.initial === initialTab ? view.tab : initialTab;
  const selection = useMapSelection();
  const pathname = usePathname();

  const setTab = useCallback(
    (next: BoardTab, options: { scroll?: boolean } = {}) => {
      setView((current) => ({ ...current, tab: next }));
      selection?.select(null, "list");
      const params = new URLSearchParams(window.location.search);
      params.set("tab", next);
      // Next.js keeps its router in sync with history.replaceState (no server round trip).
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
      if (options.scroll) {
        document
          .getElementById(`${idPrefix}-tabs`)
          ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    },
    [pathname, selection, idPrefix],
  );

  const map = maps[tab];
  return (
    <BoardContext value={{ tab, setTab }}>
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div id={`${idPrefix}-tabs`} className="scroll-mt-24 lg:col-start-1 lg:row-start-1">
            <BoardTabs items={tabs} current={tab} onChange={(next) => setTab(next)} idPrefix={idPrefix} />
          </div>
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            {/* One map. Phones and tablets: short above the list, with an Expand map button.
                From lg it stays beside the list (sticky) and tall: --board-map-lg wins there. */}
            <div className="lg:sticky lg:top-24 lg:[--board-map-lg:clamp(24rem,calc(100vh-12rem),38rem)]">
              <ExpandableMap
                height="var(--board-map-lg, clamp(12.5rem, 32vh, 20rem))"
                expandedHeight="var(--board-map-lg, min(68vh, 36rem))"
                hideToggleOnDesktop
              >
                <JobsMap label={map.label} base={base} items={map.items} legend={map.legend} height="var(--wm-map-h)" />
              </ExpandableMap>
            </div>
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            {tabs.map((item) => (
              <BoardTabPanel key={item.key} tab={item.key} current={tab} idPrefix={idPrefix}>
                {panels[item.key]}
              </BoardTabPanel>
            ))}
          </div>
        </div>
      </div>
    </BoardContext>
  );
}

/**
 * A link to a board view that switches the view in place when the board is interactive
 * (and stays a plain link without JavaScript).
 */
export function BoardTabLink({
  tab,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  tab: BoardTab;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const board = useContext(BoardContext);
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!board || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    board.setTab(tab, { scroll: true });
  }
  return (
    <a
      href={`/mechanic/jobs?tab=${tab}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={board?.tab === tab ? "true" : undefined}
      className={cn(className)}
    >
      {children}
    </a>
  );
}
