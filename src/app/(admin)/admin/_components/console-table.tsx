import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

// The admin console's table: the UI kit DataTable's contract (semantic table in a
// focusable horizontal-scroll region; stacked cards below 640px unless mobile="scroll"),
// styled as glass rows that slide in one after another (CSS only, reduced motion shows
// them at once). Pages can give phones a purpose-built card per row (`mobileCard`): a
// compact summary that is easier to scan than every column as a label/value pair.

export type ConsoleColumn<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right" | "center";
  /** The cell that names the row (row header; card title on phones). Defaults to the first column. */
  primary?: boolean;
  /** Buttons/links for the row: shown last, without a label, in phone cards. */
  actions?: boolean;
  /** Leave this column out of the phone cards. */
  hideOnMobile?: boolean;
  className?: string;
};

export type ConsoleTableProps<Row> = {
  /** Describes the table; also labels its scroll region. */
  caption: ReactNode;
  captionHidden?: boolean;
  columns: readonly ConsoleColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  /** Rendered instead of the table when there are no rows. */
  empty?: ReactNode;
  /** Below 640px: stacked cards (default) or the table scrolling sideways. */
  mobile?: "stack" | "scroll";
  /**
   * The phone card for one row (below 640px), instead of every column as a label/value pair.
   * Rendered inside a `relative` list item, so a link can cover the whole card
   * (`after:absolute after:inset-0`). Used even when `mobile` is "scroll".
   */
  mobileCard?: (row: Row) => ReactNode;
  /** Extra attributes per row: an id to link to, or data-map-id to link the row with a map marker. */
  rowAttributes?: (row: Row) => { id?: string; "data-map-id"?: string };
  /** Plain rows without their own glass container (inside a Panel); phone cards become divided rows. */
  bare?: boolean;
  /** Tighter cell padding, for wide tables that must fit next to the sidebar. */
  dense?: boolean;
  className?: string;
};

const alignClasses = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function ConsoleTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  getRowKey,
  empty,
  mobile = "stack",
  mobileCard,
  rowAttributes,
  bare = false,
  dense = false,
  className,
}: ConsoleTableProps<Row>) {
  const captionId = useId();
  const cardsLabelId = useId();
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((column) => column.primary) ?? columns[0];
  const cardColumns = columns.filter((column) => column !== primary && !column.hideOnMobile && !column.actions);
  const actionColumns = columns.filter((column) => column.actions && !column.hideOnMobile);
  const stacked = mobile === "stack" || mobileCard !== undefined;

  return (
    <div className={className}>
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className={cn("overflow-x-auto rounded-2xl", !bare && "glass-lite", stacked && "hidden sm:block")}
      >
        <table className="min-w-full text-sm">
          <caption
            id={captionId}
            className={cn("px-4 py-3 text-left text-sm font-semibold text-fg", captionHidden && "sr-only")}
          >
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "py-3 font-mono text-[11px] font-medium tracking-[0.14em] whitespace-nowrap text-fg-subtle uppercase",
                    dense ? "px-3" : "px-4",
                    alignClasses[column.align ?? "left"],
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger-children">
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                {...rowAttributes?.(row)}
                className="border-b border-line align-middle transition-[background-color,box-shadow] duration-200 last:border-b-0 hover:bg-fg/[0.035] target:bg-neon-cyan/[0.06] data-[active]:bg-neon-cyan/[0.07] data-[active]:shadow-[inset_3px_0_0_0_var(--color-neon-cyan)]"
              >
                {columns.map((column) => {
                  const classes = cn(
                    "py-3.5 text-fg-muted",
                    dense ? "px-3" : "px-4",
                    alignClasses[column.align ?? "left"],
                    column.className,
                  );
                  return column === primary ? (
                    <th key={column.key} scope="row" className={cn(classes, "font-medium text-fg")}>
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={classes}>
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stacked ? (
        <div className="sm:hidden">
          <p id={cardsLabelId} className={cn("mb-2 text-sm font-semibold text-fg", captionHidden && "sr-only")}>
            {caption}
          </p>
          <ul
            aria-labelledby={cardsLabelId}
            className={cn("stagger-children", bare ? "divide-y divide-line" : "space-y-3")}
          >
            {rows.map((row) => (
              <li
                key={getRowKey(row)}
                data-map-id={rowAttributes?.(row)["data-map-id"]}
                className={cn(
                  "relative transition-[background-color,box-shadow] duration-200",
                  bare
                    ? "px-2 py-3.5 data-[active]:bg-neon-cyan/[0.07]"
                    : "glass-lite rounded-2xl p-4 data-[active]:shadow-[var(--shadow-glow-sm)]",
                )}
              >
                {mobileCard ? (
                  mobileCard(row)
                ) : (
                  <>
                    {primary ? <div className="font-medium text-fg">{primary.cell(row)}</div> : null}
                    {cardColumns.length > 0 ? (
                      <dl className="mt-3 space-y-2 text-sm">
                        {cardColumns.map((column) => (
                          <div key={column.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
                            <dt className="font-mono text-[11px] tracking-[0.12em] text-fg-subtle uppercase">{column.header}</dt>
                            <dd className="min-w-0 break-words text-fg-muted">{column.cell(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {actionColumns.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 [&>*]:min-w-0 [&>*]:flex-1">
                        {actionColumns.map((column) => (
                          <div key={column.key} className="flex [&>*]:flex-1">
                            {column.cell(row)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The usual body of a phone card: a title (often a link covering the card), a meta line,
 * a row of chips and an optional footer line. Server-safe.
 */
export function MobileCardBody({
  title,
  meta,
  chips,
  footer,
  aside,
}: {
  title: ReactNode;
  meta?: ReactNode;
  chips?: ReactNode;
  footer?: ReactNode;
  /** Shown at the top right (an amount, a time). */
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-pretty text-fg">{title}</div>
          {meta ? <div className="text-xs text-fg-subtle">{meta}</div> : null}
        </div>
        {aside ? <div className="shrink-0 text-right">{aside}</div> : null}
      </div>
      {chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
      {footer ? <div className="text-xs text-fg-subtle">{footer}</div> : null}
    </div>
  );
}
