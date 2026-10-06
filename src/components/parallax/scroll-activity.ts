"use client";

import { useEffect } from "react";

// While the page is scrolling, <html data-scrolling> is set (one passive listener shared by
// every scene, toggled at the start and end of a scroll gesture only). The illustration
// stylesheet pauses the loops that live inside SVGs (twinkles, pulses, flowing dashes) while
// it is set, because those repaint their layer; compositor-only motion keeps running. This
// frees the raster threads for the scroll itself on phones.

const IDLE_MS = 180;
let users = 0;
let uninstall: (() => void) | null = null;

function install(): () => void {
  const root = document.documentElement;
  let timer = 0;
  const settle = () => {
    timer = 0;
    root.removeAttribute("data-scrolling");
  };
  const onScroll = () => {
    if (!timer) root.setAttribute("data-scrolling", "");
    else window.clearTimeout(timer);
    timer = window.setTimeout(settle, IDLE_MS);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (timer) window.clearTimeout(timer);
    root.removeAttribute("data-scrolling");
  };
}

/** Keeps `<html data-scrolling>` up to date while at least one component uses it. */
export function useScrollActivity(): void {
  useEffect(() => {
    users += 1;
    if (users === 1) uninstall = install();
    return () => {
      users -= 1;
      if (users === 0) {
        uninstall?.();
        uninstall = null;
      }
    };
  }, []);
}
