"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Shared selection between a list of cards and a map on the same page: hovering a card
// highlights its marker, "Show on map" (or a focused card) selects it and the map flies there,
// and choosing a marker highlights and reveals the card.

export type SelectionSource = "list" | "map";

type MapSelection = {
  /** The record selected on the list or the map (its card id), or null. */
  selectedId: string | null;
  /** Where the latest selection came from: the map reveals list selections and vice versa. */
  source: SelectionSource | null;
  /** Increments with every selection, so re-selecting the same card flies again. */
  version: number;
  /** The card under the pointer (highlight only, no camera move). */
  hoveredId: string | null;
  select: (id: string | null, source: SelectionSource) => void;
  hover: (id: string | null) => void;
};

const MapSelectionContext = createContext<MapSelection | null>(null);

export function MapSelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ selectedId: string | null; source: SelectionSource | null; version: number }>({
    selectedId: null,
    source: null,
    version: 0,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const select = useCallback((id: string | null, source: SelectionSource) => {
    setState((current) => ({ selectedId: id, source, version: current.version + 1 }));
  }, []);
  const hover = useCallback((id: string | null) => setHoveredId(id), []);

  const value = useMemo<MapSelection>(
    () => ({ ...state, hoveredId, select, hover }),
    [state, hoveredId, select, hover],
  );
  return <MapSelectionContext value={value}>{children}</MapSelectionContext>;
}

/** The surrounding selection, or null outside a MapSelectionProvider (cards still render). */
export function useMapSelection(): MapSelection | null {
  return useContext(MapSelectionContext);
}
