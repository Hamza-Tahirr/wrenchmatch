import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
  className?: string;
};

/** Eyebrow + holographic h2 + intro paragraph, revealed as it scrolls in. */
export function SectionHeading({ id, eyebrow, title, description, align = "start", className }: SectionHeadingProps) {
  return (
    <div className={cn("reveal max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p
        className={cn(
          "inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.24em] text-neon-cyan uppercase",
          align === "center" && "justify-center",
        )}
      >
        <span aria-hidden="true" className="h-px w-6 bg-linear-to-r from-transparent to-neon-cyan" />
        {eyebrow}
        <span aria-hidden="true" className="h-px w-6 bg-linear-to-l from-transparent to-neon-cyan" />
      </p>
      <h2 id={id} className="mt-4 font-display text-3xl leading-tight font-semibold tracking-tight text-fg sm:text-[2.6rem]">
        {title}
      </h2>
      {description ? <div className="mt-4 text-lg/8 text-fg-muted">{description}</div> : null}
    </div>
  );
}

/** Highlighted words inside a section title. */
export function Holo({ children }: { children: ReactNode }) {
  return <span className="holo-text">{children}</span>;
}
