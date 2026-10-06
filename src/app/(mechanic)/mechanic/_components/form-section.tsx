import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type FormSectionProps = {
  /** Anchor for in-page links, e.g. "about" (#about). */
  id: string;
  /** Shown in a numbered marker before the title. */
  step?: number;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** A titled glass section of a long form, labelled by its h2, with a numbered neon marker. */
export function FormSection({ id, step, title, description, icon, className, children }: FormSectionProps) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("glass-lite relative scroll-mt-24 overflow-hidden rounded-2xl sm:scroll-mt-40", className)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/60 to-transparent" />
      <div className="flex items-start gap-4 border-b border-line px-4 py-4 sm:px-6">
        {step !== undefined ? (
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon-cyan to-neon-blue font-mono text-sm font-bold text-on-brand shadow-glow-sm"
          >
            {String(step).padStart(2, "0")}
          </span>
        ) : icon ? (
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/30 [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} tabIndex={-1} className="font-display text-xl font-semibold tracking-tight text-fg focus:outline-none">
            {step !== undefined ? <span className="sr-only">Step {step}: </span> : null}
            {title}
          </h2>
          {description ? <div className="text-sm text-pretty text-fg-muted">{description}</div> : null}
        </div>
      </div>
      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}
