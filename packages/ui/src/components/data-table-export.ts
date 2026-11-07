/* DataTable's copy and export: the selected rows to the clipboard as TSV, which pastes into a spreadsheet's cells, and
 * the rows the filter shows to a CSV file, both through `@basis/ui/utils`' writers, which prefix a text cell that
 * would run as a formula, and both with the columns the menu shows, as headed in the table. */

import { downloadBlob, toCsv, toTsv } from "#utils/export.ts";

import { exportColumns } from "./data-table-columns.ts";
import type { DataTableColumn } from "./data-table-columns.ts";
import { toast } from "./toast-manager.ts";

const counts = new Intl.NumberFormat("en-US");
/** Excel reads a CSV as UTF-8 only when it starts with a byte order mark. */
const byteOrderMark = "﻿";
/** Characters Windows does not allow in a file's name. */
const unsafeInFileName = /[\\/:*?"<>|]/gu;

function rowCount(rows: number): string {
  return `${counts.format(rows)} ${rows === 1 ? "row" : "rows"}`;
}

/** Copies the rows to the clipboard as TSV, with a header row, and says so in a toast. */
async function copyRows<TRow>(
  rows: readonly TRow[],
  columns: readonly DataTableColumn<TRow>[],
): Promise<void> {
  try {
    await navigator.clipboard.writeText(toTsv(rows, exportColumns(columns)));
    toast.add({
      description: "Paste them into a spreadsheet.",
      title: `Copied ${rowCount(rows.length)}`,
      type: "success",
    });
  } catch (error) {
    toast.add({
      description:
        error instanceof Error
          ? error.message
          : "The browser did not allow the page to use the clipboard.",
      title: "The rows were not copied",
      type: "destructive",
    });
  }
}

/** Saves the rows as `name.csv`, with a header row. */
function exportRows<TRow>(
  name: string,
  rows: readonly TRow[],
  columns: readonly DataTableColumn<TRow>[],
): void {
  const csv = toCsv(rows, exportColumns(columns));
  downloadBlob(
    `${name.replaceAll(unsafeInFileName, "-")}.csv`,
    new Blob([byteOrderMark, csv], { type: "text/csv;charset=utf-8" }),
  );
}

export { copyRows, exportRows };
