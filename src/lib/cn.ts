export type ClassValue = string | false | null | undefined;

/**
 * Joins class names, skipping falsy values. It does not resolve Tailwind conflicts, so
 * pass layout additions (margins, widths) through `className`, not overrides of a
 * component's own colors or padding.
 */
export function cn(...classes: ClassValue[]): string {
  let result = "";
  for (const value of classes) {
    if (!value) continue;
    result = result ? `${result} ${value}` : value;
  }
  return result;
}
