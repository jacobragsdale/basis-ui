/* DataTable's heading row and its rows of data: the selection checkbox, a cell for each column the menu shows, drawn
 * by the column's `cell` or from its value, and the row's actions button. A row is memoised on plain values, its row,
 * whether it is selected, and the table's columns and functions, so a change elsewhere, such as a filter that keeps
 * it or another row's checkbox, draws only the rows that changed. */

import type { RowData } from "@tanstack/react-table";
import { memo } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";

import { cellOf, cellText } from "./data-table-columns.ts";
import type { DataTableColumn } from "./data-table-columns.ts";
import { SelectAllHead, SelectRowCell, SortableHead } from "./data-table-parts.tsx";
import { RowActionsCell } from "./data-table-row-menu.tsx";
import type { OpenRowMenu } from "./data-table-row-menu.tsx";
import type { DataTableInstance } from "./data-table-state.ts";
import { formattedText } from "./formatted-text.ts";
import { TableHead, TableRow } from "./table.tsx";
import { tableCellClasses, tableRowClasses } from "./table-variants.ts";

/** What a cell shows: the column's own drawing, a number's text by its column's display format, as `Formatted` shows
 * it in the cell's tabular figures, or the value's text. */
function cellContent<TRow>(column: DataTableColumn<TRow>, row: TRow): ReactNode {
  if (column.cell !== undefined) {
    return column.cell(row);
  }
  if (column.variant === "numeric") {
    return formattedText(column.value(row), column.format);
  }
  return cellText(cellOf(column, row));
}

/** Selects or clears every row the filter shows, on every page, keeping the choice for rows it hides. */
function selectShown<TRow extends RowData>(table: DataTableInstance<TRow>, select: boolean): void {
  const ids = new Set(table.getFilteredRowModel().rows.map((row) => row.id));
  table.setRowSelection((old) =>
    select
      ? { ...old, ...Object.fromEntries([...ids].map((id) => [id, true] as const)) }
      : Object.fromEntries(Object.entries(old).filter(([id]) => !ids.has(id))),
  );
}

/** The heading row: the select-all checkbox, a heading for each column, and one, read only by assistive technology,
 * over the actions. */
function DataTableHeadRow<TRow extends RowData>({
  table,
  columns,
  selectable,
  actions,
}: {
  readonly table: DataTableInstance<TRow>;
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly selectable: boolean;
  readonly actions: boolean;
}): ReactElement {
  const shown = table.getFilteredRowModel().rows;
  const selected = shown.filter((row) => row.getIsSelected()).length;
  const { sorting } = table.state;
  return (
    <TableRow>
      {selectable ? (
        <SelectAllHead
          checked={shown.length > 0 && selected === shown.length}
          indeterminate={selected > 0 && selected < shown.length}
          onCheckedChange={(select) => {
            selectShown(table, select);
          }}
        />
      ) : null}
      {columns.map((column) => {
        const position = sorting.findIndex((sort) => sort.id === column.id);
        const tableColumn = table.getColumn(column.id);
        return (
          <SortableHead
            key={column.id}
            header={column.header}
            numeric={column.variant === "numeric"}
            sortable={tableColumn?.getCanSort() ?? false}
            sorted={tableColumn?.getIsSorted() ?? false}
            sortPosition={sorting.length > 1 && position !== -1 ? position + 1 : undefined}
            onSort={tableColumn?.getToggleSortingHandler()}
          />
        );
      })}
      {actions ? (
        <TableHead scope="col" className="w-0">
          <span className="sr-only">Actions</span>
        </TableHead>
      ) : null}
    </TableRow>
  );
}

/** The table's columns, each the width its column asks for: the checkbox's, each column the menu shows, and the
 * actions'. A width is the column's least, so a cell whose text is wider widens it. */
