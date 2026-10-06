// Client-side theme state. The source of truth on screen is `<html data-theme>`, rendered
// by the root layout from the `wm_theme` cookie and switched here. Call these functions only
// from effects and event handlers (they touch `document`).

import { parseTheme, THEME_COLORS, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "./theme";

/** The theme currently applied to the page. */
export function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

/** The theme stored in the cookie (dark when none). */
export function readThemeCookie(): Theme {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return parseTheme(match?.[1]);
}

/** Re-renders subscribers (useSyncExternalStore) whenever `data-theme` changes. */
export function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * Applies a theme at once: `data-theme` (CSS switches every token and `color-scheme`), the
 * `theme-color` / `color-scheme` meta tags and (by default) the cookie.
 */
export function applyTheme(theme: Theme, { persist = true }: { persist?: boolean } = {}): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);
  if (persist) {
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }
}

const REVEAL_MS = 620;
const FADE_MS = 300;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Switches to `theme` with a circular reveal growing from `origin` (View Transitions API),
 * a quick colour cross-fade where that API is missing, or instantly under reduced motion.
 */
export function switchTheme(theme: Theme, origin?: { x: number; y: number }): void {
  if (theme === currentTheme()) return;
  const root = document.documentElement;

  if (prefersReducedMotion()) {
    applyTheme(theme);
    return;
  }

  if (typeof document.startViewTransition !== "function") {
    root.classList.add("wm-theme-fading");
    applyTheme(theme);
    window.setTimeout(() => root.classList.remove("wm-theme-fading"), FADE_MS);
    return;
  }

  const x = origin?.x ?? window.innerWidth - 48;
  const y = origin?.y ?? 32;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  root.classList.add("wm-theme-switching");
  const transition = document.startViewTransition(() => applyTheme(theme));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: "cubic-bezier(0.45, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {
      // The transition was skipped (e.g. the tab is hidden); the theme is applied anyway.
    });
  transition.finished.finally(() => root.classList.remove("wm-theme-switching"));
}
