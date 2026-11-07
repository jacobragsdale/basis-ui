/* DataTable's state on TanStack Table v9: the features it registers, its columns as TanStack's definitions, and the
 * table it renders from. Sorting, the text filter, column visibility and paging are TanStack's own state; the row
 * selection is React's, so a change can tell the app which rows are chosen. */

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  ReactTable,
  Row,
  RowData,
  RowSelectionState,
  Updater,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { cellOf, compareCells, matchesFilter } from "./data-table-columns.ts";
import type { DataTableColumn, DataTableSort } from "./data-table-columns.ts";
import type { ColumnChoice } from "./data-table-toolbar.tsx";

/** Every feature DataTable uses, each processing slot after the feature it needs, at module scope so the table keeps
 * one registry. */
const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnVisibilityFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableInstance<TRow extends RowData> = ReactTable<DataTableFeatures, TRow>;
type DataTableRow<TRow extends RowData> = Row<DataTableFeatures, TRow>;

interface DataTableOptions<TRow> {
  readonly data: readonly TRow[];
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly getRowId: (row: TRow) => string;
  readonly selectable: boolean;
  /** Rows a page; the row cap when the table does not page, so every row is on its one page. */
  readonly pageSize: number;
  readonly defaultSorting: readonly DataTableSort[];
  readonly onSelectionChange: ((rows: readonly TRow[]) => void) | undefined;
}

/** Shift with a click adds a column to the sort, or selects the rows from the last one chosen. */
function isShiftEvent(event: unknown): boolean {
  return (
    typeof event === "object" && event !== null && "shiftKey" in event && event.shiftKey === true
  );
}

/** The app's columns as TanStack's: each reads its value as DataTable sorts it, sorts by `sortBy`'s rules, and puts
 * missing values last whichever way it sorts. */
function columnDefsFor<TRow extends RowData>(
  columns: readonly DataTableColumn<TRow>[],
): ColumnDef<DataTableFeatures, TRow>[] {
  return columns.map((column) => ({
    accessorFn: (row: TRow) => cellOf(column, row),
    enableHiding: column.hideable !== false,
    enableSorting: column.sortable !== false,
    header: column.header,
    id: column.id,
    sortFn: (left, right, id) => compareCells(left.getValue(id), right.getValue(id)),
    sortUndefined: "last",
  }));
}

/** The next selection an updater gives, from the current one. */
function nextSelection(
  updater: Updater<RowSelectionState>,
  current: RowSelectionState,
): RowSelectionState {
  return typeof updater === "function" ? updater(current) : updater;
}

/** The table DataTable renders. Sorting starts ascending on every column, and Shift adds a column to it. */
function useDataTable<TRow extends RowData>({
  data,
  columns,
  getRowId,
  selectable,
  pageSize,
  defaultSorting,
  onSelectionChange,
}: DataTableOptions<TRow>): DataTableInstance<TRow> {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const columnDefs = useMemo(() => columnDefsFor(columns), [columns]);
  const filterable = new Set(
    columns.filter((column) => column.filterable !== false).map((column) => column.id),
  );
  return useTable<DataTableFeatures, TRow>({
    columns: columnDefs,
    data,
    enableMultiSort: true,
    enableRowSelection: selectable,
    features: dataTableFeatures,
    getColumnCanGlobalFilter: (column) => filterable.has(column.id),
    getRowId: (row) => getRowId(row),
    globalFilterFn: (row, columnId, filter) => matchesFilter(row.getValue(columnId), filter),
    initialState: {
      globalFilter: "",
      pagination: { pageIndex: 0, pageSize },
      sorting: defaultSorting.map(({ id, desc = false }) => ({ desc, id })),
    },
    isMultiSortEvent: isShiftEvent,
    isRowRangeSelectionEvent: isShiftEvent,
    onRowSelectionChange: (updater) => {
      const next = nextSelection(updater, rowSelection);
      setRowSelection(next);
      onSelectionChange?.(data.filter((row) => next[getRowId(row)] === true));
    },
    sortDescFirst: false,
    state: { rowSelection },
  });
}

/** The filter's text, which TanStack types loosely. */
function filterOf<TRow extends RowData>(table: DataTableInstance<TRow>): string {
  const filter: unknown = table.state.globalFilter;
  return typeof filter === "string" ? filter : "";
}

/** The rows the filter shows, in their order, on every page. */
function shownRows<TRow extends RowData>(table: DataTableInstance<TRow>): TRow[] {
  return table.getPrePaginatedRowModel().rows.map((row) => row.original);
}

/** The selected rows the filter shows, in their order. */
function selectedRows<TRow extends RowData>(table: DataTableInstance<TRow>): TRow[] {
  return table
    .getPrePaginatedRowModel()
    .rows.filter((row) => row.getIsSelected())
    .map((row) => row.original);
}

/** The columns as the menu lists them; the last column showing cannot be hidden. */
function columnChoices<TRow extends RowData>(
  table: DataTableInstance<TRow>,
  columns: readonly DataTableColumn<TRow>[],
): ColumnChoice[] {
  const showing = table.getVisibleLeafColumns().length;
  return columns.map(({ id, header }) => {
    const column = table.getColumn(id);
    const visible = column?.getIsVisible() ?? true;
    const enabled = (column?.getCanHide() ?? false) && !(visible && showing === 1);
    return { enabled, header, id, visible };
  });
}

export { columnChoices, filterOf, isShiftEvent, selectedRows, shownRows, useDataTable };
export type { DataTableInstance, DataTableRow };
