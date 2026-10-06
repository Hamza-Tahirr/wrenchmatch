"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { fieldId, joinIds } from "@/components/ui/field-id";
import { FieldError, firstError, type FieldErrorValue } from "@/components/ui/field-message";
import { cn } from "@/lib/cn";

import styles from "./booking.module.css";

const MEANINGS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/**
 * A 1-5 star rating as a native radio group: arrow keys move between stars, each star is a
 * labelled radio ("4 stars, Very good"), and the stars up to the choice (or the hovered one)
 * light up. Choosing a star makes the filled ones pop in sequence.
 */
export function StarRatingInput({
  name,
  legend,
  defaultValue,
  error,
}: {
  name: string;
  legend: string;
  defaultValue?: number;
  error?: FieldErrorValue;
}) {
  const [value, setValue] = useState(defaultValue ?? 0);
  const [hovered, setHovered] = useState<number | null>(null);
  // Bumps on every choice so the pop animation replays.
  const [pulse, setPulse] = useState(0);
  const shown = hovered ?? value;
  const groupId = fieldId(name);
  const message = firstError(error);
  const errorId = message ? `${groupId}-error` : undefined;
  const meaningId = `${groupId}-meaning`;

  return (
    <fieldset
      id={groupId}
      role="radiogroup"
      aria-describedby={joinIds(meaningId, errorId)}
      aria-invalid={message ? true : undefined}
      className="space-y-2"
    >
      <legend className="text-sm font-medium text-fg">
        {legend}
        <span aria-hidden="true" className="ml-0.5 text-danger-600">
          *
        </span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center" onMouseLeave={() => setHovered(null)}>
          {[1, 2, 3, 4, 5].map((star) => {
            const lit = star <= shown;
            return (
              <label
                key={star}
                onMouseEnter={() => setHovered(star)}
                className="cursor-pointer rounded-lg p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-neon-cyan"
              >
                <input
                  type="radio"
                  name={name}
                  value={star}
                  required
                  checked={value === star}
                  onChange={() => {
                    setValue(star);
                    setPulse((count) => count + 1);
                  }}
                  className="sr-only"
                />
                <Star
                  key={star <= value ? `on-${pulse}` : "off"}
                  aria-hidden="true"
                  style={star <= value && pulse > 0 ? { animationDelay: `${(star - 1) * 45}ms` } : undefined}
                  className={cn(
                    "size-9 transition-[color,fill,transform] duration-200 sm:size-10",
                    lit
                      ? "fill-warning-600 text-warning-600 drop-shadow-[0_0_10px_var(--color-warning-500)]"
                      : "fill-surface-2 text-line-strong hover:text-fg-subtle",
                    star === hovered && "scale-110",
                    star <= value && pulse > 0 && styles.pop,
                  )}
                />
                <span className="sr-only">
                  {star} {star === 1 ? "star" : "stars"}, {MEANINGS[star]}
                </span>
              </label>
            );
          })}
        </div>
        <p id={meaningId} className="min-w-28 font-mono text-sm font-medium text-fg-muted tabular">
          {shown > 0 ? `${shown}/5 · ${MEANINGS[shown]}` : "Choose 1 to 5 stars"}
        </p>
      </div>
      {message ? <FieldError id={errorId} message={message} /> : null}
    </fieldset>
  );
}
