"use client";

import { useEffect } from "react";

/**
 * Removes a one-time marker such as `?reserved=1` from the address after the page has shown
 * its confirmation, so reloading doesn't celebrate (or toast) again.
 */
export function StripSearchParam({ name }: { name: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [name]);
  return null;
}
