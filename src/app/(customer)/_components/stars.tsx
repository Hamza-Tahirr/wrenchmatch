import { Star } from "lucide-react";

import { cn } from "@/lib/cn";

const sizes = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

/**
 * A row of five stars filled up to `rating` (rounded to the nearest whole star). Decorative:
 * pair it with text such as "4 out of 5 stars".
 */
export function Stars({ rating, size = "sm", className }: { rating: number; size?: keyof typeof sizes; className?: string }) {
  const filled = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            sizes[size],
            value <= filled
              ? "fill-warning-600 text-warning-600 drop-shadow-[0_0_6px_var(--color-warning-500)]"
              : "fill-surface-2 text-line-strong",
          )}
        />
      ))}
    </span>
  );
}

/** "4 out of 5 stars" */
export function ratingText(rating: number): string {
  return `${rating} out of 5 ${rating === 1 ? "star" : "stars"}`;
}
