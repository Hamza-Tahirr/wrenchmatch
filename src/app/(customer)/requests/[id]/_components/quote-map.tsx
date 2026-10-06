"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { MapCircle, MapLine, MapPoint } from "@/components/map/geo";
import { MapView } from "@/components/map/map-view";
import { GlowCard } from "@/components/motion/glow-card";
import { cn } from "@/lib/cn";

// Links the quote cards with the map: hovering or focusing a card highlights its mechanic's
// marker and flies the map there; choosing a marker lights up the matching card. Map points
// are approximate (the request's ZIP centroid, each mechanic's base-ZIP centroid).

type Source = "card" | "map";
type Selection = { pointId: string | null; source: Source };

type QuoteMapState = {
  selection: Selection;
  select: (pointId: string | null, source: Source) => void;
};

const QuoteMapContext = createContext<QuoteMapState | null>(null);

export function QuoteMapProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>({ pointId: null, source: "card" });
  const select = useCallback((pointId: string | null, source: Source) => setSelection({ pointId, source }), []);
  const value = useMemo(() => ({ selection, select }), [selection, select]);
  return <QuoteMapContext.Provider value={value}>{children}</QuoteMapContext.Provider>;
}

const HOVER_DELAY_MS = 140;

/**
 * One quote card: a glass card with a pointer spotlight that tells the map which mechanic to
 * show. Lights up when that mechanic's marker is chosen on the map.
 */
export function QuoteFocusCard({
  pointId,
  quoteId,
  highlight,
  className,
  children,
}: {
  pointId: string;
  quoteId: string;
  /** "selected" (the reserved quote) or "best" (lowest price) get a stronger frame. */
  highlight?: "selected" | "best" | null;
  className?: string;
  children: ReactNode;
}) {
  const state = useContext(QuoteMapContext);
  const timer = useRef<number | undefined>(undefined);
  const elementId = `quote-${quoteId}`;
  const lit = state?.selection.pointId === pointId && state.selection.source === "map";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A marker chosen on the map brings its card into view.
  useEffect(() => {
    if (!lit) return;
    const element = document.getElementById(elementId);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }, [lit, elementId]);

  const focusMarker = (delay: number) => {
    if (!state) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => state.select(pointId, "card"), delay);
  };

  return (
    <GlowCard
      as="article"
      id={elementId}
      aria-labelledby={`${elementId}-title`}
      onPointerEnter={() => focusMarker(HOVER_DELAY_MS)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onFocus={() => focusMarker(0)}
      className={cn(
        "glass-lite scroll-mt-28 rounded-3xl transition-[box-shadow,border-color] duration-300",
        highlight === "selected" && "border-success-300/60 shadow-glow-success",
        highlight === "best" && "glow-border",
        lit && "shadow-glow-lg",
        className,
      )}
    >
      {children}
    </GlowCard>
  );
}

export type QuotesMapProps = {
  label: string;
  points: MapPoint[];
  circles: MapCircle[];
  lines: MapLine[];
  legend?: ReactNode;
  height?: string;
};

/** The map beside the quotes, following the card the customer is looking at. */
export function QuotesMap({
  label,
  points,
  circles,
  lines,
  legend,
  // Short on phones (an overview above the quote cards), tall beside the cards on wide screens.
  height = "clamp(14rem, calc(28vw + 7rem), min(30rem, 72vh))",
}: QuotesMapProps) {
  const state = useContext(QuoteMapContext);
  const selectedId = state?.selection.pointId ?? null;
  return (
    <MapView
      label={label}
      points={points}
      circles={circles}
      lines={lines}
      legend={legend}
      height={height}
      cluster={false}
      selectedId={selectedId}
      onSelect={(id) => state?.select(id, "map")}
      listTitle="Your request and the mechanics who quoted"
    />
  );
}
