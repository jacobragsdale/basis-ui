/* What FileImport checks of a file before it reads it, and how it reads its bytes: a spreadsheet workbook is refused
 * with the way to save it as CSV, since the design measures a Rust reader for xlsx against the JavaScript ones first
 * (docs/design.md, Rust and WebAssembly); so is a file that is not CSV, or is over the import's size limit. The text
 * is UTF-8, as Excel's "CSV UTF-8" saves it, or, when it is not, the Windows-1252 its plain "CSV" saves. */

const sizes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const bytesPerKilobyte = 1024;
const bytesPerMegabyte = bytesPerKilobyte * bytesPerKilobyte;
/** Excel's workbook formats, and the spreadsheet formats like them, which the import does not read yet. */
const workbook = /\.(?:xlsx|xlsm|xlsb|xls|ods)$/iu;
const csvName = /\.csv$/iu;

/** A file's size as Windows shows it: `12.3 MB`, `640 KB`. */
function sizeText(bytes: number): string {
  if (bytes >= bytesPerMegabyte) {
    return `${sizes.format(bytes / bytesPerMegabyte)} MB`;
  }
  return `${sizes.format(Math.max(bytes / bytesPerKilobyte, 1))} KB`;
}

/** Why a file is refused before it is read, or `undefined` when it may be read. */
function fileRefusal(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes: number,
): string | undefined {
  if (workbook.test(file.name)) {
    return `${file.name} is a spreadsheet workbook, which this import does not read yet. Open it in Excel, choose File > Save As, save it as CSV UTF-8 (Comma delimited), and import that file.`;
  }
  if (!csvName.test(file.name) && file.type !== "text/csv") {
    return `${file.name} is not a CSV file. Import a file saved as CSV, ending in .csv.`;
  }
  if (file.size > maxBytes) {
    return `${file.name} is ${sizeText(file.size)}, over this import's limit of ${sizeText(maxBytes)}. Split it into smaller files.`;
  }
  return undefined;
}

/** The file's text: UTF-8, as Excel's "CSV UTF-8" saves it, or Windows-1252, as its plain "CSV" does. */
function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export { bytesPerMegabyte, decodeText, fileRefusal, sizeText };
