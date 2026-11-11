/* DataTable's props: what it shows and how, and the parts of its state an app may hold (data-table-control.ts). */

import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { DataTableColumn, DataTableRowAction } from "./data-table-columns.ts";
import type { DataTableStateProps } from "./data-table-control.ts";
import type { FilterDefinitions } from "./filter-definitions.ts";
import type { FilterRowsOptions } from "./filter-rows.ts";

interface DataTableProps<
  TRow extends RowData,
  TFilters extends FilterDefinitions = FilterDefinitions,
> extends DataTableStateProps<TRow> {
  /** The table's name, for assistive technology and the filter, and its CSV file's unless `exportName` is set. */
  readonly label: string;
  /** The columns, in order: each one's `id`, `header` and `value`, and `cell` when its value's text is not enough. */
  readonly columns: readonly DataTableColumn<TRow>[];
  /** The rows, or `undefined` while there are none yet, as a query's `data` is before it loads. */
  readonly data: readonly TRow[] | undefined;
  /** A row's stable id, such as its CUSIP or trade id, which keeps it selected as the rows sort and change. */
  readonly getRowId: (row: TRow) => string;
  /** A row's name, for its checkbox and its actions button; its first column's value unless set. */
  readonly rowLabel?: ((row: TRow) => string) | undefined;
  /** A row's actions, listed in a menu at the row's end, asked for when the row's menu opens. */
  readonly rowActions?: ((row: TRow) => readonly DataTableRowAction[]) | undefined;
  /** Hears a click on a row, but not on a link, button or checkbox in it: a pointer's shortcut, so keep a link or an
   * action in the row for the keyboard. */
  readonly onRowClick?: ((row: TRow) => void) | undefined;
  /** Adds a checkbox to each row and the heading, and the button that copies the selection; no unless set. */
  readonly selectable?: boolean | undefined;
  /** A FilterBar's filters, the values `useFilters` gives and how each reads its field, as `filterRows` takes them:
   * the table shows the rows they keep, and keeps the selection of rows they hide. */
  readonly filterBy?: FilterRowsOptions<TRow, TFilters> | undefined;
  /** Whether the toolbar has the text filter; yes unless set. */
  readonly filterable?: boolean | undefined;
  /** Whether the toolbar has the CSV export; yes unless set. */
  readonly exportable?: boolean | undefined;
  /** The CSV file's name, without `.csv`; the label unless set. */
  readonly exportName?: string | undefined;
  /** Rows a page; 50 unless set. A table of more rows than a page, or with a page size set, shows its pages. */
  readonly pageSize?: number | undefined;
  /** The most rows the table draws; 2,000 unless set. Past it the table shows an error in their place. */
  readonly rowCap?: number | undefined;
  /** Shows placeholder rows in place of the rows, as while a query is pending. */
  readonly loading?: boolean | undefined;
  /** An error to show over the table, such as a query's `error`, as `ErrorAlert` shows it. */
  readonly error?: unknown;
  /** Adds "Try again" to the error, such as a query's `refetch`. */
  readonly onRetry?: (() => void) | undefined;
  /** What the table says when it has no rows; "No rows to show." unless set. */
  readonly empty?: ReactNode;
  /** Places the table, as with `mt-4`. Given a height, as with `h-96` or in a Page that fills the window, its rows
   * scroll under a header that stays in view; its look is fixed. */
  readonly className?: string | undefined;
}

export type { DataTableProps };
