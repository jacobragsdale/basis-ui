/* DataTable: a table on TanStack Table v9 for small data whose cells hold links and buttons, drawn as DOM rows on
 * Table's parts. It sorts by one column or, with Shift, several; filters by the text its cells show; hides and shows
 * columns; selects rows, one at a time, a range with Shift, or all the filter shows; lists each row's actions; shows
 * 50 rows a page unless told otherwise; and copies the selection as TSV and exports the rows as CSV, through
 * `@basis/ui/utils`' writers, which keep a cell from running as a formula. The sort, the filter, the columns hidden,
 * the page and the selection are the table's own, or the app's when it passes them, each with its change; a
 * FilterBar's values narrow the rows through `filterBy`.
 *
 * It is for small data. Past its row cap, 2,000 rows unless the table sets its own, it draws nothing and shows one
 * error that sends the data to parallax's `<Grid>`, which draws only the rows on screen. At the cap, a page, a key in
 * the filter and a change of mode each take under 200 ms of the main thread with the CPU slowed four times, as the
 * gallery's main-thread test holds it: the rows are memoised, the filter waits for typing to pause, a row's checkbox is
 * the browser's own and its menu is made when it opens.
 *
 *   <DataTable
 *     label="Positions"
 *     data={positions.data?.data}
 *     columns={[
 *       { id: "cusip", header: "CUSIP", value: (row) => row.cusip },
 *       { id: "par", header: "Par", variant: "numeric", value: (row) => row.par },
 *     ]}
 *     getRowId={(row) => row.cusip}
 *     loading={positions.isPending}
 *     error={positions.error}
 *   /> */

import type { RowData } from "@tanstack/react-table";
import { cn } from "cn";
import type { ReactElement } from "react";

import { RowCapAlert } from "./data-table-cap.tsx";
import { defaultRowCap } from "./data-table-columns.ts";
import { PaginationFor } from "./data-table-pagination.tsx";
import type { DataTableProps } from "./data-table-props.ts";
import { RowActionsMenu } from "./data-table-row-menu.tsx";
import { TableFor, ToolbarFor } from "./data-table-table.tsx";
import { useDataTableView } from "./data-table-view.ts";
import { ErrorAlert } from "./error-alert.tsx";
import type { FilterDefinitions } from "./filter-definitions.ts";

const noRows: readonly never[] = [];

/** A DataTable within its row cap. */
function DataTableView<TRow extends RowData, TFilters extends FilterDefinitions>({
  className,
  ...props
}: DataTableProps<TRow, TFilters> & { readonly data: readonly TRow[] }): ReactElement {
  const { data, error, onRetry, rowActions } = props;
  const view = useDataTableView(props);
  if (error !== null && error !== undefined && data.length === 0) {
    return <ErrorAlert error={error} onRetry={onRetry} className={className} />;
  }
  const { table, shared, onPageChange, rowMenu } = view;
  const { onCloseMenu } = rowMenu;
  return (
    <div
      data-slot="data-table"
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-3 *:data-[slot=table-container]:min-h-0 *:data-[slot=table-container]:flex-1",
        className,
      )}
    >
      <ErrorAlert error={error} onRetry={onRetry} />
      <ToolbarFor table={table} props={props} columns={shared.columns} />
      <TableFor
        table={table}
        props={props}
        rows={view.rows}
        shared={shared}
        menuOpenFor={rowMenu.menu?.open === true ? rowMenu.menu.id : undefined}
      />
      {!view.paged || props.loading === true ? null : (
        <PaginationFor
          label={props.label}
          page={view.page}
          pageSize={view.pageSize}
          rows={table.getRowModel().rows.length}
          onPageChange={onPageChange}
        />
      )}
      {/* Made once a row's menu opens, since Base UI's menu costs a first draw even while it is closed. */}
      {rowActions === undefined || rowMenu.menu === undefined ? null : (
        <RowActionsMenu
          menu={rowMenu.menu}
          onClose={onCloseMenu}
          rows={view.kept}
          getRowId={props.getRowId}
          rowActions={rowActions}
        />
      )}
    </div>
  );
}

/** A table of a few hundred rows, or up to its row cap, whose cells may hold links and buttons.
 * @use With sorting, filtering, selection, pages, copying and export, each of whose state the app may hold. Under a
 * FilterBar, pass its values as `filterBy`. Past its row cap, or to group or pivot, use parallax's Grid.
 * @see Table, Grid, FilterBar, Num, Money, CellBar, ErrorAlert
 * @example
 * ```tsx
 * import { DataTable } from "@basis/ui";
 * const rows = [{ cusip: "91282CRF0", id: "p1", par: 5_000_000 }];
 * const columns = [{ header: "Par", id: "par", value: (row: (typeof rows)[number]) => row.par, variant: "numeric" as const }];
 *
 * <DataTable label="Positions" columns={columns} data={rows} getRowId={(row) => row.id} />;
 * ```
 */
function DataTable<TRow extends RowData, TFilters extends FilterDefinitions = FilterDefinitions>({
  data,
  rowCap = defaultRowCap,
  ...props
}: DataTableProps<TRow, TFilters>): ReactElement {
  const rows = data ?? noRows;
  if (rows.length > rowCap) {
    return (
      <RowCapAlert
        label={props.label}
        rows={rows.length}
        cap={rowCap}
        className={props.className}
      />
    );
  }
  return <DataTableView {...props} data={rows} />;
}

export { DataTable };
export type { DataTableProps } from "./data-table-props.ts";
