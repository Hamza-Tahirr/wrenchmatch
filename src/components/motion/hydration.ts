import { useState, useSyncExternalStore } from "react";

// Motion components render their final, visible state during server rendering and
// hydration (no content hidden while JavaScript loads) and only play JS entrance animations
// for elements that mount later, on client-side navigations. Hydration is progressive
// (Suspense boundaries hydrate at different times), so this is decided per component.

let hydrated = false;

/** True once the root layout has hydrated in this tab (MotionProvider sets it). */
export function isHydrated(): boolean {
  return hydrated;
}

export function markHydrated(): void {
  hydrated = true;
}

/** True when the user asked the OS for reduced motion (always false on the server). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const noopSubscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

/**
 * True when this component first rendered on the server or while hydrating (its first
 * render must then match the server HTML); false when it mounted in a client render, e.g.
 * after a client-side navigation. Captured once at mount.
 */
export function useMountedInHydration(): boolean {
  const hydrating = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const [mountedInHydration] = useState(hydrating);
  return mountedInHydration;
}
