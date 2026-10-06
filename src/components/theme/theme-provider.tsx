"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import type { Theme } from "./theme";
import { applyTheme, currentTheme, readThemeCookie, subscribeToTheme } from "./theme-store";

// The theme the server rendered (from the cookie), used while hydrating so the toggle's
// label and pressed state match the HTML.
const ServerThemeContext = createContext<Theme>("dark");

/** Rendered once by the root layout with the theme it put on `<html data-theme>`. */
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  useEffect(() => {
    // The back/forward cache can restore a page rendered before the last switch.
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      const stored = readThemeCookie();
      if (stored !== currentTheme()) applyTheme(stored, { persist: false });
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return <ServerThemeContext value={theme}>{children}</ServerThemeContext>;
}

/** The theme on screen ("light" | "dark"); re-renders when it changes. */
export function useTheme(): Theme {
  const serverTheme = useContext(ServerThemeContext);
  return useSyncExternalStore(subscribeToTheme, currentTheme, () => serverTheme);
}
