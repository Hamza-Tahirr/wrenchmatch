import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Step = {
  label: string;
  /** Optional link, e.g. "#vehicle" for a section of a long form (rendered as a plain <a>). */
  href?: string;
};

export type StepsProps = {
  steps: readonly Step[];
  /** Zero-based index of the current step. */
  current: number;
  /** Accessible name, e.g. "Request form progress". */
  label?: string;
  className?: string;
};

const statusText = { complete: "completed", current: "current step", upcoming: "not started" } as const;

function StepLink({ href, children }: { href: string; children: ReactNode }) {
  const classes = "group flex items-center gap-2 rounded-lg";
  // In-page anchors stay plain links so the browser scrolls to the section natively.
  if (href.startsWith("#")) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Progress indicator for multi-section forms: compact text + glowing bar on phones, neon stepper from sm up. */
export function Steps({ steps, current, label = "Progress", className }: StepsProps) {
  const total = steps.length;
  const index = Math.min(Math.max(current, 0), Math.max(total - 1, 0));
  const currentStep = steps[index];
  if (!currentStep) return null;
  const fraction = (index + 1) / total;

  return (
    <nav aria-label={label} className={className}>
      <div className="sm:hidden">
        <p className="text-sm font-medium text-fg-muted">
          Step <span className="font-mono tabular-nums">{index + 1}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span>: <span className="text-fg">{currentStep.label}</span>
        </p>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10">
          <div
            className="h-full origin-left rounded-full bg-linear-to-r from-neon-cyan to-neon-violet shadow-[0_0_12px_var(--color-neon-cyan)] transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </div>
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-3 sm:flex">
        {steps.map((step, stepIndex) => {
          const status = stepIndex < index ? "complete" : stepIndex === index ? "current" : "upcoming";
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold transition-[box-shadow,transform] duration-200 group-hover:scale-105",
                  status === "complete" && "bg-linear-to-br from-neon-cyan to-neon-blue text-on-brand shadow-glow-sm",
                  status === "current" && "bg-neon-cyan/10 text-brand-800 shadow-glow-sm ring-2 ring-neon-cyan",
                  status === "upcoming" && "bg-fg/[0.04] text-fg-subtle ring-1 ring-line-strong",
                )}
              >
                {status === "current" ? (
                  <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-neon-cyan/60 [animation-duration:2.4s]" />
                ) : null}
                {status === "complete" ? <Check className="size-4" /> : stepIndex + 1}
              </span>
              <span className={cn("text-sm font-medium", status === "upcoming" ? "text-fg-muted" : "text-fg")}>
                {step.label}
              </span>
              <span className="sr-only">({statusText[status]})</span>
            </>
          );
          return (
            <li
              key={`${step.label}-${stepIndex}`}
              aria-current={status === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              {step.href ? <StepLink href={step.href}>{content}</StepLink> : <span className="flex items-center gap-2">{content}</span>}
              {stepIndex < total - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px w-6 lg:w-10",
                    stepIndex < index
                      ? "bg-linear-to-r from-neon-cyan to-neon-blue shadow-[0_0_8px_var(--color-neon-cyan)]"
                      : "bg-line-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
