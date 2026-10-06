// Theme constants shared by the server (root layout reads the cookie) and the client
// (ThemeToggle writes it). Dark is the default; light is opt-in and remembered for a year.

export type Theme = "light" | "dark";

/** Cookie that stores the chosen theme: `wm_theme=light|dark`. */
export const THEME_COOKIE = "wm_theme";

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Browser UI colour (`<meta name="theme-color">`) per theme: the canvas colour. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  dark: "#070b17",
  light: "#f2f6fb",
};

/** Anything other than "light" (missing, tampered) falls back to the dark default. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}
