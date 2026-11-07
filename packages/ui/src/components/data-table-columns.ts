/* DataTable's columns: what an app declares for each, and how DataTable turns that into TanStack Table's column
 * definitions, sorts and searches by it, and writes it into CSV and TSV.
 *
 * A column's `value` is the one source for the cell's sort, the text filter, the copy and the export; its `cell` only
 * draws it. A numeric column's value is a number as an API sends it: decimal text, a Decimal, a double or a bigint.
 * DataTable reads decimal text and a Decimal into its own Decimal, by its shape, since an app's `@basis/ui/numbers` can
 * be a second copy of the class, so it sorts by value and exports as a number that no spreadsheet reads as a formula. */

import type { ReactNode } from "react";

import { Decimal } from "#numbers/decimal.ts";
import type { Cell, Column } from "#utils/export.ts";
import { compareValues, isMissing } from "#utils/sort.ts";

import type { DecimalLike, NumericValue } from "./num-text.ts";

/** What every column declares. */
interface DataTableColumnBase<TRow> {
  /** The column's key in the table's sort, visibility and filter, unique among its columns. */
  readonly id: string;
  /** The heading, which also heads the column in a copy or an export. */
  readonly header: string;
  /** What the cell shows, such as a link or `<Money value={row.price} />`; the value's text unless set. */
  readonly cell?: ((row: TRow) => ReactNode) | undefined;
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
  /** The number as the API sends it; decimal text must be a decimal, as `Decimal.from` reads it. */
  readonly value: (row: TRow) => NumericValue;
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

/** A value as DataTable sorts, searches and exports it: missing values as `undefined`, which sort last either way. */
type SortableCell = string | number | bigint | boolean | Decimal | undefined;

function isDecimalLike(value: unknown): value is DecimalLike {
  return typeof value === "object" && value !== null && "unscaled" in value && "scale" in value;
}

/** A numeric column's value as this package's Decimal, number or bigint. */
function numericCell(value: NumericValue): SortableCell {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return Decimal.from(value);
  }
  if (isDecimalLike(value)) {
    return Decimal.from(value.unscaled, value.scale);
  }
  return isMissing(value) ? undefined : value;
}

/** A text column's value, with a Decimal from another copy of the class read as this package's. */
function textCell(value: Cell): SortableCell {
  if (value === null || value === undefined || isMissing(value)) {
    return undefined;
  }
  return isDecimalLike(value) ? Decimal.from(value.unscaled, value.scale) : value;
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
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return value instanceof Decimal ? value.toString() : "";
}

/** Whether a value's text holds what the filter asks for, ignoring case. */
function matchesFilter(value: unknown, filter: unknown): boolean {
  const wanted = typeof filter === "string" ? filter.trim().toLocaleLowerCase("en-US") : "";
  return cellText(value).toLocaleLowerCase("en-US").includes(wanted);
}

/** Two values in ascending order, by `sortBy`'s rules: numbers and Decimals by value, text as people read it. */
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

export { cellOf, cellText, compareCells, defaultRowCap, exportColumns, matchesFilter };
export type {
  DataTableColumn,
  DataTableNumericColumn,
  DataTableRowAction,
  DataTableSort,
  DataTableTextColumn,
  SortableCell,
};
