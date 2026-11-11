/* What DataTable's text filter matches: the text each cell shows, as `5,000,000` or `99-16+`, ignoring case. Each row's
 * texts are worked out once for its columns and kept while the row and the columns are the same objects, so a filter
 * over the rows at the row cap costs a lookup a cell rather than a format a cell. */

import { shownText } from "./data-table-columns.ts";
import type { DataTableColumn } from "./data-table-columns.ts";

/** Each row's lower-cased texts by column id, for each array of columns. */
const kept = new WeakMap<object, WeakMap<object, ReadonlyMap<string, string>>>();

/** Text without case, as the filter compares it. Not `toLocaleLowerCase`, which costs ten times as much a cell. */
function lower(text: string): string {
  return text.toLowerCase();
}

/** A row's lower-cased texts, by column id, for each column the filter searches. */
function textsOf<TRow>(
  columns: readonly DataTableColumn<TRow>[],
  row: TRow,
): ReadonlyMap<string, string> {
  return new Map(
    columns
      .filter((column) => column.filterable !== false)
      .map((column) => [column.id, lower(shownText(column, row))]),
  );
}

/** A row's texts, from those kept when the row is an object. */
function keptTexts<TRow>(
  columns: readonly DataTableColumn<TRow>[],
  row: TRow,
): ReadonlyMap<string, string> {
  if (typeof row !== "object" || row === null) {
    return textsOf(columns, row);
  }
  const byRow = kept.get(columns) ?? new WeakMap<object, ReadonlyMap<string, string>>();
  kept.set(columns, byRow);
  const texts = byRow.get(row) ?? textsOf(columns, row);
  byRow.set(row, texts);
  return texts;
}

/** Whether the text a row's cell shows in a column holds the filter's text, ignoring case, for the table's columns. */
function textMatcher<TRow>(
  columns: readonly DataTableColumn<TRow>[],
): (row: TRow, id: string, filter: unknown) => boolean {
  // The filter's text as last lowered, since TanStack asks once a cell with the same filter.
  let last = { filter: "", wanted: "" };
  return (row, id, filter) => {
    const text = typeof filter === "string" ? filter : "";
    if (text !== last.filter) {
      last = { filter: text, wanted: lower(text.trim()) };
    }
    return keptTexts(columns, row).get(id)?.includes(last.wanted) ?? false;
  };
}

export { textMatcher };
