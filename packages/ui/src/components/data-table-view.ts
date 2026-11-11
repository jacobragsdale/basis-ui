/* What DataTable works out for the rows it draws: the rows a FilterBar's values keep, kept until the data or the
 * values change, the page showing, and a checkbox's toggle that stays the same function from render to render, so
 * the memoised rows are not drawn again for it. */

import type { RowData } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cellOf, cellText, defaultPageSize } from "./data-table-columns.ts";
import type { DataTableColumn } from "./data-table-columns.ts";
import type { DataTableProps } from "./data-table-props.ts";
import type { OpenRowMenu, RowMenu } from "./data-table-row-menu.tsx";
import { shownPage, useDataTable } from "./data-table-state.ts";
import type { DataTableInstance, DataTableRow } from "./data-table-state.ts";
import type { RowsShared } from "./data-table-table.tsx";
import type { FilterDefinitions } from "./filter-definitions.ts";
import { filterRows } from "./filter-rows.ts";
import type { FilterRowsOptions } from "./filter-rows.ts";

/** The rows `filterBy` keeps, or `data` itself without it. */
function keptBy<TRow, TFilters extends FilterDefinitions>(
  data: readonly TRow[],
  filterBy: FilterRowsOptions<TRow, TFilters> | undefined,
): readonly TRow[] {
  return filterBy === undefined ? data : filterRows(data, filterBy);
}

/** The rows a FilterBar's values keep, worked out again only when the data, the filters or the values change, as
 * plain JSON, so values made afresh each render cost nothing. */
function useKeptRows<TRow, TFilters extends FilterDefinitions>(
  data: readonly TRow[],
  filterBy: FilterRowsOptions<TRow, TFilters> | undefined,
): readonly TRow[] {
  const key = filterBy === undefined ? "" : JSON.stringify(filterBy.values);
  const filters = filterBy?.filters;
  const [held, setHeld] = useState(() => ({ data, filters, key, rows: keptBy(data, filterBy) }));
  if (held.data === data && held.filters === filters && held.key === key) {
    return held.rows;
  }
  const next = { data, filters, key, rows: keptBy(data, filterBy) };
  setHeld(next);
  return next.rows;
}

/** The rows of the page showing, and that page, from 0. */
function pageOf<TRow extends RowData>(
  rows: readonly DataTableRow<TRow>[],
  page: number,
  pageSize: number,
): { readonly page: number; readonly rows: readonly DataTableRow<TRow>[] } {
  const shown = shownPage(page, pageSize, rows.length);
  return { page: shown, rows: rows.slice(shown * pageSize, (shown + 1) * pageSize) };
}

/** Toggles a row's selection by its id, as the table last drawn holds it: the same function every render. */
function useRowToggle<TRow extends RowData>(
  table: DataTableInstance<TRow>,
): (id: string, checked: boolean, shift: boolean) => void {
  const latest = useRef(table);
  useLayoutEffect(() => {
    latest.current = table;
  });
  return useCallback((id: string, checked: boolean, shift: boolean) => {
    latest.current.getRow(id).getToggleSelectedHandler()({ shiftKey: shift, target: { checked } });
  }, []);
}

/** The row menu: the row it is open for, or was last, so it can close as it opened; the same opener every render,
 * and the close. */
function useRowMenu(): {
  readonly menu: RowMenu | undefined;
  readonly onOpenMenu: OpenRowMenu;
  readonly onCloseMenu: () => void;
} {
  const [menu, setMenu] = useState<RowMenu | undefined>();
  const onOpenMenu = useCallback<OpenRowMenu>((id, anchor, keyboard) => {
    setMenu({ anchor, id, keyboard, open: true });
  }, []);
  return {
    menu,
    onCloseMenu: () => {
      setMenu((open) => (open === undefined ? open : { ...open, open: false }));
    },
    onOpenMenu,
  };
}

/** A row's name: the app's, or its first column's value as text. */
function rowLabelFor<TRow>(
  rowLabel: ((row: TRow) => string) | undefined,
  first: DataTableColumn<TRow> | undefined,
): (row: TRow) => string {
  return (
    rowLabel ?? ((row: TRow): string => (first === undefined ? "" : cellText(cellOf(first, row))))
  );
}

/** What DataTableView draws from. */
interface DataTableViewState<TRow extends RowData> {
  readonly table: DataTableInstance<TRow>;
  /** The rows a FilterBar's values keep. */
  readonly kept: readonly TRow[];
  /** The page showing, from 0, and its rows. */
  readonly page: number;
  readonly rows: readonly DataTableRow<TRow>[];
  readonly pageSize: number;
  /** Whether the table shows its pages: it was given a page size, or holds more rows than a page. */
  readonly paged: boolean;
  readonly onPageChange: (page: number) => void;
  readonly rowMenu: ReturnType<typeof useRowMenu>;
  readonly shared: RowsShared<TRow>;
}

/** The table, its page, and what its rows share, each the same object until what it holds changes, so a row is drawn
 * again only when it changes. */
function useDataTableView<TRow extends RowData, TFilters extends FilterDefinitions>(
  props: DataTableProps<TRow, TFilters> & { readonly data: readonly TRow[] },
): DataTableViewState<TRow> {
  const { data, columns: all, getRowId, filterBy, pageSize = defaultPageSize, rowActions } = props;
  const kept = useKeptRows(data, filterBy);
  const selectable = props.selectable ?? false;
  const { table, hidden, page, setPage } = useDataTable({
    columns: all,
    data,
    getRowId,
    kept,
    selectable,
    state: props,
  });
  const shown = pageOf(table.getRowModel().rows, page, pageSize);
  const rowMenu = useRowMenu();
  const shared: RowsShared<TRow> = {
    columns: all.filter((column) => !hidden.includes(column.id)),
    onOpenMenu: rowActions === undefined ? undefined : rowMenu.onOpenMenu,
    onRowClick: props.onRowClick,
    onToggle: useRowToggle(table),
    rowLabel: rowLabelFor(props.rowLabel, all[0]),
    selectable,
  };
  const paged = props.pageSize !== undefined || data.length > pageSize;
  return {
    kept,
    page: shown.page,
    pageSize,
    paged,
    rowMenu,
    rows: shown.rows,
    onPageChange: setPage,
    shared,
    table,
  };
}

export { useDataTableView };
