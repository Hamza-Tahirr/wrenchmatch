"use client";

import { useSyncExternalStore } from "react";

// A shared ticking clock for countdowns. The server renders with its own "now" (passed in
// as `serverNowMs`), hydration reuses that value so the HTML matches, and the browser then
// switches to its own clock and updates every 30 seconds.

const TICK_MS = 30_000;

let currentMs = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  currentMs = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    currentMs = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return currentMs;
}

/** Milliseconds since the epoch: `serverNowMs` on the server and during hydration, then live. */
export function useNow(serverNowMs: number): number {
  const live = useSyncExternalStore(subscribe, getSnapshot, () => serverNowMs);
  return live === 0 ? serverNowMs : live;
}
