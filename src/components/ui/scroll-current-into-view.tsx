"use client";

import { useEffect, useRef } from "react";

/**
 * Place inside a horizontally scrolling nav: on mount it scrolls that nav (never the page)
 * so the `[aria-current="page"]` link is centered, unless that link is already fully in
 * view (then the first items stay uncut). Renders an empty, hidden span.
 */
export function ScrollCurrentIntoView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = ref.current?.parentElement;
    const currentLink = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !currentLink || container.scrollWidth <= container.clientWidth) return;
    const containerBox = container.getBoundingClientRect();
    const linkBox = currentLink.getBoundingClientRect();
    const offset = linkBox.left - containerBox.left + container.scrollLeft;
    if (offset - container.scrollLeft + linkBox.width <= container.clientWidth - 16) return;
    container.scrollTo({ left: Math.max(0, offset - (container.clientWidth - linkBox.width) / 2) });
  }, []);
  return <span ref={ref} hidden />;
}
