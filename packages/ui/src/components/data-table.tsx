/* DataTable: a table on TanStack Table v9 for small data whose cells hold links and buttons, drawn as DOM rows on
 * Table's parts. It sorts by one column or, with Shift, several; filters by text; hides and shows columns; selects
 * rows, one at a time, a range with Shift, or all the filter shows; lists each row's actions; pages when asked; and
 * copies the selection as TSV and exports the rows as CSV, through `@basis/ui/utils`' writers, which keep a cell from
 * running as a formula.
 *
 * It is for small data. Past its row cap, 2,000 rows unless the table sets its own, it draws nothing and shows one
 * error that sends the data to parallax's `<Grid>`, which draws only the rows on screen.
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
import type { ReactElement, ReactNode } from "react";

import { Button } from "./button.tsx";
import { RowCapAlert } from "./data-table-cap.tsx";
import { DataTableHeadRow, DataTableRows } from "./data-table-body.tsx";
import { cellOf, cellText, defaultRowCap } from "./data-table-columns.ts";
import type { DataTableColumn, DataTableRowAction, DataTableSort } from "./data-table-columns.ts";
import { copyRows, exportRows } from "./data-table-export.ts";
import { DataTablePagination } from "./data-table-pagination.tsx";
import { EmptyRow, LoadingRows } from "./data-table-parts.tsx";
import {
  columnChoices,
  filterOf,
  selectedRows,
  shownRows,
  useDataTable,
} from "./data-table-state.ts";
import type { DataTableInstance, SelectionListener } from "./data-table-state.ts";
import { DataTableToolbar } from "./data-table-toolbar.tsx";
import { ErrorAlert } from "./error-alert.tsx";
import { Table, TableBody, TableHeader } from "./table.tsx";

interface DataTableProps<TRow extends RowData> {
  /** The table's name, for assistive technology and the filter, and its CSV file's unless `exportName` is set. */
  readonly label: string;
  readonly columns: readonly DataTableColumn<TRow>[];
  /** The rows, or `undefined` while there are none yet, as a query's `data` is before it loads. */
  readonly data: readonly TRow[] | undefined;
  /** A row's stable id, such as its CUSIP or trade id, which keeps it selected as the rows sort and change. */
  readonly getRowId: (row: TRow) => string;
  /** A row's name, for its checkbox and its actions button; its first column's value unless set. */
  readonly rowLabel?: ((row: TRow) => string) | undefined;
  /** A row's actions, listed in a menu at the row's end. */
  readonly rowActions?: ((row: TRow) => readonly DataTableRowAction[]) | undefined;
  /** Adds a checkbox to each row and the heading, and the button that copies the selection; no unless set. */
  readonly selectable?: boolean | undefined;
  /** Hears the selected rows, in order, and their ids on each change and when new data drops or replaces one. */
  readonly onSelectionChange?: SelectionListener<TRow> | undefined;
  /** Whether the toolbar has the text filter; yes unless set. */
  readonly filterable?: boolean | undefined;
  /** Whether the toolbar has the CSV export; yes unless set. */
  readonly exportable?: boolean | undefined;
  /** The CSV file's name, without `.csv`; the label unless set. */
  readonly exportName?: string | undefined;
  /** Rows a page, for a table that pages; every row on one page unless set. */
  readonly pageSize?: number | undefined;
  readonly defaultSorting?: readonly DataTableSort[] | undefined;
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
  /** Places the table, as with `mt-4`; its look is fixed. */
  readonly className?: string | undefined;
}

const noRows: readonly never[] = [];

/** What the parts under DataTableView share: the table, the app's props, and the columns the menu shows. */
interface ViewParts<TRow extends RowData> {
  readonly table: DataTableInstance<TRow>;
  readonly props: DataTableProps<TRow>;
  readonly columns: readonly DataTableColumn<TRow>[];
}

/** A row's name: the app's, or its first column's value as text. */
function rowLabelFor<TRow extends RowData>(props: DataTableProps<TRow>): (row: TRow) => string {
  const [first] = props.columns;
  return (
    props.rowLabel ??
    ((row: TRow): string => (first === undefined ? "" : cellText(cellOf(first, row))))
  );
}

/** The toolbar, from the table's state. */
function ToolbarFor<TRow extends RowData>({
  table,
  props,
  columns,
}: ViewParts<TRow>): ReactElement {
  const { label, exportName = label } = props;
  return (
    <DataTableToolbar
      label={label}
      filter={props.filterable === false ? undefined : filterOf(table)}
      onFilterChange={(filter) => {
        table.setGlobalFilter(filter);
      }}
      selected={props.selectable === true ? selectedRows(table).length : undefined}
      rows={table.getPrePaginatedRowModel().rows.length}
      onCopy={() => {
        copyRows(selectedRows(table), columns).catch(reportError);
      }}
      columns={columnChoices(table, props.columns)}
      onColumnVisibilityChange={(id, show) => {
        table.getColumn(id)?.toggleVisibility(show);
      }}
      onExport={
        props.exportable === false
          ? undefined
          : () => {
              exportRows(exportName, shownRows(table), columns);
            }
      }
    />
  );
}

