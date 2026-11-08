/* A worksheet part's rows as records of text, as read-workbook.ts gives them: each cell by its type, a shared or
 * inline string, a formula's string, a boolean, an error, an ISO date, or a number by its format (workbook-cells.ts);
 * each row by its number in the sheet; and the blank rows left out, as parseCsv leaves out blank lines. A cell may
 * omit its reference, as some writers do, and then follows the cell before it. */

import { ZipError } from "./read-zip.ts";
import { isoCellText, numericCellText } from "./workbook-cells.ts";
import type { NumberKind } from "./workbook-cells.ts";
import { richText, unescapeOoxml } from "./workbook-parts.ts";
import { attribute } from "./xml-scan.ts";
import type { XmlScanner, XmlTag } from "./xml-scan.ts";

/** One row of a sheet: its number, its cells as text, and why any of them holds no value. */
interface SheetRecord {
  /** The row's number in the sheet, as Excel numbers it. */
  readonly line: number;
  /** Its cells as text, from column A to its last cell with a value; a cell without one is empty. */
  readonly fields: readonly string[];
  /** Why a cell holds nothing a schema can read, by its index in `fields`: an Excel error such as `#N/A`, or a
   * formula Excel never calculated. Absent when no cell has a problem. */
  readonly problems?: ReadonlyMap<number, string>;
}

/** What reading a sheet's cells needs from the rest of the workbook. */
interface SheetContext {
  readonly strings: readonly string[];
  /** What each cell style's number format shows, by the style's index. */
  readonly styles: readonly NumberKind[];
  readonly date1904: boolean;
}

/** What a cell holds, as its tags give it. */
interface CellContent {
  readonly type: string | undefined;
  readonly style: number;
  readonly value: string | undefined;
  readonly inline: string | undefined;
  readonly formula: boolean;
}

/** A cell's text, and why it holds nothing to read, when it does not. */
interface CellResult {
  readonly text: string;
  readonly problem?: string;
}

/** A row as it is read: its number and the column it is at, its fields so far, and their problems. */
interface RowState {
  readonly line: number;
  readonly context: SheetContext;
  readonly fields: string[];
  readonly problems: Map<number, string>;
  column: number;
}

/** What the tags inside a cell have given so far. */
interface Gathered {
  value: string | undefined;
  inline: string | undefined;
  formula: boolean;
}

/** Excel's largest sheet: 1,048,576 rows of 16,384 columns. */
const maxColumns = 16_384;
const maxRows = 1_048_576;
const letters = 26;
/** A column letter's value is its code point less this: 1 for A, 26 for Z. */
const beforeA = 64;
/** A lower-case letter's code point is this much more than its capital's. */
const lowerCase = 32;

const uncalculated: CellResult = {
  problem:
    "A formula Excel has not calculated: open the file in Excel, save it, and import it again.",
  text: "",
};

/** A column's index from a cell reference's letters, 0 for `A1` and 26 for `AA7`, or the next column's when the cell
 * has no reference. */
function columnIndex(reference: string | undefined, previous: number): number {
  if (reference === undefined) {
    return previous + 1;
  }
  let index = 0;
  for (const character of reference) {
    const point = character.codePointAt(0) ?? 0;
    const letter = point > beforeA + lowerCase ? point - lowerCase : point;
    if (letter <= beforeA || letter > beforeA + letters) {
      break;
    }
    index = index * letters + letter - beforeA;
  }
  return index - 1;
}

/** Takes what one tag inside a cell holds: its value, its formula, or its inline string. */
function gather(scanner: XmlScanner, inner: XmlTag, into: Gathered): void {
  if (inner.name === "v") {
    into.value = inner.empty ? "" : scanner.text();
  } else if (inner.name === "f") {
    into.formula = true;
  } else if (inner.name === "is") {
    into.inline = inner.empty ? "" : richText(scanner, "is");
  }
}

/** A cell's value, inline string and formula, from its opening tag to its closing one. */
function cellContent(scanner: XmlScanner, tag: XmlTag): CellContent {
  const into: Gathered = { formula: false, inline: undefined, value: undefined };
  let inner = tag.empty ? undefined : scanner.next();
  while (inner !== undefined && !(inner.closing && inner.name === "c")) {
    if (!inner.closing) {
      gather(scanner, inner, into);
    }
    inner = scanner.next();
  }
  return { ...into, style: Number(attribute(tag, "s") ?? "0"), type: attribute(tag, "t") };
}

