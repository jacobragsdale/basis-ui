/* What FileImport does with a file's records before anyone sees them: refuse a file with no rows, too many, or without
 * a column the schema needs (file-import-columns.ts), and check every row against the app's Zod schema, cell by cell,
 * keeping each problem's reason on the cell it belongs to. The records are a CSV's lines or a worksheet's rows
 * (file-import-read.ts reads both); a worksheet's rows may stop before their last empty cells, and its cells may hold
 * a problem of their own, such as an Excel error, which refuses the row whatever the schema says.
 *
 * The header is the first record, or the first of the first ten that holds every column the schema needs, so the rows
 * of a report's title above it are left out.
 *
 * An empty cell is a missing value: the schema sees no key for it, which an optional field takes and a required one
 * refuses. */

import type { z } from "zod";

import { matchColumns } from "./file-import-columns.ts";
import type { ImportHeaders, ImportSchema } from "./file-import-columns.ts";

/** A record of a file: a CSV's line, or a worksheet's row with its cells' own problems. */
interface ImportRecord {
  readonly line: number;
  readonly fields: readonly string[];
  readonly problems?: ReadonlyMap<number, string> | undefined;
}

/** One row of the file, as the preview shows it. */
interface ImportedRow<TRow> {
  /** The CSV's line the row starts on, counting the header as line 1, or the worksheet's row number. */
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
  /** The worksheet the rows come from, for a workbook; `undefined` for a CSV. */
  readonly sheet: string | undefined;
  /** The workbook's sheets that can be imported, among which the user may choose; empty for a CSV. */
  readonly sheets: readonly string[];
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
  /** The worksheet to import from a workbook, by name; the first that holds the schema's columns unless set. */
  readonly sheet?: string | undefined;
}

/** Where the records come from: a CSV by its name, or a workbook's sheet. */
type ImportSource = string | { readonly fileName: string; readonly sheet: string };

/** Where a record's cells are, how many fields every record of a CSV has, and whether the records are a sheet's. */
interface Layout {
  readonly keys: readonly string[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly fieldCount: number;
  readonly sheet: boolean;
}

const counts = new Intl.NumberFormat("en-US");
/** How many records from the top the header may be: a report's title, date and notes take a few. */
const headerSearch = 10;

/** What a refused cell's reason says: Zod's message, or that the cell is empty when the column needs a value. */
function problemText(message: string, cell: string): string {
  return cell === "" ? "Empty, but this column needs a value." : message;
}

/** Each key's cell in a record, as trimmed text; a key whose column the file lacks is empty. */
function cellsOf(record: ImportRecord, { keys, indexes }: Layout): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const index = indexes.get(key);
      return [key, index === undefined ? "" : (record.fields[index] ?? "").trim()] as const;
    }),
  );
}

