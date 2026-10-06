"use client";

import { Hourglass, TimerOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import { EXPIRY_WARNING_MS, formatTimeLeft } from "../_lib/display";
import { useNow } from "./use-now";

export type ExpiryCountdownProps = {
  /** UTC ISO instant the quote (or request) expires. */
  expiresAt: string;
  /** The server's "now" (UTC ISO) so the first render matches the server HTML. */
  now: string;
  /** IANA zone for the absolute time, normally the request's. */
  timeZone: string;
  /** What expires, for the text: "Quote expires in 2 days". */
  noun?: string;
  /** When the validity window began (e.g. when the quote was sent): draws a depleting ring. */
  startedAt?: string;
  className?: string;
};

/** "Quote expires in 1 day 4 hr" with the exact time, updating while the page is open. */
export function ExpiryCountdown({ expiresAt, now, timeZone, noun = "Quote", startedAt, className }: ExpiryCountdownProps) {
  const nowMs = useNow(Date.parse(now));
  const expiresMs = Date.parse(expiresAt);
  const left = formatTimeLeft(expiresMs, nowMs);
  const exact = formatDateTime(expiresAt, timeZone);

  if (left === null) {
    return (
      <p className={cn("inline-flex items-start gap-1.5 text-sm text-fg-subtle", className)}>
        <TimerOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          {noun} expired <time dateTime={expiresAt}>{exact}</time>
        </span>
      </p>
    );
  }

  const urgent = expiresMs - nowMs <= EXPIRY_WARNING_MS;
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const span = expiresMs - startMs;
  const fraction = Number.isFinite(span) && span > 0 ? Math.min(1, Math.max(0, (expiresMs - nowMs) / span)) : null;

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      {fraction !== null ? (
        <span aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center">
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" className="stroke-line-strong" />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1 - fraction}
              className={cn(
                "transition-[stroke-dashoffset] duration-700 ease-(--ease-out-expo)",
                urgent
                  ? "stroke-warning-600 drop-shadow-[0_0_6px_var(--color-warning-500)]"
                  : "stroke-neon-cyan drop-shadow-[0_0_6px_var(--color-neon-cyan)]",
              )}
            />
          </svg>
          <Hourglass className={cn("size-4", urgent ? "animate-glow-pulse text-warning-700" : "text-brand-700")} />
        </span>
      ) : (
        <Hourglass aria-hidden="true" className={cn("size-4 shrink-0", urgent ? "text-warning-700" : "text-brand-700")} />
      )}
      <p className={cn("text-sm", urgent ? "font-medium text-warning-800" : "text-fg-muted")}>
        {noun} expires in <span className="font-mono font-semibold tabular">{left}</span>
        <span className="block text-xs font-normal text-fg-subtle">
          <time dateTime={expiresAt}>{exact}</time>
        </span>
      </p>
    </div>
  );
}
