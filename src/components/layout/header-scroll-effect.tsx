"use client";

import { useEffect, useRef } from "react";

/**
 * Sets `data-scrolled="true"` on the surrounding <header> once the page scrolls, so the glass
 * header can deepen its shadow and show its neon hairline. Renders an empty, hidden span.
 */
export function HeaderScrollEffect() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.dataset.scrolled = window.scrollY > 4 ? "true" : "false";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <span ref={ref} hidden />;
}
