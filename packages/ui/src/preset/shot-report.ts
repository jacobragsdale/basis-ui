/* What `vp run shot --json` prints, on one line: each shot's files and counts, the routes `--all` skipped, and every
 * problem as the ERROR line the task would print. */

import { z } from "zod";

/** What a problem can be: a logged error, a violation, a difference from a baseline, a selector or a step that
 * failed, or the whole task. */
const kinds = ["axe", "compare", "console", "selector", "step", "task"] as const;

/** The files one shot wrote, from the app's root. */
interface ShotFiles {
  readonly png: string;
  readonly aria: string;
  readonly console: string;
  readonly network: string;
  readonly axe: string;
  /** The diff against the baseline, written only when `--compare` found a difference. */
  readonly diff: string | null;
}

/** One route's shot. */
interface ShotEntry {
  readonly route: string;
  readonly files: ShotFiles;
  /** The errors the page logged. */
  readonly console: number;
  /** The elements axe found at fault. */
  readonly axe: number;
  /** The requests to `/api`. */
  readonly requests: number;
  /** How the picture compared with its baseline, with `--compare` and a baseline to hold it to. */
  readonly compare: {
    readonly baseline: string;
    readonly changed: number;
    readonly diff: string | null;
  } | null;
}

/** What failed: the route, unless the whole task did, what kind of failure, and its ERROR line. */
interface ShotProblem {
  readonly route: string | null;
  readonly kind: (typeof kinds)[number];
  readonly message: string;
}

/** What `vp run shot --json` prints: `ok` when nothing failed. */
interface ShotReport {
  readonly ok: boolean;
  readonly shots: readonly ShotEntry[];
  /** The router's paths `--all` could not open, each with how to picture it. */
  readonly skipped: readonly { readonly route: string; readonly reason: string }[];
  readonly problems: readonly ShotProblem[];
}

const file = z.string().min(1);
const count = z.int().nonnegative();

const problemSchema = z.strictObject({
  kind: z.enum(kinds),
  message: z.string().startsWith("ERROR "),
  route: file.nullable(),
});

const compareSchema = z.strictObject({ baseline: file, changed: count, diff: file.nullable() });

const filesSchema = z.strictObject({
  aria: file,
  axe: file,
  console: file,
  diff: file.nullable(),
  network: file,
  png: file,
});

const entrySchema = z.strictObject({
  axe: count,
  compare: compareSchema.nullable(),
  console: count,
  files: filesSchema,
  requests: count,
  route: file,
});

const skippedSchema = z.strictObject({ reason: file, route: file });

/** The report's schema, which its tests hold `--json`'s output to. */
const shotReportSchema: z.ZodType<ShotReport> = z.strictObject({
  ok: z.boolean(),
  problems: z.array(problemSchema),
  shots: z.array(entrySchema),
  skipped: z.array(skippedSchema),
});

export { shotReportSchema };
export type { ShotEntry, ShotFiles, ShotProblem, ShotReport };
