import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DataTableColumn<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right" | "center";
  /**
   * The cell that names the row: rendered as <th scope="row"> in the table and as the
   * card title on phones. Defaults to the first column.
   */
  primary?: boolean;
  /** Buttons/links for the row: shown last, without a label, in phone cards. */
  actions?: boolean;
  /** Leave this column out of the phone cards. */
  hideOnMobile?: boolean;
  className?: string;
};

export type DataTableProps<Row> = {
  /** Describes the table; also labels its scroll region. */
  caption: ReactNode;
  captionHidden?: boolean;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  /** Rendered instead of the table when there are no rows (e.g. an EmptyState). */
  empty?: ReactNode;
  /** "stack" (default): cards below 640px, table above. "scroll": always a table that scrolls sideways. */
  mobile?: "stack" | "scroll";
  /** Max height of the table region (CSS length); the header stays visible while it scrolls. */
  maxHeight?: string;
  className?: string;
};

const alignClasses = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Semantic table in a horizontally scrollable, keyboard-focusable region, with a phone card layout. */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  getRowKey,
  empty,
  mobile = "stack",
  maxHeight,
  className,
}: DataTableProps<Row>) {
  const captionId = useId();
  const cardsLabelId = useId();
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((column) => column.primary) ?? columns[0];
  const cardColumns = columns.filter(
    (column) => column !== primary && !column.hideOnMobile && !column.actions,
  );
  const actionColumns = columns.filter((column) => column.actions && !column.hideOnMobile);

  return (
    <div className={className}>
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className={cn(
          "glass-lite relative overflow-x-auto rounded-2xl",
          maxHeight && "overflow-y-auto",
          mobile === "stack" && "hidden sm:block",
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <caption
            id={captionId}
            className={cn(
              "border-b border-line px-4 py-3 text-left font-display text-sm font-semibold text-fg",
              captionHidden && "sr-only",
            )}
          >
            {caption}
          </caption>
          <thead className="sticky top-0 z-10 bg-surface/90 backdrop-blur-md">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "border-b border-line px-4 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-fg-subtle uppercase",
                    alignClasses[column.align ?? "left"],
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>*]:border-b-0">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="align-middle transition-colors duration-150 hover:bg-fg/[0.035]">
                {columns.map((column) => {
                  const classes = cn(
                    "border-b border-line px-4 py-3 text-fg-muted",
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

      {mobile === "stack" ? (
        <div className="sm:hidden">
          <p id={cardsLabelId} className={cn("mb-2 font-display text-sm font-semibold text-fg", captionHidden && "sr-only")}>
            {caption}
          </p>
          <ul aria-labelledby={cardsLabelId} className="stagger-children space-y-3">
            {rows.map((row) => (
              <li key={getRowKey(row)} className="glass-lite relative rounded-2xl p-4">
                {primary ? <div className="font-medium text-fg">{primary.cell(row)}</div> : null}
                {cardColumns.length > 0 ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    {cardColumns.map((column) => (
                      <div key={column.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
                        <dt className="text-fg-subtle">{column.header}</dt>
                        <dd className="min-w-0 break-words text-fg">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {actionColumns.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                    {actionColumns.map((column) => (
                      <div key={column.key}>{column.cell(row)}</div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
