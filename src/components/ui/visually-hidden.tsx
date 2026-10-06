import type { ReactNode } from "react";

/** Text for screen readers only (for example, extra context on an icon-only control). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
