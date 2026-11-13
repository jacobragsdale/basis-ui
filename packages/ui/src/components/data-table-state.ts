/* DataTable's state on TanStack Table v9: the features it registers, its columns as TanStack's definitions, and the
 * table it renders from. Every part of the state is React's, the app's when it holds it (data-table-control.ts), so
 * TanStack only sorts, filters and selects; DataTable cuts the page from the rows TanStack keeps, so a page past the
 * last shows the last. */

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  functionalUpdate,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ColumnDef, ReactTable, Row, RowData, TableOptions } from "@tanstack/react-table";

import { cellOf, compareCells } from "./data-table-columns.ts";
import type { DataTableColumn, DataTableSort } from "./data-table-columns.ts";
import { useControllable, useRowSelection } from "./data-table-control.ts";
import type { DataTableStateProps, RowSelection } from "./data-table-control.ts";
import { textMatcher } from "./data-table-search.ts";
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
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableInstance<TRow extends RowData> = ReactTable<DataTableFeatures, TRow>;
type DataTableRow<TRow extends RowData> = Row<DataTableFeatures, TRow>;

interface DataTableOptions<TRow> {
  /** Every row, which the selection is kept to. */
  readonly data: readonly TRow[];
  /** The rows a FilterBar's values keep, which the table sorts and filters. */
  readonly kept: readonly TRow[];
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly getRowId: (row: TRow) => string;
  readonly selectable: boolean;
  readonly state: DataTableStateProps<TRow>;
}

/** The table, the columns hidden, and the page it shows, from 0, which the app or the table holds. */
interface DataTableState<TRow extends RowData> {
  readonly table: DataTableInstance<TRow>;
  readonly hidden: readonly string[];
  readonly page: number;
  readonly setPage: (page: number) => void;
}

const none: readonly never[] = [];

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
    sortFn: (left, right, id) =>
      compareCells(
        left.getValue(id),
        right.getValue(id),
        column.variant !== "numeric" && column.identifier === true,
      ),
    sortUndefined: "last",
  }));
}

/** The parts of the state that are not the selection, each with its change. */
interface StateParts {
  readonly sorts: readonly DataTableSort[];
  readonly setSorts: (sorting: readonly DataTableSort[]) => void;
  readonly filter: string;
  readonly setFilter: (filter: string) => void;
  readonly hidden: readonly string[];
  readonly setHidden: (hidden: readonly string[]) => void;
  readonly page: number;
  readonly setPage: (page: number) => void;
}

/** The parts of the state that are not the selection, each the app's or the table's own. */
function useStateParts<TRow>(state: DataTableStateProps<TRow>): StateParts {
  const [sorts, setSorts] = useControllable(
    state.sorting,
    state.defaultSorting ?? none,
    state.onSortingChange,
  );
  const [filter, setFilter] = useControllable(
    state.filter,
    state.defaultFilter ?? "",
    state.onFilterChange,
  );
  const [hidden, setHidden] = useControllable(
    state.hiddenColumns,
    state.defaultHiddenColumns ?? none,
    state.onHiddenColumnsChange,
  );
  const [page, setPage] = useControllable(state.page, state.defaultPage ?? 0, state.onPageChange);
  return { filter, hidden, page, setFilter, setHidden, setPage, setSorts, sorts };
}

/** What TanStack is given: the parts of the state, and the columns as its definitions and its filter. */
interface TableInputs<TRow extends RowData> {
  readonly options: DataTableOptions<TRow>;
  readonly parts: StateParts;
  readonly selection: RowSelection;
  readonly columnDefs: ColumnDef<DataTableFeatures, TRow>[];
  readonly matches: (row: TRow, id: string, filter: unknown) => boolean;
}

/** TanStack's options: every part of its state given, and each change sent to its part. A new sort or filter goes
 * back to the first page. */
function tableOptions<TRow extends RowData>({
  options: { kept, columns, getRowId, selectable },
  parts,
  selection,
  columnDefs,
  matches,
}: TableInputs<TRow>): TableOptions<DataTableFeatures, TRow> {
  const firstPage = (): void => {
    if (parts.page !== 0) {
      parts.setPage(0);
    }
  };
  const sorting = parts.sorts.map(({ id, desc = false }) => ({ desc, id }));
  const columnVisibility = Object.fromEntries(parts.hidden.map((id) => [id, false]));
  return {
    columns: columnDefs,
    data: kept,
    enableMultiSort: true,
    enableRowSelection: selectable,
    features: dataTableFeatures,
    getColumnCanGlobalFilter: ({ id }) =>
      columns.some((column) => column.id === id && column.filterable !== false),
    getRowId: (row) => getRowId(row),
    globalFilterFn: (row, columnId, wanted) => matches(row.original, columnId, wanted),
    isMultiSortEvent: isShiftEvent,
    isRowRangeSelectionEvent: isShiftEvent,
    onColumnVisibilityChange: (updater) => {
      const next = functionalUpdate(updater, columnVisibility);
      parts.setHidden(Object.keys(next).filter((id) => next[id] === false));
    },
    onGlobalFilterChange: (updater) => {
      const next: unknown = functionalUpdate(updater, parts.filter);
      parts.setFilter(typeof next === "string" ? next : "");
      firstPage();
    },
    onRowSelectionChange: selection.change,
    onSortingChange: (updater) => {
      parts.setSorts(functionalUpdate(updater, sorting));
      firstPage();
    },
    sortDescFirst: false,
    state: {
      columnVisibility,
      globalFilter: parts.filter,
      rowSelection: selection.rowSelection,
      sorting,
    },
  };
}

/** The table DataTable renders. Sorting starts ascending on every column, and Shift adds a column to it. */
function useDataTable<TRow extends RowData>(options: DataTableOptions<TRow>): DataTableState<TRow> {
  const { data, columns, getRowId, state } = options;
  const parts = useStateParts(state);
  const selection = useRowSelection(data, getRowId, state);
  // Made again only when the columns are, so TanStack keeps its rows.
  const columnDefs = columnDefsFor(columns);
  const matches = textMatcher(columns);
  const table = useTable<DataTableFeatures, TRow>(
    tableOptions({ columnDefs, matches, options, parts, selection }),
  );
  return { hidden: parts.hidden, page: parts.page, setPage: parts.setPage, table };
}

/** The page to show of `rows` the filters keep: `page`, or the last page when `page` is past it. */
function shownPage(page: number, pageSize: number, rows: number): number {
  const last = Math.max(Math.ceil(rows / pageSize) - 1, 0);
  return Math.min(Math.max(page, 0), last);
}

/** The filter's text, which TanStack types loosely. */
function filterOf<TRow extends RowData>(table: DataTableInstance<TRow>): string {
  const filter: unknown = table.state.globalFilter;
  return typeof filter === "string" ? filter : "";
}

/** The rows the filters keep, in their order, on every page. */
function shownRows<TRow extends RowData>(table: DataTableInstance<TRow>): TRow[] {
  return table.getRowModel().rows.map((row) => row.original);
}

/** The selected rows the filters keep, in their order. */
function selectedRows<TRow extends RowData>(table: DataTableInstance<TRow>): TRow[] {
  return table
    .getRowModel()
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

export { columnChoices, filterOf, isShiftEvent, selectedRows, shownPage, shownRows, useDataTable };
export type { DataTableInstance, DataTableRow, DataTableState };
export type { DataTableStateProps, SelectionListener } from "./data-table-control.ts";
