"use client";

import { m } from "motion/react";

import { cn } from "@/lib/cn";

// The application's progress: numbered neon nodes joined by a rail that fills as the reader
// scrolls through the sections (transform only). Each node links to its section. Phones get
// a compact "Step 2 of 6" line with a progress bar.

type Section = { id: string; label: string };

export function ApplicationStepper({ sections, current }: { sections: readonly Section[]; current: number }) {
  const progress = sections.length > 1 ? current / (sections.length - 1) : 0;
  const transition = { type: "spring" as const, stiffness: 160, damping: 26 };
  return (
    <nav aria-label="Application sections">
      {/* Phones */}
      <div className="sm:hidden">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-fg">{sections[current]?.label}</span>
          <span className="font-mono text-xs text-fg-subtle">
            Step {current + 1} of {sections.length}
          </span>
        </p>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
          <m.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet"
            initial={false}
            animate={{ scaleX: (current + 1) / sections.length }}
            transition={transition}
          />
        </div>
      </div>

      {/* sm and up */}
      <div className="relative hidden sm:block" style={{ ["--steps" as string]: sections.length }}>
        <div aria-hidden="true" className="absolute top-4 right-[calc(50%/var(--steps))] left-[calc(50%/var(--steps))] h-0.5">
          <span className="absolute inset-0 rounded-full bg-line-strong" />
          <m.span
            className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet shadow-[0_0_10px_var(--color-neon-cyan)]"
            initial={false}
            animate={{ scaleX: progress }}
            transition={transition}
          />
        </div>
        <ol className="relative grid grid-cols-[repeat(var(--steps),minmax(0,1fr))]">
          {sections.map((section, index) => {
            // Sections above the reader are "passed" (not necessarily complete: the server checks).
            const state = index < current ? "passed" : index === current ? "current" : "upcoming";
            return (
              <li key={section.id} className="flex justify-center">
                <a
                  href={`#${section.id}`}
                  aria-current={state === "current" ? "step" : undefined}
                  className="group flex flex-col items-center gap-1.5 rounded-xl px-1 text-center focus-visible:outline-offset-4"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative grid size-8 place-items-center rounded-full font-mono text-xs font-bold ring-2 transition-[background-color,color,box-shadow] duration-300",
                      state === "passed" && "bg-neon-cyan/15 text-neon-cyan ring-neon-cyan/45",
                      state === "current" && "bg-neon-cyan text-on-brand ring-neon-cyan/60 shadow-glow",
                      state === "upcoming" && "bg-surface-2 text-fg-subtle ring-line-strong group-hover:text-fg",
                    )}
                  >
                    {state === "current" ? <span className="absolute inset-0 rounded-full bg-neon-cyan/40 motion-safe:animate-pulse-ring" /> : null}
                    <span className="relative">{index + 1}</span>
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-tight font-medium transition-colors",
                      state === "upcoming" ? "text-fg-subtle group-hover:text-fg" : "text-fg",
                    )}
                  >
                    {section.label}
                    <span className="sr-only">{state === "current" ? " (current section)" : ""}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
