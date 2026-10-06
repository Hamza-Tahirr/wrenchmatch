import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 2 for top-level page sections (default), 3 for sections nested in another. */
  headingLevel?: 2 | 3;
  /** Element id, e.g. for in-page links (#quotes). */
  id?: string;
  className?: string;
  children?: ReactNode;
};

/** A titled block of page content, labelled by its heading. */
export function Section({
  title,
  description,
  actions,
  headingLevel = 2,
  id,
  className,
  children,
}: SectionProps) {
  const generatedId = useId();
  const headingId = `${id ?? generatedId}-title`;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cn("space-y-4", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <Heading
                id={headingId}
                className={cn(
                  "flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg",
                  headingLevel === 2 ? "text-xl" : "text-lg",
                )}
              >
                {headingLevel === 2 ? (
                  <span
                    aria-hidden="true"
                    className="h-4 w-1 shrink-0 rounded-full bg-linear-to-b from-neon-cyan to-neon-violet shadow-[0_0_10px_var(--color-neon-cyan)]"
                  />
                ) : null}
                <span className="min-w-0">{title}</span>
              </Heading>
            ) : null}
            {description ? <div className="max-w-2xl text-sm text-fg-muted">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
