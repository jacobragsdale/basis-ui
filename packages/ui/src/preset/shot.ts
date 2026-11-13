/* The shot task the preset gives every app, run by Node in the app's root:
 *
 *   vp run shot ROUTE... [--all] [--mode light|dark] [--density compact|comfortable] [--theme NAME]
 *               [--width N] [--height N] [--wait MS] [--selector CSS] [--step STEP]... [--compare DIR] [--json]
 *
 * It opens each ROUTE, such as / or /positions?book=rates, and with `--all` every route of the app's router as well, in
 * headless Chromium against the app's `vp dev`, the one already running on the app's own port or one it starts in
 * fixture mode and stops after (dev-server.ts). It sets the mode, density and theme through the cookie the head script reads,
 * takes the steps (shot-steps.ts), and writes five files into `.shots/` for each route, named after it and the options
 * (shot-options.ts):
 *
 * - NAME.png, the page's picture, or the one element `--selector` picks;
 * - NAME.aria.yml, its accessibility tree, as Playwright's ARIA snapshot;
 * - NAME.console.txt, what the page logged as errors;
 * - NAME.network.txt, each request to `/api`, its status and what answered it (shot-network.ts);
 * - NAME.axe.txt, axe's violations, one ERROR line each (shot-axe.ts);
 *
 * and, with `--compare DIR`, NAME.diff.png where the picture differs from DIR's (shot-compare.ts). It prints their
 * paths, or with `--json` one line of ShotReport (shot-report.ts). A logged error, a violation, a step that cannot be
 * taken, a selector that picks no one element, and a difference from a baseline each fail the task, with the files
 * still written, so an agent sees the problem and the page as it stood.
 *
 * Every failure is one line that starts with ERROR and ends with the fix. */

import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { devServer } from "./dev-server.ts";
import { devPort } from "./fixture-mode.ts";
import { git } from "./git.ts";
import { optionsOf } from "./shot-options.ts";
import type { ShotOptions } from "./shot-options.ts";
import { launch, pageFor } from "./shot-page.ts";
import type { ShotReport } from "./shot-report.ts";
import { linesText, shootInTurn, shootRoute, shotsFolder } from "./shot-route.ts";
import type { Run } from "./shot-route.ts";
import { routerPaths, routesToShoot, skippedLine } from "./shot-routes.ts";
import { TaskError } from "./task-error.ts";

/** The routes to shoot: those named, and with `--all` the router's, with the paths it skipped. */
async function routesOf(
  run: Run,
): Promise<{ readonly routes: readonly string[]; readonly skipped: readonly string[] }> {
  if (!run.options.all) {
    return { routes: run.options.routes, skipped: [] };
  }
  const page = await pageFor(run.browser, run.origin, run.options);
  try {
    return routesToShoot(run.options.routes, await routerPaths(page, `${run.origin}/`));
  } finally {
    await page.context().close();
  }
}

/** Fails at once when `--compare` names no folder, rather than once for each picture. */
function checkCompareFolder(root: string, folder: string | undefined): void {
  if (folder === undefined) {
    return;
  }
  const found = path.resolve(root, folder);
  if (!existsSync(found) || !statSync(found).isDirectory()) {
    throw new TaskError(
      `ERROR --compare names ${folder}, which is no folder: make it, copy into it the pictures in ${shotsFolder}/ that are right, then run vp run shot again.`,
    );
  }
}

/** Takes the shots `run` asks for, on its browser, and reports them. */
async function shootAll(run: Run): Promise<ShotReport> {
  const { routes, skipped } = await routesOf(run);
  const shots = await shootInTurn(routes, async (route) => shootRoute(run, route));
  const problems = shots.flatMap((shot) => shot.problems);
  return {
    ok: problems.length === 0,
    problems,
    shots: shots.flatMap((shot) => ("entry" in shot ? [shot.entry] : [])),
    skipped: skipped.map((route) => ({ reason: skippedLine(route), route })),
  };
}

/** Takes the shots the options ask for, against the app's `vp dev`, and reports them. */
async function shoot(root: string, options: ShotOptions): Promise<ShotReport> {
  checkCompareFolder(root, options.compare);
  const origin = `http://localhost:${String(devPort(root))}`;
  const server = await devServer(origin, root);
  try {
    const browser = await launch();
    try {
      return await shootAll({ browser, options, origin, root });
    } finally {
      await browser.close();
    }
  } finally {
    server.stop();
  }
}

/** What the task prints without `--json`: on stdout each file written, each match with a baseline and each route
 * skipped; on stderr each problem's line. */
function printed(report: ShotReport): { readonly out: string; readonly err: string } {
  const out = report.shots.flatMap((shot) => {
    const { png, aria, console: logged, network, axe, diff } = shot.files;
    const matched =
      shot.compare === null || shot.compare.changed > 0 || diff !== null
        ? []
        : [`${png} matches ${shot.compare.baseline}: 0 pixels changed`];
    return [png, aria, logged, network, axe, ...(diff === null ? [] : [diff]), ...matched];
  });
  return {
    err: linesText(report.problems.map(({ message }) => message)),
    out: linesText([...out, ...report.skipped.map(({ reason }) => reason)]),
  };
}

/** The report of a task that failed as a whole, with its one line. */
function failedReport(error: unknown): ShotReport {
  const message =
    error instanceof TaskError
      ? error.message
      : `ERROR the shot task failed: ${String(error)}; run it again, and report the message if it repeats.`;
  return { ok: false, problems: [{ kind: "task", message, route: null }], shots: [], skipped: [] };
}

/** The root of Git Bash's MSYS, which it rewrites an argument that starts with one slash under, on Windows when an
 * argument looks rewritten: Git's own folder, from where git keeps its commands, such as
 * `C:/Program Files/Git/mingw64/libexec/git-core`. */
function msysRoot(args: readonly string[]): string | undefined {
  if (process.platform !== "win32" || !args.some((arg) => /^[A-Za-z]:[\\/]/u.test(arg))) {
    return undefined;
  }
  const exec = git(process.cwd(), ["--exec-path"])?.replaceAll("\\", "/");
  return /^(?<root>.+?)\/(?:mingw32|mingw64|clang64|clangarm64|ucrt64|usr)\/libexec\/git-core$/iu.exec(
    exec ?? "",
  )?.groups?.["root"];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // Through a promise, so that options that cannot be read fail as the report says, as any other failure does.
  const report = await Promise.resolve()
    .then(async () => shoot(process.cwd(), optionsOf(args, msysRoot(args))))
    .catch(failedReport);
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    const { out, err } = printed(report);
    process.stdout.write(out);
    process.stderr.write(err);
  }
  process.exitCode = report.ok ? 0 : 1;
}

await main();
