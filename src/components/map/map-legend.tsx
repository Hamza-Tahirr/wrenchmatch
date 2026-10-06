import { cn } from "@/lib/cn";

import { mapToneVar, type MapTone } from "./geo";

export type MapLegendItem = {
  tone: MapTone;
  label: string;
  /** Swatch shape: "pin" (dot, default), "home" (diamond), "ring" (dashed circle), "area" (filled circle), "line". */
  kind?: "pin" | "home" | "ring" | "area" | "line";
};

/** Legend for <MapView legend={…} />. Server-safe. */
export function MapLegend({ items, className }: { items: MapLegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)} aria-label="Map legend">
      {items.map((item) => {
        const color = mapToneVar(item.tone);
        return (
          <li key={`${item.tone}-${item.label}`} className="flex items-center gap-2">
            {item.kind === "area" ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-[1.5px]"
                style={{ borderColor: color, background: `color-mix(in oklab, ${color} 22%, transparent)` }}
              />
            ) : item.kind === "ring" ? (
              <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-dashed" style={{ borderColor: color }} />
            ) : item.kind === "line" ? (
              <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
            ) : (
              <span
                aria-hidden="true"
                className={cn("size-2.5", item.kind === "home" ? "rotate-45 rounded-[3px]" : "rounded-full")}
                style={{ background: color, boxShadow: `0 0 10px color-mix(in oklab, ${color} 70%, transparent)` }}
              />
            )}
            <span>{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
