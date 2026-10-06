"use client";

import { useId, useRef } from "react";

import { cn } from "@/lib/cn";
import { useTheme } from "./theme-provider";
import { switchTheme } from "./theme-store";

export type ThemeToggleProps = {
  /** Layout only (margins, placement). */
  className?: string;
};

/**
 * Small icon button that switches between the dark and light themes. The icon morphs from a
 * moon (dark theme) into a sun (light theme); the new theme is revealed as a circle growing
 * from the button. The choice is stored in the `wm_theme` cookie (one year), so the next
 * page load renders it on the server with no flash. 44px tap target below `lg`, 40px above.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useTheme();
  const isLight = theme === "light";
  const label = isLight ? "Switch to dark theme" : "Switch to light theme";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const maskId = `wm-tt-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  function onClick() {
    const rect = buttonRef.current?.getBoundingClientRect();
    switchTheme(isLight ? "dark" : "light", rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isLight}
      title={label}
      className={cn(
        "wm-theme-toggle relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-muted transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-fg/[0.06] hover:text-fg active:scale-95 lg:size-10",
        className,
      )}
    >
      {/* Moon ↔ sun: the core shrinks into the sun, the "bite" slides off, rays spin in. */}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="wm-tt-icon size-5" fill="currentColor">
        <defs>
          <mask id={maskId}>
            <rect width="24" height="24" fill="white" />
            <circle className="wm-tt-part wm-tt-bite" cx="17.5" cy="6.5" r="7" fill="black" />
          </mask>
        </defs>
        <g className="wm-tt-part wm-tt-body" mask={`url(#${maskId})`}>
          <circle className="wm-tt-part wm-tt-core" cx="12" cy="12" r="8.5" />
        </g>
        <g className="wm-tt-part wm-tt-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.35 5.35l1.55 1.55M17.1 17.1l1.55 1.55M5.35 18.65l1.55-1.55M17.1 6.9l1.55-1.55" />
        </g>
        <g className="wm-tt-part wm-tt-stars">
          <path d="M18.6 3.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
          <circle cx="21" cy="9.6" r="0.85" />
        </g>
      </svg>
    </button>
  );
}
