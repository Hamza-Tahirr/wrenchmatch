import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DescriptionItem = {
  term: ReactNode;
  description: ReactNode;
  /** React key; defaults to the term when it is a string. */
  key?: string;
};

export type DescriptionListProps = {
  items: readonly DescriptionItem[];
  /**
   * "rows": label left / value right from sm up, with dividers (detail pages).
   * "grid": label above value in two columns (compact facts).
   */
  layout?: "rows" | "grid";
  className?: string;
};

/** Label/value pairs rendered as a semantic <dl>. */
export function DescriptionList({ items, layout = "rows", className }: DescriptionListProps) {
  return (
    <dl
      className={cn(
        layout === "rows"
          ? "divide-y divide-line"
          : "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.key ?? (typeof item.term === "string" ? item.term : index)}
          className={layout === "rows" ? "py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-3 sm:gap-4" : undefined}
        >
          <dt className="text-sm font-medium text-fg-subtle">{item.term}</dt>
          <dd
            className={cn(
              "mt-1 text-sm break-words text-fg",
              layout === "rows" && "sm:col-span-2 sm:mt-0",
            )}
          >
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}