/** A shared string cell's text, by its index. */
function sharedText(index: string, context: SheetContext): CellResult {
  const text = context.strings[Number(index)];
  return text === undefined
    ? { problem: "The workbook lacks the shared string this cell refers to.", text: "" }
    : { text };
}

/** A number's text, by its style's format. */
function numberResult(cell: CellContent, value: string, context: SheetContext): CellResult {
  const kind = context.styles[cell.style] ?? "number";
  const read = numericCellText(value, kind, context.date1904);
  return read.ok ? { text: read.text } : { problem: read.reason, text: value };
}

/** A cell's text by its type, for the types other than a number's: a shared string, a formula's string, a
 * boolean, an error and an ISO date. */
const typedResults = new Map<string, (value: string, context: SheetContext) => CellResult>([
  ["s", (value, context): CellResult => sharedText(value, context)],
  ["str", (value): CellResult => ({ text: unescapeOoxml(value) })],
  ["b", (value): CellResult => ({ text: value === "1" ? "TRUE" : "FALSE" })],
  ["e", (value): CellResult => ({ problem: `Excel's ${value} error, not a value.`, text: value })],
  ["d", (value): CellResult => ({ text: isoCellText(value) })],
]);

/** A cell's text, by its type: an inline string, a formula without its result, a typed value, or a number. */
function cellResult(cell: CellContent, context: SheetContext): CellResult {
  const { type, value } = cell;
  if (type === "inlineStr") {
    return { text: cell.inline ?? "" };
  }
  if (value === undefined) {
    return cell.formula ? uncalculated : { text: "" };
  }
  const read = type === undefined ? undefined : typedResults.get(type);
  return read === undefined ? numberResult(cell, value, context) : read(value, context);
}

/** Puts a cell's result in its column, filling the columns before it that hold nothing. */
function place(row: RowState, result: CellResult): void {
  if (result.text === "" && result.problem === undefined) {
    return;
  }
  while (row.fields.length < row.column) {
    row.fields.push("");
  }
  row.fields[row.column] = result.text;
  if (result.problem !== undefined) {
    row.problems.set(row.column, result.problem);
  }
}

/** Reads the cell whose opening tag is `tag` into the row. */
function readCell(scanner: XmlScanner, tag: XmlTag, row: RowState): void {
  row.column = columnIndex(attribute(tag, "r"), row.column);
  if (row.column >= maxColumns) {
    throw new ZipError(`Row ${String(row.line)} has a cell past column XFD, Excel's last.`);
  }
  place(row, cellResult(cellContent(scanner, tag), row.context));
}

/** A row's cells, up to its closing tag, as a record; `undefined` for a blank row. */
function rowRecord(
  scanner: XmlScanner,
  line: number,
  context: SheetContext,
): SheetRecord | undefined {
  const row: RowState = { column: -1, context, fields: [], line, problems: new Map() };
  let tag = scanner.next();
  while (tag !== undefined && !(tag.closing && tag.name === "row")) {
    if (tag.name === "c" && !tag.closing) {
      readCell(scanner, tag, row);
    }
    tag = scanner.next();
  }
  const { fields, problems } = row;
  if (fields.length === 0) {
    return undefined;
  }
  return problems.size === 0 ? { fields, line } : { fields, line, problems };
}

/** A `<row>`'s number: the one it states, or the one after the last row's. */
function rowNumber(tag: XmlTag, previous: number): number {
  const stated = Number(attribute(tag, "r") ?? Number.NaN);
  const line = Number.isSafeInteger(stated) && stated > previous ? stated : previous + 1;
  if (line > maxRows) {
    throw new ZipError(`It has a row past ${String(maxRows)}, Excel's last.`);
  }
  return line;
}

/** A worksheet part's rows, by a scanner over its XML, leaving out blank ones. */
function sheetRecords(scanner: XmlScanner, context: SheetContext): SheetRecord[] {
  const records: SheetRecord[] = [];
  let line = 0;
  for (
    let tag = scanner.next();
    tag !== undefined && !(tag.closing && tag.name === "sheetData");
    tag = scanner.next()
  ) {
    if (tag.name === "row" && !tag.closing) {
      line = rowNumber(tag, line);
      const record = tag.empty ? undefined : rowRecord(scanner, line, context);
      if (record !== undefined) {
        records.push(record);
      }
    }
  }
  return records;
}

export { sheetRecords };
export type { SheetContext, SheetRecord };
