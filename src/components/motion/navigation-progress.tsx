"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef } from "react";

import { prefersReducedMotion } from "./hydration";

// Waits this long before showing the bar, so instant (prefetched) navigations never flash it.
const SHOW_DELAY_MS = 120;
// Gives up if no route change arrives (blocked or cancelled navigation).
const SAFETY_TIMEOUT_MS = 12_000;

/** Whether a click on this link starts an in-app (client-side) navigation to another page. */
function isInternalNavigation(event: MouseEvent): boolean {
  if (!event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same page (or only the #hash differs): nothing loads.
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

function Progress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const barRef = useRef<HTMLDivElement>(null);
  const timers = useRef<{ show?: number; safety?: number }>({});
  const running = useRef<Animation | null>(null);
  const active = useRef(false);
  // The route on screen, to tell back/forward between pages from a #hash jump.
  const shownRoute = useRef(routeKey);

  const finish = useCallback(() => {
    window.clearTimeout(timers.current.show);
    window.clearTimeout(timers.current.safety);
    if (!active.current) return;
    active.current = false;
    const bar = barRef.current;
    const growing = running.current;
    running.current = null;
    if (!bar || !growing) return;
    // Shown: complete the bar, then fade it out.
    const current = getComputedStyle(bar).transform;
    growing.cancel();
    if (prefersReducedMotion()) {
      bar.style.opacity = "0";
      return;
    }
    const done = bar.animate(
      [
        { transform: current === "none" ? "scaleX(0)" : current, opacity: 1 },
        { transform: "scaleX(1)", opacity: 1, offset: 0.55 },
        { transform: "scaleX(1)", opacity: 0 },
      ],
      { duration: 420, easing: "ease-out" },
    );
    done.onfinish = () => {
      bar.style.opacity = "0";
    };
  }, []);

  const start = useCallback(() => {
    window.clearTimeout(timers.current.show);
    window.clearTimeout(timers.current.safety);
    active.current = true;
    timers.current.safety = window.setTimeout(finish, SAFETY_TIMEOUT_MS);
    timers.current.show = window.setTimeout(() => {
      const bar = barRef.current;
      if (!bar || !active.current) return;
      running.current?.cancel();
      bar.style.opacity = "1";
      if (prefersReducedMotion()) {
        // A static full-width bar: shows that something is loading without movement.
        running.current = bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(1)" }], {
          duration: SAFETY_TIMEOUT_MS,
          fill: "forwards",
        });
        return;
      }
      // Quick first stretch, then a slow crawl that never quite reaches the end.
      running.current = bar.animate(
        [
          { transform: "scaleX(0)" },
          { transform: "scaleX(0.35)", offset: 0.06 },
          { transform: "scaleX(0.7)", offset: 0.3 },
          { transform: "scaleX(0.92)" },
        ],
        { duration: SAFETY_TIMEOUT_MS, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
      );
    }, SHOW_DELAY_MS);
  }, [finish]);

  useEffect(() => {
    // Bubble phase on window: runs after next/link's own click handler has claimed the
    // click (preventDefault), so only client-side navigations start the bar.
    function onClick(event: MouseEvent) {
      if (isInternalNavigation(event)) start();
    }
    // A #hash jump (e.g. the skip link) also fires popstate, but nothing loads.
    function onPopState() {
      const next = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      if (next !== shownRoute.current) start();
    }
    window.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  // The new route rendered: complete the bar.
  useEffect(() => {
    shownRoute.current = routeKey;
    finish();
  }, [routeKey, finish]);

  useEffect(
    () => () => {
      window.clearTimeout(timers.current.show);
      window.clearTimeout(timers.current.safety);
    },
    [],
  );

  return (
    <div aria-hidden="true" data-nav-progress="" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden">
      <div
        ref={barRef}
        className="h-full origin-left bg-linear-to-r from-neon-cyan via-neon-blue to-neon-violet opacity-0 shadow-[0_0_12px_var(--color-neon-cyan)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

/**
 * Slim top progress bar while an in-app navigation is pending (link clicks and back/forward).
 * Hidden for navigations that finish within ~120 ms. Decorative: Next.js announces the new
 * page to screen readers itself. Rendered once by the root layout.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
