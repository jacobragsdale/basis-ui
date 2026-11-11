/* DataTable's parts over its rows: the toolbar, the table with its heading row, which stays in view as the rows
 * scroll under it, and the line that says it is empty. Each reads TanStack's table, as DataTableView gives it. */

import type { RowData } from "@tanstack/react-table";
import type { ReactElement } from "react";

import { Button } from "./button.tsx";
import { DataTableColumns, DataTableHeadRow, DataTableRow } from "./data-table-body.tsx";
import type { DataTableColumn } from "./data-table-columns.ts";
import { copyRows, exportRows } from "./data-table-export.ts";
import { EmptyRow, LoadingRows } from "./data-table-parts.tsx";
import type { DataTableProps } from "./data-table-props.ts";
import type { OpenRowMenu } from "./data-table-row-menu.tsx";
import { columnChoices, filterOf, selectedRows, shownRows } from "./data-table-state.ts";
import type { DataTableInstance, DataTableRow as TableRowModel } from "./data-table-state.ts";
import { DataTableToolbar } from "./data-table-toolbar.tsx";
import { Table, TableBody } from "./table.tsx";

/** What the parts under DataTableView share: the table, the app's props, and the columns the menu shows. */
interface ViewParts<TRow extends RowData> {
  readonly table: DataTableInstance<TRow>;
  readonly props: DataTableProps<TRow>;
  readonly columns: readonly DataTableColumn<TRow>[];
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
      rows={table.getRowModel().rows.length}
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

/** The line that says the table is empty: of rows, of rows the text filter matches, with a button that clears it,
 * or of rows a FilterBar's values keep, which its own Clear all clears. */
function EmptyContentFor<TRow extends RowData>({
  table,
  props,
  span,
}: Omit<ViewParts<TRow>, "columns"> & { readonly span: number }): ReactElement {
  const filter = filterOf(table).trim();
  if (filter === "") {
    const narrowed = table.getCoreRowModel().rows.length === 0 && (props.data?.length ?? 0) > 0;
    return narrowed ? (
      <EmptyRow columns={span} title="No rows match the filters." />
    ) : (
      <EmptyRow columns={span} title="No rows to show." description={props.empty} />
    );
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

/** What the rows share: the table's columns, functions and row menu. */
interface RowsShared<TRow extends RowData> {
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly selectable: boolean;
  readonly rowLabel: (row: TRow) => string;
  readonly onOpenMenu: OpenRowMenu | undefined;
  readonly onToggle: (id: string, checked: boolean, shift: boolean) => void;
  readonly onRowClick: ((row: TRow) => void) | undefined;
}

/** The page's rows, each told whether its menu is open. */
function PageRows<TRow extends RowData>({
  rows,
  shared,
  menuOpenFor,
}: {
  readonly rows: readonly TableRowModel<TRow>[];
  readonly shared: RowsShared<TRow>;
  readonly menuOpenFor: string | undefined;
}): ReactElement {
  return (
    <>
      {rows.map((row) => (
        <DataTableRow
          key={row.id}
          row={row.original}
          id={row.id}
          selected={row.getIsSelected()}
          menuOpen={row.id === menuOpenFor}
          {...shared}
        />
      ))}
    </>
  );
}

/** The table itself: its heading row, which stays in view, then placeholders while it loads, the page's rows, or a
 * line that it is empty. */
function TableFor<TRow extends RowData>({
  table,
  props,
  rows,
  shared,
  menuOpenFor,
}: Omit<ViewParts<TRow>, "columns"> & {
  readonly rows: readonly TableRowModel<TRow>[];
  readonly shared: RowsShared<TRow>;
  /** The id of the row whose menu is open, if one is. */
  readonly menuOpenFor: string | undefined;
}): ReactElement {
  const { columns, selectable } = shared;
  const actions = shared.onOpenMenu !== undefined;
  const span = columns.length + Number(selectable) + Number(actions);
  let body = <EmptyContentFor table={table} props={props} span={span} />;
  if (props.loading === true) {
    body = <LoadingRows columns={span} />;
  } else if (rows.length > 0) {
    body = <PageRows rows={rows} shared={shared} menuOpenFor={menuOpenFor} />;
  }
  return (
    <Table aria-label={props.label} aria-busy={props.loading === true ? true : undefined}>
      <DataTableColumns columns={columns} selectable={selectable} actions={actions} />
      {/* TableHeader's own classes, and its place at the top of the scrolling rows. */}
      <thead
        data-slot="table-header"
        className="sticky top-0 z-raised bg-background [&_tr]:border-b"
      >
        <DataTableHeadRow
          table={table}
          columns={columns}
          selectable={selectable}
          actions={actions}
        />
      </thead>
      <TableBody>{body}</TableBody>
    </Table>
  );
}

export { TableFor, ToolbarFor };
export type { RowsShared };
