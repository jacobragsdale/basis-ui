/* FileImport: a drop zone and a file button for a CSV file, which it reads in the browser, maps to the app's Zod
 * schema by its header row, checks row by row, and previews, with each refused cell marked and its reason, before the
 * user confirms and the app receives only the valid rows, typed by the schema:
 *
 *   const positionRow = z.object({
 *     cusip: z.string().refine(isCusip, "Not a CUSIP."),
 *     par: amountSchema(parSuffixes),
 *     book: z.enum(["Rates", "Credit"]).optional(),
 *   });
 *
 *   <FileImport
 *     schema={positionRow}
 *     headers={{ par: ["Par", "Par amount"] }}
 *     onImport={async (rows) => {
 *       await createPositions.mutateAsync({ data: rows });
 *     }}
 *   />
 *
 * It refuses, with the reason and what to do, a spreadsheet workbook, which it does not read yet (save it as CSV), a
 * file that is not CSV, one over its size limit, one with more rows than its row limit, and one without a column the
 * schema needs. file-import-rows.ts reads and checks the file. */

import type { ReactElement } from "react";
import type { z } from "zod";

import { CircleCheckIcon } from "#vendor/lucide/circle-check.tsx";
import { OctagonXIcon } from "#vendor/lucide/octagon-x.tsx";

import { Alert, AlertDescription, AlertTitle } from "./alert.tsx";
import { Button } from "./button.tsx";
import { ErrorAlert } from "./error-alert.tsx";
import { FileImportDrop } from "./file-import-drop.tsx";
import { sizeText } from "./file-import-file.ts";
import { FileImportPreview } from "./file-import-preview.tsx";
import { displayHeader } from "./file-import-rows.ts";
import type { ImportHeaders, ImportSchema } from "./file-import-rows.ts";
import { defaultMaxBytes, defaultMaxRows, rowsText, useFileImport } from "./file-import-state.ts";
import type { ImportStage } from "./file-import-state.ts";
import { Spinner } from "./spinner.tsx";

interface FileImportProps<TSchema extends ImportSchema> {
  /** What a row must be: an object whose keys are the file's columns. Its fields read text, as a CSV's cells are,
   * such as `z.coerce.number()`, `amountSchema(parSuffixes)` or `z.enum([...])`; an empty cell is a missing value,
   * which an optional field takes. */
  readonly schema: TSchema;
  /** The header, or headers, a key's column goes by in a file, when not the key itself; the first heads the preview. */
  readonly headers?: ImportHeaders<TSchema> | undefined;
  /** Receives the valid rows, typed by the schema, when the user confirms. While a promise it returns is pending the
   * button waits; if it rejects, its error shows and the preview stays. */
  readonly onImport: (rows: readonly z.output<TSchema>[]) => Promise<void> | void;
  /** The largest file it reads, in bytes; 5 MB unless set. */
  readonly maxBytes?: number | undefined;
  /** The most rows a file may hold under its header; 10,000 unless set. */
  readonly maxRows?: number | undefined;
  /** The drop zone's title; "Drop a CSV file here" unless set. */
  readonly title?: string | undefined;
}

/** What happened to the last file: refused, with the reason, or imported. */
function Notice({
  refused,
  imported,
}: {
  readonly refused: string | undefined;
  readonly imported: string | undefined;
}): ReactElement | null {
  if (refused !== undefined) {
    return (
      <Alert variant="destructive">
        <OctagonXIcon />
        <AlertTitle>The file was not imported</AlertTitle>
        <AlertDescription>{refused}</AlertDescription>
      </Alert>
    );
  }
  return imported === undefined ? null : (
    <Alert variant="success">
      <CircleCheckIcon />
      <AlertTitle>{imported}</AlertTitle>
    </Alert>
  );
}

/** The import's limits, as the drop zone states them before a file is chosen. */
function limitsText(maxBytes: number, maxRows: number): string {
  return `CSV with a header row, up to ${sizeText(maxBytes)} and ${rowsText(maxRows)}. Save an Excel workbook as CSV first.`;
}

/** What shows while a file is read and checked. */
function Reading({ fileName }: { readonly fileName: string }): ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-label={`Reading ${fileName}`} />
      {`Reading ${fileName}…`}
    </div>
  );
}

/** The preview's buttons: import the valid rows, or go back for another file. */
function PreviewActions({
  valid,
  importing,
  onImport,
  onCancel,
}: {
  readonly valid: number;
  readonly importing: boolean;
  readonly onImport: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={valid === 0 || importing} onClick={onImport}>
        {importing ? <Spinner data-icon="inline-start" aria-label="Importing" /> : null}
        {`Import ${rowsText(valid)}`}
      </Button>
      <Button variant="outline" disabled={importing} onClick={onCancel}>
        Choose another file
      </Button>
    </div>
  );
}

/** A file read, previewed, and the buttons that import it or choose another. */
function Previewing<TRow>({
  stage,
  headerOf,
  rowCap,
  onImport,
  onCancel,
}: {
  readonly stage: Extract<ImportStage<TRow>, { readonly stage: "previewing" }>;
  readonly headerOf: (key: string) => string;
  readonly rowCap: number;
  readonly onImport: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  return (
    <div data-slot="file-import" className="flex min-w-0 flex-col gap-3">
      <FileImportPreview check={stage.check} headerOf={headerOf} rowCap={rowCap} />
      <ErrorAlert error={stage.error} />
      <PreviewActions
        valid={stage.check.valid.length}
        importing={stage.importing}
        onImport={onImport}
        onCancel={onCancel}
      />
    </div>
  );
}

/** A CSV import, checked against `schema`, that hands the app the valid rows once the user confirms.
 *
 * @example
 * ```tsx
 * import { FileImport, amountSchema, parSuffixes } from "@basis/ui";
 * import { z } from "zod";
 *
 * const positionRow = z.object({ cusip: z.string(), par: amountSchema(parSuffixes) });
 *
 * <FileImport
 *   schema={positionRow}
 *   headers={{ par: ["Par", "Par amount"] }}
 *   onImport={async () => {
 *     await Promise.resolve();
 *   }}
 * />;
 * ```
 */
function FileImport<TSchema extends ImportSchema>({
  schema,
  headers,
  onImport,
  maxBytes = defaultMaxBytes,
  maxRows = defaultMaxRows,
  title = "Drop a CSV file here",
}: FileImportProps<TSchema>): ReactElement {
  const { stage, read, confirm, choose } = useFileImport({
    headers,
    maxBytes,
    maxRows,
    onImport,
    schema,
  });
  if (stage.stage === "reading") {
    return <Reading fileName={stage.fileName} />;
  }
  if (stage.stage === "previewing") {
    return (
      <Previewing
        stage={stage}
        headerOf={(key) => displayHeader(key, headers)}
        rowCap={maxRows}
        onImport={() => {
          confirm().catch(reportError);
        }}
        onCancel={() => {
          choose();
        }}
      />
    );
  }
  return (
    <div data-slot="file-import" className="flex min-w-0 flex-col gap-3">
      <Notice refused={stage.refused} imported={stage.imported} />
      <FileImportDrop
        title={title}
        limits={limitsText(maxBytes, maxRows)}
        onFile={(file) => {
          read(file).catch(reportError);
        }}
        onFiles={(count) => {
          choose(`${String(count)} files were dropped. Drop one file at a time.`);
        }}
      />
    </div>
  );
}

export { FileImport };
export type { FileImportProps };
