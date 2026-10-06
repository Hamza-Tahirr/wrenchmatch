import { MapLegend, type MapLegendItem } from "@/components/map";
import { cn } from "@/lib/cn";

/**
 * A map's legend in a strip under the map (instead of the overlay, which can cover the tile
 * attribution on narrow maps). Server-safe; also used inside the client map islands.
 */
export function MapKey({ items, className }: { items: MapLegendItem[]; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-fg/[0.025] px-3 py-2 text-xs text-fg-muted", className)}>
      <MapLegend items={items} />
    </div>
  );
}
