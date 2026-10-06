import { isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  /** An icon element such as `<Inbox />`. */
  icon?: ReactNode;
  /**
   * A spot illustration (e.g. from "@/components/illustrations"), shown instead of the icon.
   * Decorative: it is hidden from screen readers.
   */
  illustration?: ReactNode;
  title: ReactNode;
  /** Explanation and next step. `children` works too. */
  body?: ReactNode;
  children?: ReactNode;
  /** A ButtonLink or Button that moves the user forward. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
};

/** Honest "nothing here yet" state with a next step. */
export function EmptyState({
  icon,
  illustration,
  title,
  body,
  children,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const text = body ?? children;
  // A sized spot illustration passed as `icon` (e.g. <NoQuotes className="w-40" />) is art, not a glyph.
  const iconIsArt =
    isValidElement<{ className?: unknown }>(icon) &&
    typeof icon.props.className === "string" &&
    /(^|\s)(sm:|md:)?w-(\d|\[)/.test(icon.props.className);
  const art = illustration ?? (iconIsArt ? icon : null);
  return (
    <div
      className={cn(
        "relative isolate flex animate-fade-in flex-col items-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-48 w-3/4 rounded-full bg-neon-cyan/10 blur-3xl"
      />
      {art ? (
        <div
          aria-hidden="true"
          className={cn(
            "mb-5 flex max-w-full justify-center",
            illustration ? "w-40 sm:w-48 [&>svg]:h-auto [&>svg]:w-full" : undefined,
          )}
        >
          {art}
        </div>
      ) : icon ? (
        <span
          aria-hidden="true"
          className="mb-4 grid size-14 place-items-center rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan shadow-glow-sm [&_svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <Heading className="text-base font-semibold text-fg">{title}</Heading>
      {text ? <div className="mt-1.5 max-w-md text-sm text-pretty text-fg-muted">{text}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
