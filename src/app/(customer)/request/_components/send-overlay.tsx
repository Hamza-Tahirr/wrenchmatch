"use client";

import { useFormStatus } from "react-dom";

import styles from "./wizard.module.css";

const BLIPS: ReadonlyArray<{ top: string; left: string; delay: string }> = [
  { top: "24%", left: "64%", delay: "0.2s" },
  { top: "62%", left: "30%", delay: "0.75s" },
  { top: "70%", left: "68%", delay: "1.15s" },
];

/**
 * While the request is being sent: a radar sweep over the wizard ("finding approved
 * mechanics"). The page then moves to the request, which shows how many were notified.
 */
export function SendOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 grid animate-fade-in place-items-center rounded-[inherit] bg-canvas/80 p-6 backdrop-blur-md"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <div aria-hidden="true" className={styles.radar}>
          {BLIPS.map((blip) => (
            <span key={blip.delay} className={styles.blip} style={{ top: blip.top, left: blip.left, animationDelay: blip.delay }} />
          ))}
        </div>
        <p className="mt-6 font-display text-lg font-semibold text-fg">Sending your request…</p>
        <p className="mt-1 text-sm text-fg-muted">
          Checking approved mechanics near you: their services, the makes they work on, their travel range and
          their availability.
        </p>
      </div>
    </div>
  );
}
