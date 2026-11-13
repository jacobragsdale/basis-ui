/* Reading an Excel workbook in the browser, with no dependency: an .xlsx, an .xlsm, and their templates, .xltx and
 * .xltm, which are all a ZIP archive of XML parts (Office Open XML, transitional or strict). It lists the sheets, and
 * reads a sheet's rows as text, as parseCsv reads a CSV's, by the rules in workbook-cells.ts, so a schema checks the
 * two alike. Macros are never run: only the parts that hold cells are read.
 *
 * Excel's older and other formats are other readers' work (docs/spikes/xlsx-reader.md): an .xls of Excel 97-2003, a
 * binary .xlsb, an OpenDocument .ods. A workbook protected with a password is encrypted inside an OLE file, not a ZIP,
 * and is refused, as are a damaged archive and a web page saved with a workbook's name, each with the reason. */

import { readZip, ZipError } from "./read-zip.ts";
import type { ZipArchive } from "./read-zip.ts";
import {
  partOfKind,
  relationshipsOf,
  relationshipsPart,
  sharedStrings,
  styleKinds,
  workbookOf,
} from "./workbook-parts.ts";
import type { ListedSheet, Relationship } from "./workbook-parts.ts";
import { sheetRecords } from "./workbook-sheet.ts";
import type { SheetContext, SheetRecord } from "./workbook-sheet.ts";
import { scanXml } from "./xml-scan.ts";

/** A sheet as the workbook lists it, in the order of its tabs. */
interface WorkbookSheet {
  readonly name: string;
  /** Hidden, or very hidden, so that Excel's tabs do not show it. */
  readonly hidden: boolean;
  /** A worksheet holds cells; a chart sheet, a dialog sheet and an Excel 4 macro sheet hold none to read. */
  readonly worksheet: boolean;
}

/** A sheet's rows, leaving out blank ones, or why they cannot be read. */
type SheetReading =
  | { readonly ok: true; readonly records: readonly SheetRecord[] }
  | { readonly ok: false; readonly reason: string };

/** A workbook's sheets, and a way to read one. */
interface Workbook {
  readonly sheets: readonly WorkbookSheet[];
  /** Reads the worksheet of that name; a name the workbook lacks, or a chart sheet's, is refused. */
  readonly readSheet: (name: string) => Promise<SheetReading>;
}

type WorkbookReading =
  | { readonly ok: true; readonly workbook: Workbook }
  | { readonly ok: false; readonly reason: string };

interface WorkbookOptions {
  /** The most bytes one part of the archive may unzip to, so a small file cannot inflate to gigabytes in the page's
   * memory; 128 MB unless set, about half a million rows of a dozen columns. */
  readonly maxPartBytes?: number | undefined;
}

/** What reading a sheet needs: the archive, the workbook's relationships, and its strings and styles, read once. */
interface Parts {
  readonly archive: ZipArchive;
  readonly maxBytes: number;
  readonly relationships: ReadonlyMap<string, Relationship>;
  readonly context: () => Promise<SheetContext>;
}

const kilobyte = 1024;
const megabyte = kilobyte * kilobyte;
const defaultMegabytes = 128;
const defaultMaxPartBytes = defaultMegabytes * megabyte;
/** A ZIP archive starts with `PK`, and an OLE file, as Excel 97-2003 and password protection write, with the bytes
 * D0 CF 11 E0 A1 B1 1A E1: here as little-endian words. */
const zipSignature = 0x4b_50;
const oleSignature = { first: 0xe0_11_cf_d0, second: 0xe1_1a_b1_a1 } as const;
const oleWord = 4;
const sniffedBytes = 512;

/** Why bytes that are not a ZIP archive are no workbook this reads. */
function notZipReason(view: DataView, bytes: Uint8Array): string {
  const ole =
    view.byteLength >= oleWord + oleWord &&
    view.getUint32(0, true) === oleSignature.first &&
    view.getUint32(oleWord, true) === oleSignature.second;
  if (ole) {
    return "It is protected with a password, or it is an Excel 97-2003 workbook (.xls) under another name.";
  }
  const start = new TextDecoder().decode(bytes.subarray(0, sniffedBytes));
  if (start.trimStart().startsWith("<")) {
    return "It is a web page or an XML file under a workbook's name, as some systems export them.";
  }
  return "It is damaged, or it is another kind of file under a workbook's name.";
}

/** The reason a ZipError gives, or, for anything else a damaged file made the reader meet, one the user can act on:
 * a file from anywhere never rejects the reading. */
function zipReason(error: unknown): string {
  if (error instanceof ZipError) {
    return error.message;
  }
  return "It is written in a way this reader does not follow: open it in Excel, save it as an Excel workbook (.xlsx), and import it again.";
}