/** The problems a worksheet's cells hold of their own, by key, for the columns the import reads. */
function sourceProblems(record: ImportRecord, { keys, indexes }: Layout): Record<string, string> {
  const { problems } = record;
  if (problems === undefined) {
    return {};
  }
  return Object.fromEntries(
    keys.flatMap((key) => {
      const problem = problems.get(indexes.get(key) ?? -1);
      return problem === undefined ? [] : [[key, problem] as const];
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

/** Why a CSV line is refused as a whole: a field count other than its header's; `undefined` for a sheet's row. */
function fieldCountProblem(record: ImportRecord, layout: Layout): string | undefined {
  return !layout.sheet && record.fields.length !== layout.fieldCount
    ? `This line has ${String(record.fields.length)} fields, but the header has ${String(layout.fieldCount)}.`
    : undefined;
}

/** A row's cells checked against the schema: its value when every cell passes, or each cell's problem. */
function schemaCheck<TSchema extends ImportSchema>(
  cells: Readonly<Record<string, string>>,
  schema: TSchema,
  own: Readonly<Record<string, string>>,
): Pick<ImportedRow<z.output<TSchema>>, "problems" | "rowProblem" | "value"> {
  // An empty cell is a missing value: its key is left out, as an optional field's is when it has none.
  const result = schema.safeParse(
    Object.fromEntries(Object.entries(cells).filter(([, cell]) => cell !== "")),
  );
  if (result.success && Object.keys(own).length === 0) {
    return { problems: {}, rowProblem: undefined, value: result.data };
  }
  const checked = result.success
    ? { problems: {}, rowProblem: undefined }
    : problemsOf(result.error.issues, cells);
  return {
    problems: { ...checked.problems, ...own },
    rowProblem: checked.rowProblem,
    value: undefined,
  };
}

/** One record checked against the schema, with each empty cell read as a missing value. A cell's own problem, such
 * as an Excel error, stands in for what the schema says of it. */
function checkRecord<TSchema extends ImportSchema>(
  record: ImportRecord,
  schema: TSchema,
  layout: Layout,
): ImportedRow<z.output<TSchema>> {
  const cells = cellsOf(record, layout);
  const rowProblem = fieldCountProblem(record, layout);
  if (rowProblem !== undefined) {
    return { cells, line: record.line, problems: {}, rowProblem, value: undefined };
  }
  return {
    cells,
    line: record.line,
    ...schemaCheck(cells, schema, sourceProblems(record, layout)),
  };
}

/** The rows under the header, each checked against the schema. */
function checkedFile<TSchema extends ImportSchema>({
  source,
  header,
  body,
  indexes,
  schema,
}: {
  readonly source: ImportSource;
  readonly header: ImportRecord;
  readonly body: readonly ImportRecord[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly schema: TSchema;
}): ImportCheck<z.output<TSchema>> {
  // The keys in the file's order, so the preview reads as the file does; a key the file lacks comes last.
  const position = (key: string): number => indexes.get(key) ?? header.fields.length;
  const keys = Object.keys(schema.shape).toSorted(
    (left, right) => position(left) - position(right),
  );
  const sheet = typeof source === "string" ? undefined : source.sheet;
  const layout = { fieldCount: header.fields.length, indexes, keys, sheet: sheet !== undefined };
  const rows = body.map((record) => checkRecord(record, schema, layout));
  const used = new Set(indexes.values());
  return {
    fileName: typeof source === "string" ? source : source.fileName,
    ignored: header.fields.filter((text, index) => text.trim() !== "" && !used.has(index)),
    keys: layout.keys,
    rows,
    sheet,
    sheets: sheet === undefined ? [] : [sheet],
    valid: rows.flatMap((row) => (row.value === undefined ? [] : [row.value])),
  };
}

/** How a refusal names where the records come from: the file, or the sheet of a workbook. */
function sourceLabel(source: ImportSource): string {
  return typeof source === "string" ? source : `Sheet ${source.sheet} of ${source.fileName}`;
}

/** Why records with too many rows, or without a column the schema needs, are refused; `undefined` when they are not. */
function recordsRefusal<TSchema extends ImportSchema>(
  label: string,
  [header, ...body]: readonly ImportRecord[],
  options: ImportOptions<TSchema>,
): string | undefined {
  if (header === undefined || body.length === 0) {
    return `${label} has no rows under a header row.`;
  }
  if (body.length > options.maxRows) {
    const limit = counts.format(options.maxRows);
    return `${label} has ${counts.format(body.length)} rows, over this import's limit of ${limit}. Split it into files of ${limit} rows or fewer.`;
  }
  const columns = matchColumns(header.fields, options);
  return columns.ok
    ? undefined
    : `${label} has no ${columns.missing.join(", ")} column. Its columns are ${header.fields.filter((text) => text.trim() !== "").join(", ")}.`;
}

/** The records from the header on: the first of the first ten that holds every column the schema needs, so a
 * report's title and notes above its header are left out, or the first record when none does. */
function fromHeader<TSchema extends ImportSchema>(
  records: readonly ImportRecord[],
  options: ImportOptions<TSchema>,
): readonly ImportRecord[] {
  const header = records
    .slice(0, headerSearch)
    .findIndex((record) => matchColumns(record.fields, options).ok);
  return header <= 0 ? records : records.slice(header);
}

/** The records checked against the schema, once they have a header, rows, no more rows than allowed, and every
 * column the schema needs: a CSV's, by its file's name, or a worksheet's, by its file and sheet. The header is the
 * first record, or the first of the first ten that holds the schema's columns. */
function checkRecords<TSchema extends ImportSchema>(
  source: ImportSource,
  records: readonly ImportRecord[],
  options: ImportOptions<TSchema>,
): ImportReading<z.output<TSchema>> {
  const fromRecords = fromHeader(records, options);
  const refusal = recordsRefusal(sourceLabel(source), fromRecords, options);
  const [header, ...body] = fromRecords;
  const columns = header === undefined ? undefined : matchColumns(header.fields, options);
  if (refusal !== undefined || header === undefined || columns?.ok !== true) {
    return { ok: false, reason: refusal ?? "" };
  }
  const { indexes } = columns;
  return {
    check: checkedFile({ body, header, indexes, schema: options.schema, source }),
    ok: true,
  };
}

export { checkRecords };
export { displayHeader } from "./file-import-columns.ts";
export type { ImportHeaders, ImportSchema } from "./file-import-columns.ts";
export type { ImportCheck, ImportOptions, ImportReading, ImportRecord, ImportSource, ImportedRow };
