import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./button";
import { ButtonLink } from "./button-link";

export type PaginationProps = {
  /** Link to the previous page; omit on the first page. */
  prevHref?: string | null;
  /** Link to the next page; omit on the last page. */
  nextHref?: string | null;
  page?: number;
  totalPages?: number;
  label?: string;
  className?: string;
};

const disabledClasses = buttonClasses({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-50" });

/** Previous/next links with an optional "Page 2 of 5". */
export function Pagination({ prevHref, nextHref, page, totalPages, label = "Pagination", className }: PaginationProps) {
  return (
    <nav aria-label={label} className={cn("flex items-center justify-between gap-3", className)}>
      {prevHref ? (
        <ButtonLink href={prevHref} rel="prev" variant="secondary" size="sm" leadingIcon={<ChevronLeft />}>
          Previous
        </ButtonLink>
      ) : (
        <span aria-hidden="true" className={disabledClasses}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </span>
      )}
      {page !== undefined && totalPages !== undefined ? (
        <p className="font-mono text-xs text-fg-muted tabular-nums">
          Page {page} of {totalPages}
        </p>
      ) : null}
      {nextHref ? (
        <ButtonLink href={nextHref} rel="next" variant="secondary" size="sm" trailingIcon={<ChevronRight />}>
          Next
        </ButtonLink>
      ) : (
        <span aria-hidden="true" className={disabledClasses}>
          Next
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
