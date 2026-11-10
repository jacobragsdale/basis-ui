/* `vp run shot --compare DIR`: each picture against the baseline of the same name in DIR, pixel for pixel, with the
 * comparator Playwright's `toHaveScreenshot` uses, as the gallery's shots run it (threshold 0, no pixel allowed). A
 * picture that differs gets a diff beside it, NAME.diff.png, the changed pixels in red over a faded copy. Baselines are
 * made and compared in WSL, as docs/design.md says, since text draws differently on each operating system. */

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

import type { ShotEntry, ShotProblem } from "./shot-report.ts";

/** What Playwright's image comparator gives: nothing for a match, else its message and the diff's PNG bytes. */
type Comparator = (
  actual: Buffer,
  expected: Buffer,
  options: { readonly threshold: number; readonly maxDiffPixels: number },
) => { readonly errorMessage: string; readonly diff?: Buffer } | null;

/** Playwright's PNG comparator, from the playwright-core beside @basis/ui's Playwright. */
function comparator(): Comparator {
  const fromPlaywright = createRequire(createRequire(import.meta.url).resolve("playwright"));
  const core = z
    .object({
      utils: z.object({
        getComparator: z.custom<(mimeType: string) => Comparator>(
          (value) => typeof value === "function",
        ),
      }),
    })
    .parse(fromPlaywright("playwright-core/lib/coreBundle"));
  return core.utils.getComparator("image/png");
}

/** How a picture compared: the baseline it was held to, how many pixels changed, and the diff, when any did. */
interface Comparison {
  readonly baseline: string;
  readonly changed: number;
  readonly diff: string | null;
  /** The two sizes, `1280x800` and the baseline's, when they differ. */
  readonly sizes: readonly [string, string] | null;
}

const sizes =
  /^Expected an image (?<expectedWidth>\d+)px by (?<expectedHeight>\d+)px, received (?<width>\d+)px by (?<height>\d+)px/u;
const pixels = /(?<count>\d+) pixels \(ratio/u;

/** How the picture at `actual` compares with the one at `baseline`, writing the diff at `diff` when they differ and
 * removing an older one when they match; `undefined` when there is no baseline. */
async function compareShot(
  actual: string,
  baseline: string,
  diff: string,
): Promise<Comparison | undefined> {
  if (!existsSync(baseline)) {
    return undefined;
  }
  const result = comparator()(await readFile(actual), await readFile(baseline), {
    maxDiffPixels: 0,
    threshold: 0,
  });
  if (result === null) {
    await rm(diff, { force: true });
    return { baseline, changed: 0, diff: null, sizes: null };
  }
  if (result.diff !== undefined) {
    await writeFile(diff, result.diff);
  }
  const size = sizes.exec(result.errorMessage)?.groups;
  return {
    baseline,
    changed: Number(pixels.exec(result.errorMessage)?.groups?.["count"] ?? 0),
    diff: result.diff === undefined ? null : diff,
    sizes:
      size === undefined
        ? null
        : [
            `${size["width"] ?? ""}x${size["height"] ?? ""}`,
            `${size["expectedWidth"] ?? ""}x${size["expectedHeight"] ?? ""}`,
          ],
  };
}

/** The line a picture that differs from its baseline fails with, or nothing when it matches. */
function compareProblem(
  route: string,
  png: string,
  comparison: Comparison,
): ShotProblem | undefined {
  const { changed, sizes: sized, baseline, diff } = comparison;
  if (changed === 0 && sized === null) {
    return undefined;
  }
  const size = sized === null ? "" : `is ${sized[0]} where the baseline is ${sized[1]}, and `;
  return {
    kind: "compare",
    message: `ERROR ${png} ${size}differs from ${baseline} in ${String(changed)} pixels, drawn in red in ${diff ?? "no diff"}: look at the diff, then fix the page, or if the change is meant, copy ${png} over ${baseline}.`,
    route,
  };
}

/** A file as a line names it: from the app's root when it is inside it, else whole. */
function shown(root: string, file: string): string {
  const relative = path.relative(root, file);
  return relative.startsWith("..") || path.isAbsolute(relative)
    ? file
    : relative.split(path.sep).join("/");
}

/** Where a comparison is made: the app's root, the `--compare` folder from it, and the route pictured. */
interface Against {
  readonly root: string;
  readonly folder: string;
  readonly route: string;
}

/** How the picture `png`, from the app's root, compares with its baseline in the folder, and what failed: a missing
 * baseline, or a difference. Paths in both are from the app's root. */
async function compareToBaseline(
  { root, folder, route }: Against,
  png: string,
): Promise<{ readonly compare: ShotEntry["compare"]; readonly problems: readonly ShotProblem[] }> {
  const baseline = shown(root, path.resolve(root, folder, path.basename(png)));
  const diff = png.replace(/\.png$/u, ".diff.png");
  const result = await compareShot(
    path.join(root, png),
    path.resolve(root, baseline),
    path.join(root, diff),
  );
  if (result === undefined) {
    const message = `ERROR ${baseline} does not exist, so ${png} has no baseline: copy ${png} there once it is right, then run the shot again with --compare ${folder}.`;
    return { compare: null, problems: [{ kind: "compare", message, route }] };
  }
  const comparison = { ...result, baseline, diff: result.diff === null ? null : diff };
  const problem = compareProblem(route, png, comparison);
  return {
    compare: { baseline, changed: comparison.changed, diff: comparison.diff },
    problems: problem === undefined ? [] : [problem],
  };
}

export { compareShot, compareToBaseline };
export type { Comparison };
