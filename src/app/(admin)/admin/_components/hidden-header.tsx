import type { ReactNode } from "react";

/**
 * A table column header only screen readers hear ("Actions"). Screen-reader-only text is
 * absolutely positioned; the positioned wrapper keeps it inside the table's horizontal
 * scroll area, so a wide table can't widen the whole page on a phone.
 */
export function HiddenHeader({ children }: { children: ReactNode }) {
  return (
    <span className="relative">
      <span className="sr-only">{children}</span>
    </span>
  );
}