/** A worksheet's records, or why it cannot be read. */
async function sheetOf(parts: Parts, sheet: ListedSheet): Promise<SheetReading> {
  try {
    const part = parts.relationships.get(sheet.id)?.part;
    const xml = part === undefined ? undefined : await parts.archive.text(part, parts.maxBytes);
    if (xml === undefined) {
      return { ok: false, reason: `Its sheet ${sheet.name} is missing from the archive.` };
    }
    return { ok: true, records: sheetRecords(scanXml(xml), await parts.context()) };
  } catch (error) {
    return { ok: false, reason: `Its sheet ${sheet.name} could not be read. ${zipReason(error)}` };
  }
}

/** Reads the strings and styles when a sheet is first read, and only then, once. */
function contextOnce(
  archive: ZipArchive,
  relationships: ReadonlyMap<string, Relationship>,
  { maxBytes, date1904 }: { readonly maxBytes: number; readonly date1904: boolean },
): () => Promise<SheetContext> {
  let context: Promise<SheetContext> | undefined = undefined;
  const text = async (kind: string): Promise<string | undefined> => {
    const part = partOfKind(relationships, kind);
    return part === undefined ? undefined : archive.text(part, maxBytes);
  };
  return async () => {
    context ??= Promise.all([text("sharedStrings"), text("styles")]).then(([strings, styles]) => ({
      date1904,
      strings: sharedStrings(strings),
      styles: styleKinds(styles),
    }));
    return context;
  };
}

/** The workbook whose sheets the workbook part lists. */
function workbookFrom(parts: Omit<Parts, "context">, xml: string): Workbook {
  const { sheets, date1904 } = workbookOf(xml);
  const withContext = {
    ...parts,
    context: contextOnce(parts.archive, parts.relationships, {
      date1904,
      maxBytes: parts.maxBytes,
    }),
  };
  const isWorksheet = (sheet: ListedSheet): boolean =>
    parts.relationships.get(sheet.id)?.kind === "worksheet";
  const readSheet = async (name: string): Promise<SheetReading> => {
    const sheet = sheets.find((listed) => listed.name === name);
    if (sheet === undefined) {
      return { ok: false, reason: `It has no sheet named ${name}.` };
    }
    return isWorksheet(sheet)
      ? sheetOf(withContext, sheet)
      : { ok: false, reason: `Its sheet ${name} is a chart or macro sheet, which holds no cells.` };
  };
  return {
    readSheet,
    sheets: sheets.map((sheet) => ({
      hidden: sheet.hidden,
      name: sheet.name,
      worksheet: isWorksheet(sheet),
    })),
  };
}

/** A workbook from its archive, by the package's relationships to its workbook part. */
async function openWorkbook(archive: ZipArchive, maxBytes: number): Promise<WorkbookReading> {
  const root = relationshipsOf(await archive.text("_rels/.rels", maxBytes), "");
  const workbookPart = partOfKind(root, "officeDocument") ?? "xl/workbook.xml";
  const xml = await archive.text(workbookPart, maxBytes);
  if (xml === undefined) {
    return {
      ok: false,
      reason: "It is a ZIP archive, but not an Excel workbook: it has no workbook part.",
    };
  }
  const relationshipsXml = await archive.text(relationshipsPart(workbookPart), maxBytes);
  const relationships = relationshipsOf(relationshipsXml, workbookPart);
  return { ok: true, workbook: workbookFrom({ archive, maxBytes, relationships }, xml) };
}

/** Reads an Excel workbook's list of sheets, or says why the bytes are not a workbook it reads:
 *
 *   const reading = await readWorkbook(await file.arrayBuffer());
 *   if (reading.ok) {
 *     const [first] = reading.workbook.sheets.filter((sheet) => sheet.worksheet && !sheet.hidden);
 *     const rows = await reading.workbook.readSheet(first.name);
 *   } else {
 *     show(reading.reason); // It is protected with a password, or ...
 *   }
 *
 * A sheet's records are its rows as text, leaving out blank rows, each with the row's number in the sheet, as
 * `parseCsv` gives a CSV's with their lines. */
async function readWorkbook(
  bytes: ArrayBuffer | Uint8Array,
  { maxPartBytes = defaultMaxPartBytes }: WorkbookOptions = {},
): Promise<WorkbookReading> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const words = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (view.byteLength < 2 || words.getUint16(0, true) !== zipSignature) {
    return { ok: false, reason: notZipReason(words, view) };
  }
  try {
    const zip = readZip(view);
    if (!zip.ok) {
      return { ok: false, reason: `It is damaged: ${zip.reason}` };
    }
    return await openWorkbook(zip.archive, maxPartBytes);
  } catch (error) {
    return { ok: false, reason: `It is damaged: ${zipReason(error)}` };
  }
}

export { readWorkbook };
export type { SheetRecord } from "./workbook-sheet.ts";
export type { SheetReading, Workbook, WorkbookOptions, WorkbookReading, WorkbookSheet };
