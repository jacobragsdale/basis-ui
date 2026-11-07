/* What FileImport does with a file before anyone sees it: refuse one it cannot or should not read (file-import-file.ts);
 * read the CSV; refuse one with too many rows or without a column the schema needs; and check every row against the
 * app's Zod schema, cell by cell, keeping each problem's reason on the cell it belongs to.
 *
 * A file's columns are matched to the schema's keys by their headers, ignoring case, spaces and punctuation, so
 * `Par Amount`, `par_amount` and `PAR-AMOUNT` all match a key headed `parAmount` or declared as `"Par amount"`. An
 * empty cell is a missing value: the schema sees no key for it, which an optional field takes and a required one
 * refuses. */

import type { z } from "zod";

import { parseCsv } from "#utils/parse-csv.ts";

import { decodeText, fileRefusal } from "./file-import-file.ts";
import type { CsvRecord } from "#utils/parse-csv.ts";

/** A schema an import checks rows against: an object whose keys are the file's columns. */
type ImportSchema = z.ZodObject<Readonly<Record<string, z.ZodType>>, z.core.$ZodObjectConfig>;

/** The header, or several, a key's column may go by in a file, besides the key itself. */
type ImportHeaders<TSchema extends ImportSchema> = {
  readonly [TKey in keyof TSchema["shape"]]?: string | readonly string[];
};

/** One row of the file, as the preview shows it. */
interface ImportedRow<TRow> {
  /** The file's line the row starts on, counting the header as line 1. */
  readonly line: number;
  /** Each key's cell, as text. */
  readonly cells: Readonly<Record<string, string>>;
  /** Why a key's cell is refused, for the cells that are. */
  readonly problems: Readonly<Record<string, string>>;
  /** Why the row as a whole is refused, such as a field count that differs from the header's. */
  readonly rowProblem: string | undefined;
  /** The row as the schema gives it, when every cell passed. */
  readonly value: TRow | undefined;
}

/** A file read and checked: its rows, the valid ones as the schema gives them, and the columns it ignored. */
interface ImportCheck<TRow> {
  readonly fileName: string;
  readonly keys: readonly string[];
  readonly rows: readonly ImportedRow<TRow>[];
  readonly valid: readonly TRow[];
  /** The file's headers that matched no key. */
  readonly ignored: readonly string[];
}

type ImportReading<TRow> =
  | { readonly ok: true; readonly check: ImportCheck<TRow> }
  | { readonly ok: false; readonly reason: string };

interface ImportOptions<TSchema extends ImportSchema> {
  readonly schema: TSchema;
  readonly headers: ImportHeaders<TSchema> | undefined;
  readonly maxBytes: number;
  readonly maxRows: number;
}

const counts = new Intl.NumberFormat("en-US");
const notLetterOrDigit = /[^\p{L}\p{N}]/gu;
/** What the schema sees for an empty cell, or for a column the file lacks. */
const missingCell = undefined;

/** A header as matching compares it: letters and digits only, in lower case. */
function headerKey(text: string): string {
  return text.normalize("NFKD").toLocaleLowerCase("en-US").replaceAll(notLetterOrDigit, "");
}

/** The headers a key's column may go by. */
function headersOf<TSchema extends ImportSchema>(
  key: string,
  headers: ImportHeaders<TSchema> | undefined,
): readonly string[] {
  const declared: unknown = headers === undefined ? undefined : Reflect.get(headers, key);
  if (typeof declared === "string") {
    return [declared, key];
  }
  return Array.isArray(declared) ? [...declared.map(String), key] : [key];
}

/** The header the preview shows over a key's column: the first it is declared with, or the key. */
function displayHeader<TSchema extends ImportSchema>(
  key: string,
  headers: ImportHeaders<TSchema> | undefined,
): string {
  return headersOf(key, headers)[0] ?? key;
}

/** Each key's column in the file, by index, or why the file lacks one the schema needs. */
function matchColumns<TSchema extends ImportSchema>(
  header: readonly string[],
  { schema, headers }: Pick<ImportOptions<TSchema>, "schema" | "headers">,
):
  | { readonly ok: true; readonly indexes: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly missing: readonly string[] } {
  const indexes = new Map<string, number>();
  const missing: string[] = [];
  const found = header.map((text) => headerKey(text));
  for (const [key, field] of Object.entries(schema.shape)) {
    const wanted = new Set(headersOf(key, headers).map((text) => headerKey(text)));
    const index = found.findIndex((text) => wanted.has(text));
    if (index !== -1) {
      indexes.set(key, index);
    } else if (!field.safeParse(missingCell).success) {
      missing.push(displayHeader(key, headers));
    }
  }
  return missing.length === 0 ? { indexes, ok: true } : { missing, ok: false };
}

/** What a refused cell's reason says: Zod's message, or that the cell is empty when the column needs a value. */
function problemText(message: string, cell: string): string {
  return cell === "" ? "Empty, but this column needs a value." : message;
}

/** Where a record's cells are, and how many fields every record has. */
interface Layout {
  readonly keys: readonly string[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly fieldCount: number;
}

/** Each key's cell in a record, as trimmed text; a key whose column the file lacks is empty. */
function cellsOf(record: CsvRecord, { keys, indexes }: Layout): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const index = indexes.get(key);
      return [key, index === undefined ? "" : (record.fields[index] ?? "").trim()] as const;
    }),
  );
}

