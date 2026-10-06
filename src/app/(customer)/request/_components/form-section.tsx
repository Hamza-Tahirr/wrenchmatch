"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { useWizardStep } from "./request-wizard";
import styles from "./wizard.module.css";

/**
 * One step of the request wizard. Hidden steps stay in the form (their values and files
 * are sent with it); the shown one slides in from the direction of travel.
 */
export function FormSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  const { active, index, total, direction } = useWizardStep(id);
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      hidden={!active}
      data-direction={direction}
      className={cn(styles.step, "scroll-mt-28")}
    >
      <header className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl border border-brand-300/40 bg-linear-to-br from-brand-100 to-surface-2 text-brand-800 shadow-glow-sm [&_svg]:size-6"
        >
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">
            Step {index + 1} of {total}
          </p>
          <h2 id={titleId} tabIndex={-1} className="font-display text-xl font-semibold tracking-tight text-fg focus:outline-none sm:text-2xl">
            {title}
          </h2>
          {description ? <p className="text-sm text-pretty text-fg-muted sm:text-base">{description}</p> : null}
        </div>
      </header>
      <div className={cn(styles.fields, "mt-6 space-y-6")}>{children}</div>
    </section>
  );
}
