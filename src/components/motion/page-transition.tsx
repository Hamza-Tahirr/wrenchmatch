"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { prefersReducedMotion, useMountedInHydration } from "./hydration";

/**
 * Fades and lifts the page in after client-side navigations (Web Animations API, opacity and
 * transform only, ~380 ms). The first page load is shown immediately; reduced motion skips it.
 * Rendered by src/app/template.tsx.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<string | null>(null);
  const mountedInHydration = useMountedInHydration();

  useLayoutEffect(() => {
    const element = ref.current;
    const firstRun = previous.current === null;
    previous.current = pathname;
    // The hydration render is already on screen: never hide it.
    if (firstRun && mountedInHydration) return;
    if (!element || prefersReducedMotion() || typeof element.animate !== "function") return;
    element.animate(
      [
        { opacity: 0, transform: "translate3d(0, 10px, 0)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [pathname, mountedInHydration]);

  return <div ref={ref}>{children}</div>;
}
