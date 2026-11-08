/* FileImport's state: waiting for a file, with what became of the last one; reading one; or previewing one, from the
 * workbook's sheet the user chose, while the app imports its rows. The steps that wait on the file or on the app are
 * async functions, which the component's handlers start. */

import { useState } from "react";
import type { z } from "zod";

import { bytesPerMegabyte } from "./file-import-file.ts";
import { readImport } from "./file-import-read.ts";
import type { ImportCheck, ImportHeaders, ImportSchema } from "./file-import-rows.ts";

/** Where the import is. */
type ImportStage<TRow> =
  | {
      readonly stage: "choosing";
      readonly refused?: string | undefined;
      readonly imported?: string | undefined;
    }
  | { readonly stage: "reading"; readonly fileName: string }
  | {
      readonly stage: "previewing";
      readonly check: ImportCheck<TRow>;
      /** The check of another of the workbook's sheets, which the user may choose. */
      readonly checkOf: (sheet: string) => ImportCheck<TRow>;
      readonly importing: boolean;
      readonly error: unknown;
    };

interface FileImportOptions<TSchema extends ImportSchema> {
  readonly schema: TSchema;
  readonly headers: ImportHeaders<TSchema> | undefined;
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly sheet: string | undefined;
  readonly onImport: (rows: readonly z.output<TSchema>[]) => Promise<void> | void;
}

interface FileImportState<TRow> {
  readonly stage: ImportStage<TRow>;
  /** Reads and checks a file, then previews it, or says why it was refused. */
  readonly read: (file: File) => Promise<void>;
  /** Hands the previewed file's valid rows to the app. */
  readonly confirm: () => Promise<void>;
  /** Goes back to waiting for a file, saying why the last was refused, if it was. */
  readonly choose: (refused?: string) => void;
  /** Previews another of the workbook's sheets. */
  readonly chooseSheet: (sheet: string) => void;
}

const defaultMegabytes = 5;
/** The largest file an import reads unless it sets its own limit. */
const defaultMaxBytes = defaultMegabytes * bytesPerMegabyte;
/** The most rows an import takes unless it sets its own limit. */
const defaultMaxRows = 10_000;
const counts = new Intl.NumberFormat("en-US");

function rowsText(rows: number): string {
  return `${counts.format(rows)} ${rows === 1 ? "row" : "rows"}`;
}

/** The stage reading a file leads to: its preview, or back to choosing, with why it was refused. Outside the hook,
 * since the React Compiler compiles no conditional inside a `try`. */
async function stageAfterReading<TSchema extends ImportSchema>(
  file: File,
  options: Omit<FileImportOptions<TSchema>, "onImport">,
): Promise<ImportStage<z.output<TSchema>>> {
  try {
    const reading = await readImport(file, options);
    return reading.ok
      ? {
          check: reading.check,
          checkOf: reading.checkOf,
          error: undefined,
          importing: false,
          stage: "previewing",
        }
      : { refused: reading.reason, stage: "choosing" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { refused: `${file.name} could not be read: ${reason}`, stage: "choosing" };
  }
}

/** The stage importing a preview's valid rows leads to: back to choosing, saying how many were imported, or the
 * preview again, with the app's error. */
async function stageAfterImport<TRow>(
  preview: Extract<ImportStage<TRow>, { readonly stage: "previewing" }>,
  onImport: (rows: readonly TRow[]) => Promise<void> | void,
): Promise<ImportStage<TRow>> {
  const { check } = preview;
  try {
    await onImport(check.valid);
    return {
      imported: `Imported ${rowsText(check.valid.length)} from ${check.fileName}.`,
      stage: "choosing",
    };
  } catch (error) {
    return { ...preview, error, importing: false };
  }
}

function useFileImport<TSchema extends ImportSchema>({
  onImport,
  ...options
}: FileImportOptions<TSchema>): FileImportState<z.output<TSchema>> {
  const [stage, setStage] = useState<ImportStage<z.output<TSchema>>>({ stage: "choosing" });
  return {
    choose: (refused) => {
      setStage({ refused, stage: "choosing" });
    },
    chooseSheet: (sheet) => {
      if (stage.stage === "previewing" && !stage.importing) {
        setStage({ ...stage, check: stage.checkOf(sheet), error: undefined });
      }
    },
    confirm: async () => {
      if (stage.stage === "previewing") {
        setStage({ ...stage, error: undefined, importing: true });
        setStage(await stageAfterImport(stage, onImport));
      }
    },
    read: async (file) => {
      setStage({ fileName: file.name, stage: "reading" });
      setStage(await stageAfterReading(file, options));
    },
    stage,
  };
}

export { defaultMaxBytes, defaultMaxRows, rowsText, useFileImport };
export type { ImportStage };
