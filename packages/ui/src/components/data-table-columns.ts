/* DataTable's columns: what an app declares for each, and how DataTable turns that into TanStack Table's column
 * definitions, sorts and searches by it, and writes it into CSV and TSV.
 *
 * A column's `value` is the one source for the cell's sort, the copy and the export; its `cell` only draws it, and its
 * `text` is what the filter matches, the text the cell shows. A numeric column's value is a double, as an API sends it,
 * so it sorts by value and exports as a number that no spreadsheet reads as a formula. */

import type { ReactNode } from "react";

import type { DisplayFormat } from "#format/display-format.ts";
import type { Cell, Column } from "#utils/export.ts";
import { compareValues, isMissing } from "#utils/sort.ts";

import { formattedText } from "./formatted-text.ts";
import type { NumericValue } from "./num-text.ts";

/** What every column declares. */
interface DataTableColumnBase<TRow> {
  /** The column's key in the table's sort, visibility and filter, unique among its columns. */
  readonly id: string;
  /** The heading, which also heads the column in a copy or an export. */
  readonly header: string;
  /** What the cell shows, such as a link or `<Money value={row.price} />`; the value's text unless set. */
  readonly cell?: ((row: TRow) => ReactNode) | undefined;
  /** The text the cell shows, which the filter matches, for a `cell` that shows other text than the value's, as
   * `Buy` for `B`; a numeric column's value by its `format`, and any other column's value as text, unless set. */
  readonly text?: ((row: TRow) => string) | undefined;
  /** The column's width in CSS pixels, or its content's where that is wider; its content's unless set. */
  readonly width?: number | undefined;
  /** Whether the column sorts when its heading is pressed; yes unless set. */
  readonly sortable?: boolean | undefined;
  /** Whether the columns menu can hide it; yes unless set. */
  readonly hideable?: boolean | undefined;
  /** Whether the text filter searches its values; yes unless set. */
  readonly filterable?: boolean | undefined;
}

/** A column of text, or of anything but numbers. */
interface DataTableTextColumn<TRow> extends DataTableColumnBase<TRow> {
  readonly variant?: "default" | undefined;
  readonly value: (row: TRow) => Cell;
}

/** A column of numbers, aligned right in tabular figures, as Table's `variant="numeric"` cells are. */
interface DataTableNumericColumn<TRow> extends DataTableColumnBase<TRow> {
  readonly variant: "numeric";
  /** The number, a double as the API sends it. */
  readonly value: (row: TRow) => NumericValue;
  /** The display format the API declares for it, such as `displayFormats.CouponRow.interest` from the generated
   * client, which the cell shows it by unless the column draws its own `cell`. */
  readonly format?: DisplayFormat | undefined;
}

/** One of a DataTable's columns: `{ id, header, value }`, with `variant: "numeric"` for numbers. */
type DataTableColumn<TRow> = DataTableTextColumn<TRow> | DataTableNumericColumn<TRow>;

/** An action on one row, listed in the row's actions menu. */
interface DataTableRowAction {
  readonly label: string;
  readonly onSelect: () => void;
  /** `destructive` for one that deletes or cannot be undone. */
  readonly variant?: "default" | "destructive" | undefined;
  readonly disabled?: boolean | undefined;
}

/** A column a table sorts by, as `defaultSorting` lists them: ascending unless `desc`. */
interface DataTableSort {
  readonly id: string;
  readonly desc?: boolean | undefined;
}

/** The row cap unless a table sets its own: past it, a table's rows are too many to draw into the page. */
const defaultRowCap = 2000;

/** Rows a page unless a table sets its own: a page draws quickly on a Citrix desktop's CPU even at the row cap. */
const defaultPageSize = 50;

/** A value as DataTable sorts, searches and exports it: missing values as `undefined`, which sort last either way. */
type SortableCell = string | number | bigint | boolean | undefined;

/** A numeric column's value; NaN and a missing value sort last. */
function numericCell(value: NumericValue): SortableCell {
  return value === null || value === undefined || isMissing(value) ? undefined : value;
}

/** A text column's value. */
function textCell(value: Cell): SortableCell {
  return value === null || value === undefined || isMissing(value) ? undefined : value;
}

/** The column's value for a row, ready to sort, search and export. */
function cellOf<TRow>(column: DataTableColumn<TRow>, row: TRow): SortableCell {
  return column.variant === "numeric"
    ? numericCell(column.value(row))
    : textCell(column.value(row));
}

/** A value as text, as the filter searches it and as a row is named. */
function cellText(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" || typeof value === "bigint" ? String(value) : "";
}

/** The text a column's cell shows for a row, as the filter matches it: the column's `text`, a number by its format,
 * or the value's text. */
function shownText<TRow>(column: DataTableColumn<TRow>, row: TRow): string {
  if (column.text !== undefined) {
    return column.text(row);
  }
  return column.variant === "numeric"
    ? formattedText(column.value(row), column.format)
    : cellText(cellOf(column, row));
}

/** Two values in ascending order, by `sortBy`'s rules: numbers by value, text as people read it. */
function compareCells(left: unknown, right: unknown): number {
  return compareValues(left, right);
}

/** The columns as toCsv and toTsv take them, each value read as DataTable sorts it. */
function exportColumns<TRow>(columns: readonly DataTableColumn<TRow>[]): Column<TRow>[] {
  return columns.map((column) => ({
    header: column.header,
    value: (row: TRow) => cellOf(column, row),
  }));
}

export { cellOf, cellText, compareCells, defaultPageSize, defaultRowCap, exportColumns, shownText };
export type {
  DataTableColumn,
  DataTableNumericColumn,
  DataTableRowAction,
  DataTableSort,
  DataTableTextColumn,
  SortableCell,
};
