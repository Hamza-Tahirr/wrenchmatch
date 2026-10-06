import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const widths = {
  /** Forms and reading pages. */
  narrow: "max-w-3xl",
  /** Most pages. */
  default: "max-w-6xl",
  /** Dashboards and wide tables. */
  wide: "max-w-7xl",
} as const;

export type PageContainerProps = {
  size?: keyof typeof widths;
  /** Vertical page padding; turn off for full-bleed sections that pad themselves. */
  padY?: boolean;
  className?: string;
  children: ReactNode;
};

/** Centered, gutter-padded page column (16px gutters on phones). */
export function PageContainer({ size = "default", padY = true, className, children }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", widths[size], padY && "py-8 sm:py-10", className)}>
      {children}
    </div>
  );
}
