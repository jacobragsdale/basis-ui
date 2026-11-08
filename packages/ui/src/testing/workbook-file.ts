/* An Excel workbook written for a test of an import, so a test needs no .xlsx committed beside it and no Excel:
 *
 *   const file = await workbookFile({
 *     Positions: [
 *       ["CUSIP", "Par", "Settles"],
 *       ["037833100", 1_000_000, Temporal.PlainDate.from("2026-11-09")],
 *     ],
 *   });
 *   await userEvent.upload(screen.getByLabelText("CSV or Excel file"), file);
 *
 * It writes what Excel writes for those cells: strings in the shared strings part, numbers, booleans, and a date as
 * its serial number in a date format. Each sheet is a tab, in the order given; `hidden` hides some. */

import { zipBytes } from "./zip-file.ts";
import type { ZipPart } from "./zip-file.ts";

/** A cell: text, a number, a boolean, a date, or nothing. */
type WorkbookCell = string | number | boolean | Temporal.PlainDate | null | undefined;

interface WorkbookFileOptions {
  /** The file's name; `workbook.xlsx` unless set. */
  readonly name?: string | undefined;
  /** The sheets that are hidden. */
  readonly hidden?: readonly string[] | undefined;
}

const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentTypes = "http://schemas.openxmlformats.org/package/2006/content-types";
const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const letters = 26;
const beforeA = 64;
/** Excel's day 0 in its 1900 date system, for dates from 1 March 1900. */
const excelEpoch = "1899-12-30";
/** The style a date cell takes: the second of the styles part's `cellXfs`, number format 14, Excel's short date. */
const dateStyle = 1;

/** Text escaped for XML. */
function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A column's letters, by its index: A for 0, AA for 26. */
function columnName(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / letters)) {
    name = String.fromCodePoint(beforeA + ((rest - 1) % letters) + 1) + name;
  }
  return name;
}

/** A date cell's attributes and stored value: its serial number, in the short date style. */
function dateCell(cell: Temporal.PlainDate): {
  readonly attributes: string;
  readonly value: string;
} {
  const serial = Temporal.PlainDate.from(excelEpoch).until(cell).days;
  return { attributes: ` s="${String(dateStyle)}"`, value: String(serial) };
}

/** A cell's attributes and stored value, as Excel writes them, with a string added to the shared strings. */
function storedCell(
  cell: WorkbookCell,
  strings: string[],
): { readonly attributes: string; readonly value: string } | undefined {
  if (typeof cell === "string") {
    strings.push(cell);
    return { attributes: ' t="s"', value: String(strings.length - 1) };
  }
  if (typeof cell === "number") {
    return { attributes: "", value: String(cell) };
  }
  if (typeof cell === "boolean") {
    return { attributes: ' t="b"', value: cell ? "1" : "0" };
  }
  return cell instanceof Temporal.PlainDate ? dateCell(cell) : undefined;
}

/** One cell's XML, with strings added to the shared strings; nothing for an empty cell. */
function cellXml(cell: WorkbookCell, reference: string, strings: string[]): string {
  const stored = storedCell(cell, strings);
  return stored === undefined
    ? ""
    : `<c r="${reference}"${stored.attributes}><v>${stored.value}</v></c>`;
}

/** A worksheet part's XML. */
function sheetXml(rows: readonly (readonly WorkbookCell[])[], strings: string[]): string {
  const rowsXml = rows.map((row, index) => {
    const line = String(index + 1);
    const cells = row.map((cell, column) => cellXml(cell, `${columnName(column)}${line}`, strings));
    return `<row r="${line}">${cells.join("")}</row>`;
  });
  return `<worksheet xmlns="${spreadsheet}"><sheetData>${rowsXml.join("")}</sheetData></worksheet>`;
}

/** The parts every workbook has: content types, the package's relationships, and styles. */
function fixedParts(): Record<string, ZipPart> {
  return {
    "[Content_Types].xml": {
      text: `<Types xmlns="${contentTypes}"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`,
    },
    "_rels/.rels": {
      text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    "xl/styles.xml": {
      text: `<styleSheet xmlns="${spreadsheet}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    },
  };
}

/** The workbook part and its relationships, for the sheets in order. */
function workbookParts(
  names: readonly string[],
  hidden: ReadonlySet<string>,
): Record<string, ZipPart> {
  const sheets = names.map((name, index) => {
    const state = hidden.has(name) ? ' state="hidden"' : "";
    return `<sheet name="${escapeXml(name)}" sheetId="${String(index + 1)}"${state} r:id="rId${String(index + 1)}"/>`;
  });
  const links = names.map(
    (_name, index) =>
      `<Relationship Id="rId${String(index + 1)}" Type="${relationships}/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
  );
  const strings = `<Relationship Id="rIdStrings" Type="${relationships}/sharedStrings" Target="sharedStrings.xml"/>`;
  const styles = `<Relationship Id="rIdStyles" Type="${relationships}/styles" Target="styles.xml"/>`;
  return {
    "xl/_rels/workbook.xml.rels": {
      text: `<Relationships xmlns="${packageRelationships}">${links.join("")}${strings}${styles}</Relationships>`,
    },
    "xl/workbook.xml": {
      text: `<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}"><sheets>${sheets.join("")}</sheets></workbook>`,
    },
  };
}

/** A workbook of the sheets given, by name, each a list of rows of cells, as a File an import takes. */
async function workbookFile(
  sheets: Readonly<Record<string, readonly (readonly WorkbookCell[])[]>>,
  { name = "workbook.xlsx", hidden = [] }: WorkbookFileOptions = {},
): Promise<File> {
  const strings: string[] = [];
  const sheetParts = Object.values(sheets).map((rows, index): [string, ZipPart] => [
    `xl/worksheets/sheet${String(index + 1)}.xml`,
    { deflate: true, text: sheetXml(rows, strings) },
  ]);
  const shared = strings.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
  const bytes = await zipBytes({
    ...fixedParts(),
    ...workbookParts(Object.keys(sheets), new Set(hidden)),
    ...Object.fromEntries(sheetParts),
    "xl/sharedStrings.xml": { text: `<sst xmlns="${spreadsheet}">${shared.join("")}</sst>` },
  });
  return new File([bytes], name, { type: xlsxType });
}

export { workbookFile };
export type { WorkbookCell, WorkbookFileOptions };
