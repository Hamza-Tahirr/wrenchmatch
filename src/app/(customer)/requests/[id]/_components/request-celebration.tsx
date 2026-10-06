"use client";

import type { CSSProperties } from "react";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { ToastOnMount } from "@/components/ui/toast";
import { formatDateTime, pluralize } from "@/lib/format";

import { CountUp } from "../../../_components/count-up";
import { StripSearchParam } from "../../../_components/strip-search-param";
import styles from "./request.module.css";

// Theme tokens, so the burst suits the dark and the light theme.
const PARTICLE_COLORS = [
  "var(--color-neon-cyan)",
  "var(--color-neon-violet)",
  "var(--color-success-600)",
  "var(--color-neon-blue)",
];

// Fixed angles and distances, so the server and browser render the same markup.
const PARTICLES = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2 + (index % 2 === 0 ? 0.12 : -0.08);
  const distance = 70 + ((index * 37) % 60);
  return {
    x: `${Math.round(Math.cos(angle) * distance)}px`,
    y: `${Math.round(Math.sin(angle) * distance)}px`,
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
    delay: `${(index % 6) * 0.04}s`,
  };
});

/**
 * Shown once, right after a request is sent: a self-drawing check, a particle burst and the
 * actual number of mechanics notified counting up. The `?submitted=1` marker is removed
 * from the address so a reload doesn't celebrate again.
 */
export function RequestCelebration({
  matchedCount,
  areaLabel,
  expiresAt,
  timeZone,
}: {
  matchedCount: number;
  areaLabel: string;
  expiresAt: string | null;
  timeZone: string;
}) {
  return (
    <section
      aria-labelledby="request-sent-title"
      className="glass glow-border aurora relative overflow-hidden rounded-3xl px-5 py-7 sm:px-8"
    >
      <StripSearchParam name="submitted" />
      <ToastOnMount
        title={`Request sent to ${pluralize(matchedCount, "mechanic")}`}
        description="We'll notify you as soon as a quote arrives."
      />
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <div className="relative grid shrink-0 place-items-center">
          <AnimatedCheck size={72} tone="success" />
          <span aria-hidden="true" className={styles.burst}>
            {PARTICLES.map((particle, index) => (
              <span
                key={index}
                className={styles.particle}
                style={
                  {
                    "--particle-x": particle.x,
                    "--particle-y": particle.y,
                    "--particle-color": particle.color,
                    "--particle-delay": particle.delay,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-success-700 uppercase">Request sent</p>
          <h2 id="request-sent-title" className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Sent to{" "}
            <CountUp value={matchedCount} duration={1.4} className="holo-text font-mono" />{" "}
            nearby {matchedCount === 1 ? "mechanic" : "mechanics"}
          </h2>
          <p className="max-w-2xl text-pretty text-fg-muted">
            We notified {pluralize(matchedCount, "approved mechanic")} near {areaLabel}. Quotes usually arrive within a
            day, and the bell lights up when one does.
            {expiresAt ? ` Your request stays open until ${formatDateTime(expiresAt, timeZone)}.` : null}
          </p>
        </div>
      </div>
    </section>
  );
}
