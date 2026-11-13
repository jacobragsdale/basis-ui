/* One route's shot for `vp run shot`, as shot.ts's header says: the page opened with the options' mode and density,
 * the steps taken, the picture and the accessibility tree, the console, the network and axe's check written, and the
 * picture compared with its baseline. What fails is returned as problems, each its ERROR line, so the files are
 * written whatever failed. */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Browser, Locator, Page } from "playwright";

import { axeViolations, violationLine } from "./shot-axe.ts";
import { compareToBaseline } from "./shot-compare.ts";
import { recordNetwork } from "./shot-network.ts";
import type { Network } from "./shot-network.ts";
import { nameOf } from "./shot-options.ts";
import type { ShotOptions } from "./shot-options.ts";
import { open, pageFor } from "./shot-page.ts";
import type { ShotEntry, ShotFiles, ShotProblem } from "./shot-report.ts";
import { pathsOnPage, unmatchedLine } from "./shot-routes.ts";
import { takeSteps } from "./shot-steps.ts";
import { TaskError } from "./task-error.ts";

/** The folder the files go in, from the app's root. */
const shotsFolder = ".shots";

/** How long a step's requests may take to come back, and the pauses around waiting for them, so that what a step
 * starts has begun and what its answer changes has been drawn. */
const stepQuietMs = 5000;
const beforeQuietMs = 150;
const afterQuietMs = 100;

/** What every shot of one run shares. */
interface Run {
  readonly root: string;
  readonly origin: string;
  readonly browser: Browser;
  readonly options: ShotOptions;
}

/** A route's shot: what it wrote and found, and what failed. */
interface RouteShot {
  readonly entry: ShotEntry;
  readonly problems: readonly ShotProblem[];
}

/** The page of one shot, what it asked `/api`, and its files. */
interface Shooting {
  readonly run: Run;
  readonly route: string;
  readonly page: Page;
  readonly network: Network;
  readonly files: ShotFiles;
}

