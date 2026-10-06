"use client";

import { Crosshair } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

import { TAP_TARGET } from "../../_lib/ui";
import { focusMatchingRequest } from "./matching-map";

/** "Show on map" for a matching-failure card: focuses the page's diagnostics map on it. */
export function MapFocusButton({ requestId, title }: { requestId: string; title: string }) {
  return (
    <button
      type="button"
      onClick={() => focusMatchingRequest(requestId)}
      className={buttonClasses({ variant: "ghost", size: "sm", className: TAP_TARGET })}
    >
      <Crosshair aria-hidden="true" />
      Show on map
      <span className="sr-only">: {title}</span>
    </button>
  );
}