/** The cell an issue's path names, if it names one. */
function cellKeyOf(
  path: readonly PropertyKey[],
  cells: Readonly<Record<string, string>>,
): string | undefined {
  const [key] = path;
  return typeof key === "string" && key in cells ? key : undefined;
}

/** The schema's issues, on the cells they name, and those that name none on the row. */
function problemsOf(
  issues: readonly z.core.$ZodIssue[],
  cells: Readonly<Record<string, string>>,
): Pick<ImportedRow<never>, "problems" | "rowProblem"> {
  const problems: Record<string, string> = {};
  const rowProblems: string[] = [];
  for (const { path, message } of issues) {
    const key = cellKeyOf(path, cells);
    if (key === undefined) {
      rowProblems.push(message);
    } else {
      const text = problemText(message, cells[key] ?? "");
      problems[key] = key in problems ? `${problems[key] ?? ""} ${text}` : text;
    }
  }
  return { problems, rowProblem: rowProblems.length === 0 ? undefined : rowProblems.join(" ") };
}

/** One record checked against the schema, with each empty cell read as a missing value. */
function checkRecord<TSchema extends ImportSchema>(
  record: CsvRecord,
  schema: TSchema,
  layout: Layout,
): ImportedRow<z.output<TSchema>> {
  const cells = cellsOf(record, layout);
  const { line } = record;
  if (record.fields.length !== layout.fieldCount) {
    const rowProblem = `This line has ${String(record.fields.length)} fields, but the header has ${String(layout.fieldCount)}.`;
    return { cells, line, problems: {}, rowProblem, value: undefined };
  }
  // An empty cell is a missing value: its key is left out, as an optional field's is when it has none.
  const input = Object.fromEntries(Object.entries(cells).filter(([, cell]) => cell !== ""));
  const result = schema.safeParse(input);
  if (result.success) {
    return { cells, line, problems: {}, rowProblem: undefined, value: result.data };
  }
  return { cells, line, ...problemsOf(result.error.issues, cells), value: undefined };
}

/** Why a file with too many rows is refused. */
function rowsRefusal(fileName: string, rows: number, maxRows: number): string {
  const limit = counts.format(maxRows);
  return `${fileName} has ${counts.format(rows)} rows, over this import's limit of ${limit}. Split it into files of ${limit} rows or fewer.`;
}

/** The rows under the header, each checked against the schema. */
function checkedFile<TSchema extends ImportSchema>({
  fileName,
  header,
  body,
  indexes,
  schema,
}: {
  readonly fileName: string;
  readonly header: CsvRecord;
  readonly body: readonly CsvRecord[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly schema: TSchema;
}): ImportCheck<z.output<TSchema>> {
  // The keys in the file's order, so the preview reads as the file does; a key the file lacks comes last.
  const position = (key: string): number => indexes.get(key) ?? header.fields.length;
  const keys = Object.keys(schema.shape).toSorted(
    (left, right) => position(left) - position(right),
  );
  const layout = { fieldCount: header.fields.length, indexes, keys };
  const rows = body.map((record) => checkRecord(record, schema, layout));
  const used = new Set(indexes.values());
  return {
    fileName,
    ignored: header.fields.filter((_text, index) => !used.has(index)),
    keys: layout.keys,
    rows,
    valid: rows.flatMap((row) => (row.value === undefined ? [] : [row.value])),
  };
}

/** The file's records checked against the schema, once it has a header, rows, no more rows than allowed, and every
 * column the schema needs. */
function checkRecords<TSchema extends ImportSchema>(
  fileName: string,
  records: readonly CsvRecord[],
  options: ImportOptions<TSchema>,
): ImportReading<z.output<TSchema>> {
  const [header, ...body] = records;
  if (header === undefined || body.length === 0) {
    return { ok: false, reason: `${fileName} has no rows under a header row.` };
  }
  if (body.length > options.maxRows) {
    return { ok: false, reason: rowsRefusal(fileName, body.length, options.maxRows) };
  }
  const columns = matchColumns(header.fields, options);
  if (!columns.ok) {
    return {
      ok: false,
      reason: `${fileName} has no ${columns.missing.join(", ")} column. Its columns are ${header.fields.join(", ")}.`,
    };
  }
  const { indexes } = columns;
  return {
    check: checkedFile({ body, fileName, header, indexes, schema: options.schema }),
    ok: true,
  };
}

/** Reads a file and checks its rows, or says why it is refused. */
async function readImport<TSchema extends ImportSchema>(
  file: File,
  options: ImportOptions<TSchema>,
): Promise<ImportReading<z.output<TSchema>>> {
  const refusal = fileRefusal(file, options.maxBytes);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  const reading = parseCsv(decodeText(await file.arrayBuffer()));
  if (!reading.ok) {
    return { ok: false, reason: `${file.name} is not valid CSV. ${reading.reason}` };
  }
  return checkRecords(file.name, reading.records, options);
}

export { checkRecords, displayHeader, readImport };
export type { ImportCheck, ImportHeaders, ImportReading, ImportSchema, ImportedRow };
