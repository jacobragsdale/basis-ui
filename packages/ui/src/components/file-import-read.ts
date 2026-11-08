/* How FileImport reads a file it takes: a CSV with parseCsv, and an Excel workbook with readWorkbook, from
 * `@basis/ui/utils`. A workbook's sheet is the one the app names, or else the first visible worksheet that holds the
 * schema's columns; when several do, as a workbook with a tab for each month does, the preview lets the user choose
 * among them, and each is read and checked once, before the preview shows. A hidden sheet, which usually holds a
 * template's lists, is read only when the app names it or the workbook has no other. */

import type { z } from "zod";

import { parseCsv } from "#utils/parse-csv.ts";
import { readWorkbook } from "#utils/read-workbook.ts";
import type { Workbook, WorkbookSheet } from "#utils/read-workbook.ts";

import { decodeText, fileRefusal, importFormat, workbookRefusal } from "./file-import-file.ts";
import { checkRecords } from "./file-import-rows.ts";
import type {
  ImportCheck,
  ImportOptions,
  ImportReading,
  ImportSchema,
} from "./file-import-rows.ts";

/** A file read and checked, and, for a workbook, the check of each sheet the user may choose instead. */
type FileReading<TRow> =
  | {
      readonly ok: true;
      readonly check: ImportCheck<TRow>;
      readonly checkOf: (sheet: string) => ImportCheck<TRow>;
    }
  | { readonly ok: false; readonly reason: string };

/** The sheets to try, in the order of their tabs: the one the app names, or the visible worksheets. */
function candidates(workbook: Workbook, named: string | undefined): readonly WorkbookSheet[] {
  const worksheets = workbook.sheets.filter((sheet) => sheet.worksheet);
  if (named !== undefined) {
    const wanted = named.trim().toLocaleLowerCase("en-US");
    return worksheets.filter((sheet) => sheet.name.trim().toLocaleLowerCase("en-US") === wanted);
  }
  const visible = worksheets.filter((sheet) => !sheet.hidden);
  return visible.length === 0 ? worksheets : visible;
}

/** A sheet read and checked against the schema, or why it cannot be imported. */
async function checkSheet<TSchema extends ImportSchema>(
  workbook: Workbook,
  { fileName, sheet }: { readonly fileName: string; readonly sheet: string },
  options: ImportOptions<TSchema>,
): Promise<ImportReading<z.output<TSchema>>> {
  const reading = await workbook.readSheet(sheet);
  if (!reading.ok) {
    return { ok: false, reason: workbookRefusal(fileName, reading.reason) };
  }
  return checkRecords({ fileName, sheet }, reading.records, options);
}

/** Why no sheet could be imported: the one sheet's reason, or each sheet's. */
function noSheetReason(fileName: string, reasons: readonly string[]): string {
  return reasons.length === 1
    ? (reasons[0] ?? "")
    : `None of the sheets in ${fileName} can be imported. ${reasons.join(" ")}`;
}

/** The checks of the sheets that can be imported, with every such sheet's name, or why none can. */
function sheetChecks<TRow>(
  fileName: string,
  readings: readonly ImportReading<TRow>[],
): FileReading<TRow> {
  const checks = readings.flatMap((sheet) => (sheet.ok ? [sheet.check] : []));
  const sheets = checks.map((check) => check.sheet ?? "");
  const [first] = checks;
  if (first === undefined) {
    const reasons = readings.map((sheet) => (sheet.ok ? "" : sheet.reason));
    return { ok: false, reason: noSheetReason(fileName, reasons) };
  }
  const checkOf = (sheet: string): ImportCheck<TRow> => ({
    ...(checks.find((check) => check.sheet === sheet) ?? first),
    sheets,
  });
  return { check: { ...first, sheets }, checkOf, ok: true };
}

/** Why a workbook has no sheet to try: none of the name the app gives, or no worksheet at all. */
function noCandidateReason(
  fileName: string,
  workbook: Workbook,
  named: string | undefined,
): string {
  const names = workbook.sheets.map((sheet) => sheet.name).join(", ");
  const wanted = named === undefined ? "worksheet" : `sheet named ${named}`;
  return `${fileName} has no ${wanted}. Its sheets are ${names}.`;
}

/** A workbook's rows, from the sheet chosen, checked against the schema, or why none can be imported. */
async function readWorkbookFile<TSchema extends ImportSchema>(
  file: File,
  options: ImportOptions<TSchema>,
): Promise<FileReading<z.output<TSchema>>> {
  const reading = await readWorkbook(await file.arrayBuffer());
  if (!reading.ok) {
    return { ok: false, reason: workbookRefusal(file.name, reading.reason) };
  }
  const { workbook } = reading;
  const tried = candidates(workbook, options.sheet);
  if (tried.length === 0) {
    return { ok: false, reason: noCandidateReason(file.name, workbook, options.sheet) };
  }
  const readings = await Promise.all(
    tried.map(async (sheet) =>
      checkSheet(workbook, { fileName: file.name, sheet: sheet.name }, options),
    ),
  );
  return sheetChecks(file.name, readings);
}

/** A CSV's rows checked against the schema, or why it is refused. */
async function readCsvFile<TSchema extends ImportSchema>(
  file: File,
  options: ImportOptions<TSchema>,
): Promise<FileReading<z.output<TSchema>>> {
  const reading = parseCsv(decodeText(await file.arrayBuffer()));
  if (!reading.ok) {
    return { ok: false, reason: `${file.name} is not valid CSV. ${reading.reason}` };
  }
  const checked = checkRecords(file.name, reading.records, options);
  return checked.ok ? { ...checked, checkOf: () => checked.check } : checked;
}

/** Reads a file and checks its rows, or says why it is refused. */
async function readImport<TSchema extends ImportSchema>(
  file: File,
  options: ImportOptions<TSchema>,
): Promise<FileReading<z.output<TSchema>>> {
  const refusal = fileRefusal(file, options.maxBytes);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  return importFormat(file) === "workbook"
    ? readWorkbookFile(file, options)
    : readCsvFile(file, options);
}

export { readImport };
export type { FileReading };
