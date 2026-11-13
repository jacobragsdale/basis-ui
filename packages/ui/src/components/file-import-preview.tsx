/* FileImport's preview: what the file holds, checked, before anything is sent. For a workbook with several sheets
 * that hold the schema's columns, a select chooses the sheet. A line says how many rows are ready and how many have
 * problems, and which of the file's columns the import ignores; a DataTable, paged, shows every row by its line in the
 * CSV or its row in the sheet, with each refused cell marked and its reason under it in words, and under a cell whose
 * value the schema reads as something its text does not say, such as `5M` par as 5,000, what will be sent; a switch
 * narrows it to the rows with problems; and the import button hands the app only the valid rows. */

import { useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { CircleExclamationPointIcon } from "#vendor/lucide/circle-exclamation-point.tsx";

import { DataTable } from "./data-table.tsx";
import type { DataTableColumn } from "./data-table-columns.ts";
import { Label } from "./label.tsx";
import { NativeSelect, NativeSelectOption } from "./native-select.tsx";
import { Switch } from "./switch.tsx";
import type { ImportCheck, ImportedRow } from "./file-import-rows.ts";
import { sentText } from "./file-import-sent.ts";

const counts = new Intl.NumberFormat("en-US");
/** Rows a page of the preview. */
const previewPageSize = 25;

function rowsText(rows: number): string {
  return `${counts.format(rows)} ${rows === 1 ? "row" : "rows"}`;
}

/** A cell's text, and, when it is refused, a mark and the reason, or, when what will be sent differs from the text,
 * what that is. */
function ImportCell({
  text,
  problem,
  sent,
}: {
  readonly text: ReactNode;
  readonly problem: string | undefined;
  readonly sent?: string | undefined;
}): ReactNode {
  if (problem === undefined && sent === undefined) {
    return text;
  }
  if (problem === undefined) {
    return (
      <span className="flex flex-col gap-0.5">
        <span>{text}</span>
        <span data-slot="file-import-sent" className="text-xs text-muted-foreground">
          Sent as {sent}
        </span>
      </span>
    );
  }
  return (
    <span
      data-slot="file-import-problem"
      className="flex min-w-48 flex-col gap-0.5 whitespace-normal"
    >
      <span>{text}</span>
      <span className="flex items-start gap-1 text-xs text-destructive [&>svg]:mt-0.5 [&>svg]:shrink-0">
        <CircleExclamationPointIcon className="size-3" />
        <span className="sr-only">Problem: </span>
        {problem}
      </span>
    </span>
  );
}

/** What a valid row sends for a key, where that differs from its cell's text. */
function sentOf<TRow>(row: ImportedRow<TRow>, key: string): string | undefined {
  const { value } = row;
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const sent: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
  return sentText(row.cells[key] ?? "", sent);
}

/** What the preview calls a record's number: a CSV's line, or a sheet's row. */
function lineWord<TRow>(check: ImportCheck<TRow>): "Line" | "Row" {
  return check.sheet === undefined ? "Line" : "Row";
}

/** The preview's columns: the file's line, with any problem of the row's own, then a column for each key. */
function previewColumns<TRow>(
  check: ImportCheck<TRow>,
  headerOf: (key: string) => string,
): DataTableColumn<ImportedRow<TRow>>[] {
  return [
    {
      cell: (row) => <ImportCell text={row.line} problem={row.rowProblem} />,
      header: lineWord(check),
      hideable: false,
      id: "line",
      value: (row) => row.line,
      variant: "numeric",
    },
    ...check.keys.map((key): DataTableColumn<ImportedRow<TRow>> => ({
      cell: (row) => (
        <ImportCell text={row.cells[key]} problem={row.problems[key]} sent={sentOf(row, key)} />
      ),
      header: headerOf(key),
      id: `field-${key}`,
      value: (row) => row.cells[key],
    })),
  ];
}

/** Whether a row has a problem, in a cell or of its own. */
function hasProblem<TRow>(row: ImportedRow<TRow>): boolean {
  return row.rowProblem !== undefined || Object.keys(row.problems).length > 0;
}

/** The summary line over the preview. */
function summaryOf<TRow>(check: ImportCheck<TRow>): string {
  const refused = check.rows.length - check.valid.length;
  const ignored =
    check.ignored.length === 0 ? "" : ` Columns not imported: ${check.ignored.join(", ")}.`;
  const source =
    check.sheet === undefined ? check.fileName : `${check.fileName}, sheet ${check.sheet}`;
  return `${source}: ${rowsText(check.rows.length)}, ${counts.format(check.valid.length)} ready to import, ${counts.format(refused)} with problems.${ignored}`;
}

/** The select that chooses among a workbook's sheets, shown when more than one holds the schema's columns. */
function SheetChoice({
  sheet,
  sheets,
  disabled,
  onSheet,
}: {
  readonly sheet: string;
  readonly sheets: readonly string[];
  readonly disabled: boolean;
  readonly onSheet: (sheet: string) => void;
}): ReactElement {
  const selectId = useId();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={selectId}>Sheet</Label>
      <NativeSelect
        id={selectId}
        value={sheet}
        disabled={disabled}
        onChange={(event) => {
          onSheet(event.currentTarget.value);
        }}
      >
        {sheets.map((name) => (
          <NativeSelectOption key={name} value={name}>
            {name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The rows of a file, checked, with a switch that shows only the rows with problems, and for a workbook a select of
 * the sheets it could import instead. */
function FileImportPreview<TRow>({
  check,
  headerOf,
  rowCap,
  importing,
  onSheet,
}: {
  readonly check: ImportCheck<TRow>;
  readonly headerOf: (key: string) => string;
  readonly rowCap: number;
  readonly importing: boolean;
  readonly onSheet: (sheet: string) => void;
}): ReactElement {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const switchId = useId();
  const columns = previewColumns(check, headerOf);
  const rows = onlyProblems ? check.rows.filter((row) => hasProblem(row)) : check.rows;
  const refused = check.rows.length > check.valid.length;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {check.sheet !== undefined && check.sheets.length > 1 ? (
        <SheetChoice
          sheet={check.sheet}
          sheets={check.sheets}
          disabled={importing}
          onSheet={onSheet}
        />
      ) : null}
      <p className="text-sm">{summaryOf(check)}</p>
      {refused ? (
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={onlyProblems} onCheckedChange={setOnlyProblems} />
          <Label htmlFor={switchId}>Only rows with problems</Label>
        </div>
      ) : null}
      <DataTable
        label={`Rows in ${check.fileName}`}
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.line)}
        rowLabel={(row) => `${lineWord(check).toLowerCase()} ${String(row.line)}`}
        pageSize={previewPageSize}
        rowCap={rowCap}
        exportable={false}
      />
    </div>
  );
}

export { FileImportPreview };
