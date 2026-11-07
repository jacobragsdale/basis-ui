/* FileImport's preview: what the file holds, checked, before anything is sent. A line says how many rows are ready
 * and how many have problems, and which of the file's columns the import ignores; a DataTable, paged, shows every row
 * by its line in the file, with each refused cell marked and its reason under it in words; a switch narrows it to the
 * rows with problems; and the import button hands the app only the valid rows. */

import { useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { CircleExclamationPointIcon } from "#vendor/lucide/circle-exclamation-point.tsx";

import { DataTable } from "./data-table.tsx";
import type { DataTableColumn } from "./data-table-columns.ts";
import { Label } from "./label.tsx";
import { Switch } from "./switch.tsx";
import type { ImportCheck, ImportedRow } from "./file-import-rows.ts";

const counts = new Intl.NumberFormat("en-US");
/** Rows a page of the preview. */
const previewPageSize = 25;

function rowsText(rows: number): string {
  return `${counts.format(rows)} ${rows === 1 ? "row" : "rows"}`;
}

/** A cell's text, and, when it is refused, a mark and the reason. */
function ImportCell({
  text,
  problem,
}: {
  readonly text: ReactNode;
  readonly problem: string | undefined;
}): ReactNode {
  if (problem === undefined) {
    return text;
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

/** The preview's columns: the file's line, with any problem of the row's own, then a column for each key. */
function previewColumns<TRow>(
  check: ImportCheck<TRow>,
  headerOf: (key: string) => string,
): DataTableColumn<ImportedRow<TRow>>[] {
  return [
    {
      cell: (row) => <ImportCell text={row.line} problem={row.rowProblem} />,
      header: "Line",
      hideable: false,
      id: "line",
      value: (row) => row.line,
      variant: "numeric",
    },
    ...check.keys.map((key): DataTableColumn<ImportedRow<TRow>> => ({
      cell: (row) => <ImportCell text={row.cells[key]} problem={row.problems[key]} />,
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
  return `${check.fileName}: ${rowsText(check.rows.length)}, ${counts.format(check.valid.length)} ready to import, ${counts.format(refused)} with problems.${ignored}`;
}

/** The rows of a file, checked, with a switch that shows only the rows with problems. */
function FileImportPreview<TRow>({
  check,
  headerOf,
  rowCap,
}: {
  readonly check: ImportCheck<TRow>;
  readonly headerOf: (key: string) => string;
  readonly rowCap: number;
}): ReactElement {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const switchId = useId();
  const columns = previewColumns(check, headerOf);
  const rows = onlyProblems ? check.rows.filter((row) => hasProblem(row)) : check.rows;
  const refused = check.rows.length > check.valid.length;
  return (
    <div className="flex min-w-0 flex-col gap-3">
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
        rowLabel={(row) => `line ${String(row.line)}`}
        pageSize={previewPageSize}
        rowCap={rowCap}
        exportable={false}
      />
    </div>
  );
}

export { FileImportPreview };
