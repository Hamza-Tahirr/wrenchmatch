"use client";

import { Crosshair } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { GlowCard } from "@/components/motion/glow-card";
import { prefersReducedMotion } from "@/components/motion/hydration";
import { cn } from "@/lib/cn";

import { useMapSelection } from "./map-selection";

type SelectableCardProps = {
  /** The record id shared with the map (e.g. the request id). */
  id: string;
  as?: "li" | "div" | "article";
  className?: string;
  children: ReactNode;
};

/**
 * A glass card that lights up under the pointer, tilts slightly, and is linked to the map:
 * hovering highlights its marker, and choosing the marker highlights the card (and, on wide
 * screens where the map stays beside the list, scrolls it into view).
 */
export function SelectableCard({ id, as = "li", className, children }: SelectableCardProps) {
  const selection = useMapSelection();
  const selected = selection?.selectedId === id;
  const hovered = selection?.hoveredId === id;
  const version = selection?.version ?? 0;
  const fromMap = selection?.source === "map";

  useEffect(() => {
    if (!selected || !fromMap) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const element = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.top < 96 || box.bottom > window.innerHeight - 24) {
      element.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [selected, fromMap, version, id]);

  return (
    <GlowCard
      as={as}
      tilt
      maxTilt={4}
      data-card-id={id}
      data-selected={selected ? "true" : undefined}
      onPointerEnter={() => selection?.hover(id)}
      onPointerLeave={() => selection?.hover(null)}
      className={cn(
        "glass-lite card-hover rounded-2xl transition-[box-shadow,border-color] duration-300",
        selected
          ? "border-neon-cyan/70 shadow-glow"
          : hovered
            ? "border-neon-cyan/40"
            : null,
        className,
      )}
    >
      {children}
    </GlowCard>
  );
}

/**
 * "Show on map" for a card: selects it so the map flies to its approximate area. Renders
 * nothing when the page has no map selection (e.g. a list without a map).
 */
export function LocateButton({ id, label }: { id: string; label: string }) {
  const selection = useMapSelection();
  if (!selection) return null;
  const active = selection.selectedId === id;
  return (
    <button
      type="button"
      onClick={() => selection.select(id, "list")}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-[color,border-color,box-shadow] duration-200 sm:min-h-10",
        active
          ? "border-neon-cyan/70 text-neon-cyan shadow-glow-sm"
          : "border-line text-fg-muted hover:border-neon-cyan/50 hover:text-fg",
      )}
    >
      <Crosshair aria-hidden="true" className="size-4" />
      <span className="hidden sm:inline">Show on map</span>
      <span className="sr-only sm:hidden">Show on map</span>
      <span className="sr-only">: {label}</span>
    </button>
  );
}