function DataTableColumns<TRow>({
  columns,
  selectable,
  actions,
}: {
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly selectable: boolean;
  readonly actions: boolean;
}): ReactElement {
  return (
    <colgroup>
      {selectable ? <col /> : null}
      {columns.map(({ id, width }) =>
        width === undefined ? (
          <col key={id} />
        ) : (
          <col
            key={id}
            className="w-(--data-table-column-width)"
            style={{ "--data-table-column-width": `${String(width)}px` }}
          />
        ),
      )}
      {actions ? <col /> : null}
    </colgroup>
  );
}

/** Whether a click landed on a control inside the row, or ended a drag that selected text, rather than on the row. */
function onControl(event: MouseEvent<HTMLElement>): boolean {
  const { target } = event;
  const control =
    target instanceof Element &&
    target.closest(
      "a, button, input, select, textarea, label, [contenteditable], [role=button], [role=checkbox], [role=link], [role=menuitem], [role=switch]",
    ) !== null;
  return control || (globalThis.getSelection()?.toString() ?? "") !== "";
}

/** A row's classes: muted while its menu is open, and a pointer when a click on it does something. Joined by hand,
 * since they never conflict and a table draws a row many times. */
function rowClassesFor(menuOpen: boolean, clickable: boolean): string {
  return [tableRowClasses, menuOpen ? "bg-muted" : "", clickable ? "cursor-pointer" : ""]
    .filter((part) => part !== "")
    .join(" ");
}

/** A row's click handler, which tells the app of a click that did not land on a control; none without `onRowClick`. */
function rowClick<TRow>(
  row: TRow,
  onRowClick: ((row: TRow) => void) | undefined,
): ((event: MouseEvent<HTMLElement>) => void) | undefined {
  return onRowClick === undefined
    ? undefined
    : (event) => {
        if (!onControl(event)) {
          onRowClick(row);
        }
      };
}

interface DataTableRowProps<TRow> {
  readonly row: TRow;
  readonly id: string;
  readonly selected: boolean;
  /** The columns the menu shows, in order. */
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly selectable: boolean;
  readonly rowLabel: (row: TRow) => string;
  /** Opens the table's row menu, or `undefined` for a table without row actions. */
  readonly onOpenMenu: OpenRowMenu | undefined;
  /** Whether the row menu is open for this row. */
  readonly menuOpen: boolean;
  readonly onToggle: (id: string, checked: boolean, shift: boolean) => void;
  readonly onRowClick: ((row: TRow) => void) | undefined;
}

/** One row: its checkbox, its cells and its actions button. Its cells are drawn with TableCell's classes, made once,
 * rather than through it: a table at its row cap draws thousands, and each component a cell is work for React. */
function RowView<TRow>({
  row,
  id,
  selected,
  columns,
  selectable,
  rowLabel,
  onOpenMenu,
  menuOpen,
  onToggle,
  onRowClick,
}: DataTableRowProps<TRow>): ReactElement {
  const label = rowLabel(row);
  return (
    <tr
      data-slot="table-row"
      data-state={selected ? "selected" : undefined}
      className={rowClassesFor(menuOpen, onRowClick !== undefined)}
      onClick={rowClick(row, onRowClick)}
    >
      {selectable ? (
        <SelectRowCell
          label={label}
          checked={selected}
          onToggle={(checked, shift) => {
            onToggle(id, checked, shift);
          }}
        />
      ) : null}
      {columns.map((column) => (
        <td
          key={column.id}
          data-slot="table-cell"
          data-variant={column.variant ?? "default"}
          className={tableCellClasses[column.variant ?? "default"]}
        >
          {cellContent(column, row)}
        </td>
      ))}
      {onOpenMenu === undefined ? null : (
        <RowActionsCell id={id} label={label} open={menuOpen} onOpen={onOpenMenu} />
      )}
    </tr>
  );
}

/** A row, drawn again only when what it shows changes. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- memo returns the component it is given, typed without its type parameter, which this puts back.
const DataTableRow = memo(RowView) as typeof RowView;

export { DataTableColumns, DataTableHeadRow, DataTableRow };