/** The line that says the table is empty: of rows, or of rows the filter matches, with a button that clears it. */
function EmptyContentFor<TRow extends RowData>({
  table,
  props,
  span,
}: Omit<ViewParts<TRow>, "columns"> & { readonly span: number }): ReactElement {
  const filter = filterOf(table).trim();
  if (filter === "") {
    return <EmptyRow columns={span} title="No rows to show." description={props.empty} />;
  }
  return (
    <EmptyRow
      columns={span}
      title={`No rows match "${filter}".`}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            table.setGlobalFilter("");
          }}
        >
          Clear the filter
        </Button>
      }
    />
  );
}

/** The table itself: its heading row, then placeholders while it loads, the page's rows, or the line that says it is
 * empty. */
function TableFor<TRow extends RowData>({ table, props, columns }: ViewParts<TRow>): ReactElement {
  const selectable = props.selectable ?? false;
  const span = columns.length + Number(selectable) + Number(props.rowActions !== undefined);
  let body = <EmptyContentFor table={table} props={props} span={span} />;
  if (props.loading === true) {
    body = <LoadingRows columns={span} />;
  } else if (table.getRowModel().rows.length > 0) {
    body = (
      <DataTableRows
        table={table}
        columns={columns}
        selectable={selectable}
        rowLabel={rowLabelFor(props)}
        rowActions={props.rowActions}
      />
    );
  }
  return (
    <Table aria-label={props.label} aria-busy={props.loading === true ? true : undefined}>
      <TableHeader>
        <DataTableHeadRow
          table={table}
          columns={columns}
          selectable={selectable}
          rowActions={props.rowActions}
        />
      </TableHeader>
      <TableBody>{body}</TableBody>
    </Table>
  );
}

/** The line under a paged table. */
function PaginationFor<TRow extends RowData>({
  table,
  pageSize,
}: {
  readonly table: DataTableInstance<TRow>;
  readonly pageSize: number;
}): ReactElement {
  return (
    <DataTablePagination
      pageIndex={table.state.pagination.pageIndex}
      pageCount={table.getPageCount()}
      pageSize={pageSize}
      rows={table.getPrePaginatedRowModel().rows.length}
      onPrevious={
        table.getCanPreviousPage()
          ? () => {
              table.previousPage();
            }
          : undefined
      }
      onNext={
        table.getCanNextPage()
          ? () => {
              table.nextPage();
            }
          : undefined
      }
    />
  );
}

/** A DataTable within its row cap. */
function DataTableView<TRow extends RowData>({
  className,
  ...props
}: DataTableProps<TRow> & {
  readonly data: readonly TRow[];
  readonly rowCap: number;
}): ReactElement {
  const { data, error, onRetry, pageSize } = props;
  const table = useDataTable({
    columns: props.columns,
    data,
    defaultSorting: props.defaultSorting ?? noRows,
    getRowId: props.getRowId,
    onSelectionChange: props.onSelectionChange,
    pageSize: pageSize ?? props.rowCap,
    selectable: props.selectable ?? false,
  });
  const visible = new Set(table.getVisibleLeafColumns().map((column) => column.id));
  const columns = props.columns.filter((column) => visible.has(column.id));
  if (error !== null && error !== undefined && data.length === 0) {
    return <ErrorAlert error={error} onRetry={onRetry} className={className} />;
  }
  return (
    <div data-slot="data-table" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <ErrorAlert error={error} onRetry={onRetry} />
      <ToolbarFor table={table} props={props} columns={columns} />
      <TableFor table={table} props={props} columns={columns} />
      {pageSize === undefined || props.loading === true ? null : (
        <PaginationFor table={table} pageSize={pageSize} />
      )}
    </div>
  );
}

/** A table of a few hundred rows, or up to its row cap, whose cells may hold links and buttons.
 *
 * @example
 * ```tsx
 * import { DataTable } from "@basis/ui";
 *
 * const rows = [{ cusip: "91282CRF0", id: "p1", par: 5_000_000 }];
 *
 * const columns = [{ header: "Par", id: "par", value: (row: (typeof rows)[number]) => row.par, variant: "numeric" as const }];
 *
 * <DataTable label="Positions" columns={columns} data={rows} getRowId={(row) => row.id} />;
 * ```
 */
function DataTable<TRow extends RowData>({
  data,
  rowCap = defaultRowCap,
  ...props
}: DataTableProps<TRow>): ReactElement {
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
  return <DataTableView {...props} data={rows} rowCap={rowCap} />;
}

export { DataTable };
export type { DataTableProps };
