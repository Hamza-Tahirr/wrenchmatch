"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The page's main action pinned to the bottom of the screen below 1024px (phones and
 * tablets), for long pages whose action sits at the end. It leads to the element with id
 * `targetId` and hides once that element is on screen or scrolled past, so the action is
 * never shown twice and the bar never covers the end of the page. Safe-area aware.
 */
export function StickyActionBar({
  targetId,
  label,
  children,
}: {
  /** The section the action leads to (e.g. the reserve form). */
  targetId: string;
  /** Names the bar for assistive technology, e.g. "Reserve this quote". */
  label: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(entry.isIntersecting || entry.boundingClientRect.top < 0),
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <div
      role="region"
      aria-label={label}
      inert={hidden}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elevated/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-elevated backdrop-blur-xl transition-[transform,opacity] duration-300 ease-(--ease-out-expo) sm:px-6 lg:hidden",
        hidden && "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">{children}</div>
    </div>
  );
}
