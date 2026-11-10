/* Writing what `vp run new` and `vp run fixtures new` make: never over a file that exists unless `--force` says to,
 * and formatted by the app's own `vp fmt` after, so what they write passes `vp check` as written. */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TaskError } from "./task-error.ts";
import { firstLine, vp } from "./verify-tools.ts";

interface NewFile {
  /** The file's name from the app's root, `/`-separated. */
  readonly file: string;
  readonly text: string;
}

interface WriteOptions {
  readonly force: boolean;
  /** The command writing, as `vp run new`, which the failure names. */
  readonly task: string;
  /** What else to do than replace a file that exists, as `give the page another NAME`, if anything. */
  readonly instead?: string;
}

/** Writes each of `files`, or none of them when one exists and `force` is not set. */
function writeNew(
  root: string,
  files: readonly NewFile[],
  { force, task, instead }: WriteOptions,
): void {
  const existing = files.find(({ file }) => existsSync(path.join(root, file)));
  if (existing !== undefined && !force) {
    const other = instead === undefined ? "" : `${instead}, or `;
    throw new TaskError(
      `ERROR ${existing.file} exists, and ${task} never overwrites a file: ${other}run it again with --force to replace it.`,
    );
  }
  for (const { file, text } of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

/** Formats `files` with the app's `vp fmt`, as `vp check` will check them. */
function formatFiles(root: string, files: readonly string[]): void {
  const ran = vp(root, ["fmt", ...files]);
  if (ran.status !== 0) {
    const said = firstLine(ran.stderr === "" ? ran.stdout : ran.stderr);
    throw new TaskError(
      `ERROR vp fmt could not format ${files.join(", ")}, which were written: run vp fmt ${files.join(" ")} to see why${said === "" ? "" : ` ("${said}")`}, and fix what it says.`,
    );
  }
}

export { formatFiles, writeNew };
export type { NewFile };