/** A path from the app's root, `/`-separated on every system. */
function fromRoot(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

/** A file's path from the app's root, made absolute. */
function absolute(shooting: Shooting, file: string): string {
  return path.join(shooting.run.root, file);
}

/** The files a shot of `route` writes. */
function filesOf(run: Run, route: string): ShotFiles {
  const base = fromRoot(run.root, path.join(run.root, shotsFolder, nameOf(route, run.options)));
  return {
    aria: `${base}.aria.yml`,
    axe: `${base}.axe.txt`,
    console: `${base}.console.txt`,
    diff: null,
    network: `${base}.network.txt`,
    png: `${base}.png`,
  };
}

/** The text of a file of lines. */
function linesText(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}

/** Waits for what a step started: its requests, and a frame or two for what they change. */
async function settle(network: Network): Promise<void> {
  await sleep(beforeQuietMs);
  await network.quiet(stepQuietMs);
  await sleep(afterQuietMs);
}

/** Takes the steps, returning the failure of the first that cannot be taken. */
async function stepped({
  run,
  route,
  page,
  network,
  files,
}: Shooting): Promise<readonly ShotProblem[]> {
  try {
    await takeSteps(
      { files: files.png.replace(/\.png$/u, ""), page, route, settle: async () => settle(network) },
      run.options.steps,
    );
    return [];
  } catch (error) {
    if (error instanceof TaskError) {
      return [{ kind: "step", message: error.message, route }];
    }
    throw error;
  }
}

/** The element `selector` picks on the page, or the failure that says why it picks no one element. */
async function selected(
  { route, page, files }: Shooting,
  selector: string,
): Promise<Locator | ShotProblem> {
  const fail = (reason: string): ShotProblem => ({
    kind: "selector",
    message: `ERROR --selector ${selector} ${reason}`,
    route,
  });
  try {
    const picked = page.locator(selector).filter({ visible: true });
    const count = await picked.count();
    if (count === 1) {
      return picked;
    }
    return fail(
      count === 0
        ? `matches nothing that shows on ${route}: pick an element from ${files.aria}, which holds the whole page instead, and give its CSS selector.`
        : `matches ${String(count)} elements on ${route}: give a selector that only one matches, as an id; ${files.png} pictures the whole page instead.`,
    );
  } catch (error) {
    return fail(
      `is no CSS selector Chromium reads (${String(error).split("\n")[0] ?? ""}): give one such as main, #coupons or [data-slot="card"].`,
    );
  }
}

/** Writes the picture and the accessibility tree, of the one element `--selector` picks or of the whole page, and
 * returns the selector's failure, if it picks no one element. */
async function picture(shooting: Shooting): Promise<readonly ShotProblem[]> {
  const { page, files, run } = shooting;
  const chosen =
    run.options.selector === undefined ? undefined : await selected(shooting, run.options.selector);
  const element = chosen === undefined || "kind" in chosen ? undefined : chosen;
  await mkdir(path.dirname(absolute(shooting, files.png)), { recursive: true });
  const look = {
    animations: "disabled",
    caret: "hide",
    path: absolute(shooting, files.png),
  } as const;
  await (element === undefined
    ? page.screenshot({ ...look, fullPage: true })
    : element.screenshot(look));
  const tree = await (element ?? page.locator("body")).ariaSnapshot();
  await writeFile(absolute(shooting, files.aria), `${tree}\n`);
  return chosen !== undefined && "kind" in chosen ? [chosen] : [];
}

/** How the picture compared with its baseline in the `--compare` folder, when the options ask, and its failure. */
async function compared(
  shooting: Shooting,
): Promise<{ readonly compare: ShotEntry["compare"]; readonly problems: readonly ShotProblem[] }> {
  const { run, route, files } = shooting;
  return run.options.compare === undefined
    ? { compare: null, problems: [] }
    : compareToBaseline({ folder: run.options.compare, root: run.root, route }, files.png);
}

/** The problem a page that logged errors is, if it logged any. */
function consoleProblems(
  route: string,
  errors: readonly string[],
  file: string,
): readonly ShotProblem[] {
  const count = `${String(errors.length)} error${errors.length === 1 ? "" : "s"}`;
  return errors.length === 0
    ? []
    : [
        {
          kind: "console",
          message: `ERROR ${route} logged ${count}, listed in ${file}: fix them, or read them there before trusting the picture.`,
          route,
        },
      ];
}

/** Writes the console's errors, the requests to `/api` and axe's violations, each one to a line. */
async function writeTexts(
  { files, network, run }: Shooting,
  {
    errors,
    violations,
  }: { readonly errors: readonly string[]; readonly violations: readonly string[] },
): Promise<void> {
  const texts: readonly (readonly [string, readonly string[]])[] = [
    [files.console, errors],
    [files.network, network.lines()],
    [files.axe, violations],
  ];
  await Promise.all(
    texts.map(async ([file, lines]) => writeFile(path.join(run.root, file), linesText(lines))),
  );
}

/** Opens the route, takes the steps, pictures it, checks it with axe, and writes the console, network and axe files,
 * returning the entry without its comparison, and what failed. */
async function shot(shooting: Shooting): Promise<RouteShot> {
  const { run, route, page, network, files } = shooting;
  const errors = await open(page, `${run.origin}${route}`, 0);
  const unmatched = unmatchedLine(route, await pathsOnPage(page));
  const steps = await stepped(shooting);
  await sleep(run.options.wait);
  const selector = await picture(shooting);
  const found = await axeViolations(page);
  const violations = found.map((violation) => violationLine(violation));
  await writeTexts(shooting, { errors, violations });
  return {
    entry: {
      axe: violations.length,
      compare: null,
      console: errors.length,
      files,
      requests: network.count(),
      route,
    },
    problems: [
      ...(unmatched === undefined ? [] : [{ kind: "route" as const, message: unmatched, route }]),
      ...steps,
      ...selector,
      ...consoleProblems(route, errors, files.console),
      ...violations.map((message) => ({ kind: "axe" as const, message, route })),
    ],
  };
}

/** Takes the shot of `route`: writes its files, and says what it found. */
async function shootRoute(run: Run, route: string): Promise<RouteShot> {
  const page = await pageFor(run.browser, run.origin, run.options);
  const shooting: Shooting = {
    files: filesOf(run, route),
    network: recordNetwork(page),
    page,
    route,
    run,
  };
  try {
    const taken = await shot(shooting);
    const { compare, problems } = await compared(shooting);
    return {
      entry: {
        ...taken.entry,
        compare,
        files: { ...taken.entry.files, diff: compare?.diff ?? null },
      },
      problems: [...taken.problems, ...problems],
    };
  } finally {
    await page.context().close();
  }
}

/** A route's shot that failed as a whole, as a load that timed out: no entry, and the line that says so. */
function failedShot(route: string, error: unknown): { readonly problems: readonly ShotProblem[] } {
  const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
  return {
    problems: [
      {
        kind: "route",
        message: `ERROR ${route} could not be pictured (${reason.replace(/\.$/u, "")}), and the routes before it were: run vp run shot ${route} alone, and if it fails again, read its console and network files or raise --wait for a slow page.`,
        route,
      },
    ],
  };
}

type Taken = RouteShot | ReturnType<typeof failedShot>;

/** Each route's shot by `take`, in turn, each once the one before is written; a route that fails as a whole adds its
 * problem and leaves the shots before and after it. */
async function shootInTurn(
  routes: readonly string[],
  take: (route: string) => Promise<RouteShot>,
  done: readonly Taken[] = [],
): Promise<readonly Taken[]> {
  const [route, ...rest] = routes;
  if (route === undefined) {
    return done;
  }
  const taken = await take(route).catch((error: unknown) => failedShot(route, error));
  return shootInTurn(rest, take, [...done, taken]);
}

export { linesText, shootInTurn, shootRoute, shotsFolder };
export type { RouteShot, Run };
