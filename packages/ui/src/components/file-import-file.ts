/* What FileImport checks of a file before it reads it, and how it reads a CSV's bytes. It reads a CSV and an Excel
 * workbook (.xlsx, .xlsm, and their templates); an Excel 97-2003 workbook, a binary workbook and an OpenDocument
 * spreadsheet are refused with the way to save them as .xlsx, since a reader for them would cost a dependency or a
 * WebAssembly module that the design's measurement found no reason for (docs/spikes/xlsx-reader.md). So is any other
 * file, and one over the import's size limit. A CSV's text is UTF-8, as Excel's "CSV UTF-8" saves it, or, when it is
 * not, the Windows-1252 its plain "CSV" saves. */

/** How FileImport reads a file it takes. */
type ImportFormat = "csv" | "workbook";

const sizes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const bytesPerKilobyte = 1024;
const bytesPerMegabyte = bytesPerKilobyte * bytesPerKilobyte;
/** Excel's workbooks in Office Open XML, which the import reads. */
const workbookName = /\.(?:xlsx|xlsm|xltx|xltm)$/iu;
const csvName = /\.csv$/iu;
/** The spreadsheet formats it does not read, by their extensions, and what each is called in Excel's Save As. */
const otherFormats: readonly (readonly [RegExp, string])[] = [
  [/\.xls$/iu, "an Excel 97-2003 workbook (.xls)"],
  [/\.xlsb$/iu, "an Excel binary workbook (.xlsb)"],
  [/\.ods$/iu, "an OpenDocument spreadsheet (.ods)"],
];
/** What the file chooser offers: the files it reads, and those it refuses with the way to save them as .xlsx. */
const acceptedFiles =
  ".csv,text/csv,.xlsx,.xlsm,.xltx,.xltm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsb,.ods";
const saveAsWorkbook =
  "Open it in Excel, choose File > Save As, save it as Excel Workbook (.xlsx), and import that file.";

/** A file's size as Windows shows it: `12.3 MB`, `640 KB`. */
function sizeText(bytes: number): string {
  if (bytes >= bytesPerMegabyte) {
    return `${sizes.format(bytes / bytesPerMegabyte)} MB`;
  }
  return `${sizes.format(Math.max(bytes / bytesPerKilobyte, 1))} KB`;
}

/** How a file is read, by its name, or by its type when its name has no extension the import knows. */
function importFormat(file: Pick<File, "name" | "type">): ImportFormat | undefined {
  if (workbookName.test(file.name)) {
    return "workbook";
  }
  return csvName.test(file.name) || file.type === "text/csv" ? "csv" : undefined;
}

/** Why a file is refused before it is read, or `undefined` when it may be read. */
function fileRefusal(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes: number,
): string | undefined {
  const other = otherFormats.find(([pattern]) => pattern.test(file.name));
  if (other !== undefined) {
    return `${file.name} is ${other[1]}, which this import does not read. ${saveAsWorkbook}`;
  }
  if (importFormat(file) === undefined) {
    return `${file.name} is not a CSV file or an Excel workbook. Import a file saved as CSV (.csv) or as an Excel Workbook (.xlsx).`;
  }
  if (file.size > maxBytes) {
    return `${file.name} is ${sizeText(file.size)}, over this import's limit of ${sizeText(maxBytes)}. Split it into smaller files.`;
  }
  return undefined;
}

/** Why a workbook the reader refused cannot be imported, and what to do. */
function workbookRefusal(fileName: string, reason: string): string {
  return `${fileName} could not be read as an Excel workbook. ${reason} ${saveAsWorkbook}`;
}

/** The file's text: UTF-8, as Excel's "CSV UTF-8" saves it, or Windows-1252, as its plain "CSV" does. */
function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export {
  acceptedFiles,
  bytesPerMegabyte,
  decodeText,
  fileRefusal,
  importFormat,
  sizeText,
  workbookRefusal,
};
export type { ImportFormat };
