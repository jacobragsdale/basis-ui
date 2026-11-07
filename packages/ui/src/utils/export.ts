/* CSV and TSV text for export to Excel, and saving a file from the browser.
 *
 * Fields are quoted as RFC 4180 says: a field holding the separator, a double quote, a carriage return or a line feed
 * is wrapped in double quotes, with its own double quotes doubled, and records end with CRLF. A text cell that starts
 * with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with `'`, so a spreadsheet shows it as text rather
 * than running it as a formula (OWASP's CSV injection guidance). Numbers, bigints and Decimals are written as numbers
 * and never prefixed, since their digits cannot form a formula and a negative number must stay a number. */

import { Decimal } from "#numbers/decimal.ts";

/** What a cell may hold. Format dates and other values in the column's `value`. */
type Cell = string | number | bigint | boolean | Decimal | null | undefined;

interface Column<TRow> {
  /** The header row's text. */
  readonly header: string;
  readonly value: (row: TRow) => Cell;
}

/** Characters a spreadsheet reads as the start of a formula, or that hide one: OWASP's list. */
const formulaStarts = new Set(["=", "+", "-", "@", "\t", "\r"]);

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  if (typeof cell === "boolean") {
    return cell ? "TRUE" : "FALSE";
  }
  if (typeof cell === "number") {
    // NaN and the infinities have no value a spreadsheet reads; the cell is left empty.
    return Number.isFinite(cell) ? String(cell) : "";
  }
  if (typeof cell === "bigint" || cell instanceof Decimal) {
    return cell.toString();
  }
  return formulaStarts.has(cell.charAt(0)) ? `'${cell}` : cell;
}

function field(text: string, separator: string): string {
  const needsQuotes = text.includes(separator) || /["\r\n]/u.test(text);
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

function delimited<TRow>(
  rows: readonly TRow[],
  columns: readonly Column<TRow>[],
  separator: string,
): string {
  const header = columns.map(({ header: text }) => field(cellText(text), separator));
  const records = rows.map((row) =>
    columns.map(({ value }) => field(cellText(value(row)), separator)),
  );
  return [header, ...records].map((record) => `${record.join(separator)}\r\n`).join("");
}

/** CSV text: a header row of the columns' headers, then a record for each row. For Excel to read non-ASCII text, save
 * it with a byte order mark: `new Blob(["\uFEFF", csv], { type: "text/csv" })`. */
function toCsv<TRow>(rows: readonly TRow[], columns: readonly Column<TRow>[]): string {
  return delimited(rows, columns, ",");
}

/** TSV text, which pastes into a spreadsheet's cells: the same as `toCsv`, separated by tabs. */
function toTsv<TRow>(rows: readonly TRow[], columns: readonly Column<TRow>[]): string {
  return delimited(rows, columns, "\t");
}

/** How long the object URL outlives the click, since a browser may start the download after the click returns. */
const revokeAfterMs = 60_000;

/** Saves a Blob as a file named `name`, through a temporary link, as the browser's download does. */
function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, revokeAfterMs);
}

export { downloadBlob, toCsv, toTsv };
export type { Cell, Column };
