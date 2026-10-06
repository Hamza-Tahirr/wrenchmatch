"use client";

import { useEffect } from "react";

// Ambient loops (illustration twinkles/pulses/route dashes, aurora, grid, holo text and glow
// borders) only run while they are on screen and the tab is visible. Off-screen elements have
// their infinite CSS animations paused through the Web Animations API (no class or attribute
// changes, so parts of the page that hydrate later never see a mismatch); a hidden tab gets
// `wm-hidden` on <html> (which tolerates attribute changes). The CSS rule lives in globals.css.
const AMBIENT_SELECTOR = 'svg:has([class*="wmi-"]), .aurora, .grid-bg, .holo-text, .glow-border';

/** Infinite CSS loops on the element, its pseudo-elements and descendants. */
function ambientLoops(element: Element): CSSAnimation[] {
  return element
    .getAnimations({ subtree: true })
    .filter(
      (animation): animation is CSSAnimation =>
        animation instanceof CSSAnimation && animation.effect?.getTiming().iterations === Infinity,
    );
}

export function AmbientPauser() {
  useEffect(() => {
    const root = document.documentElement;
    const onVisibility = () => root.classList.toggle("wm-hidden", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    if (!("IntersectionObserver" in window) || typeof Element.prototype.getAnimations !== "function") {
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }

    // Only animations paused here are resumed here.
    const pausedByUs = new WeakSet<Animation>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          for (const animation of ambientLoops(entry.target)) {
            if (!entry.isIntersecting) {
              if (animation.playState === "running") {
                animation.pause();
                pausedByUs.add(animation);
              }
            } else if (pausedByUs.has(animation)) {
              pausedByUs.delete(animation);
              animation.play();
            }
          }
        }
      },
      { rootMargin: "160px 0px" },
    );
    const watched = new WeakSet<Element>();
    const watch = (element: Element) => {
      if (watched.has(element)) return;
      watched.add(element);
      observer.observe(element);
    };
    const scan = (node: ParentNode) => node.querySelectorAll(AMBIENT_SELECTOR).forEach(watch);
    scan(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(AMBIENT_SELECTOR)) watch(node);
          scan(node);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      mutations.disconnect();
      root.classList.remove("wm-hidden");
    };
  }, []);

  return null;
}
