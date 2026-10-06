import type { HTMLAttributes, ReactNode } from "react";
import { TiltCard } from "@/components/motion/glow-card";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  /** Render as a landmark-free container (div), a section/article, or a list item. */
  as?: "div" | "section" | "article" | "li";
  /**
   * "glass" (default): translucent panel with a luminous border, no blur (cheap in lists).
   * "frosted": real backdrop blur (hero/feature panels). "glow": glass with an animated
   * neon border (one highlight per screen, e.g. the selected quote).
   */
  variant?: "glass" | "frosted" | "glow";
  /**
   * Hover feedback for cards that are link or button targets: true = lift + neon edge glow;
   * "tilt" = 3D tilt toward the pointer with a following spotlight (mouse only).
   */
  interactive?: boolean | "tilt";
};

const variants = {
  glass: "glass-lite",
  frosted: "glass",
  glow: "glass-lite glow-border shadow-glow-sm",
} as const;

/** Glass surface. Compose with CardHeader, CardBody and CardFooter. */
export function Card({ as: Tag = "div", variant = "glass", interactive = false, className, ...props }: CardProps) {
  if (interactive === "tilt") {
    return (
      <TiltCard
        as={Tag}
        className={cn(
          "overflow-hidden rounded-2xl transition-[border-color,box-shadow] duration-300 hover:border-neon-cyan/40 hover:shadow-glow-sm",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <Tag
      className={cn("overflow-hidden rounded-2xl", variants[variant], interactive && "card-hover", className)}
      {...props}
    />
  );
}

type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, links or badges aligned to the end of the header. */
  actions?: ReactNode;
  /** Heading level of the title; pick the level that fits the page outline. */
  titleAs?: "h2" | "h3" | "h4";
  titleId?: string;
  className?: string;
};

export function CardHeader({ title, description, actions, titleAs: Title = "h2", titleId, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <Title id={titleId} className="text-base font-semibold tracking-tight text-fg">
          {title}
        </Title>
        {description ? <div className="text-sm text-fg-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative px-4 py-4 sm:px-6 sm:py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex flex-col-reverse gap-2 border-t border-line bg-fg/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
