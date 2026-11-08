/* The shot task the preset gives every app, run by Node in the app's root:
 *
 *   vp run shot ROUTE [--dark] [--comfortable] [--width N] [--height N] [--wait MS]
 *
 * It opens ROUTE, such as / or /positions?book=rates, in headless Chromium against the app's `vp dev`, the one already
 * running on the app's own port or one it starts in fixture mode and stops after, and writes three files into
 * `.shots/`, named after the route: the page's screenshot (NAME.png), its accessibility tree as Playwright's ARIA
 * snapshot (NAME.aria.yml), and what the page logged as errors (NAME.console.txt, empty when it logged none). It prints
 * their paths. A page that logged errors fails the task, with the files still written, so an agent sees the errors
 * as well as the picture.
 *
 * Every failure is one line that starts with ERROR and ends with the fix. */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

import { devPort } from "./fixture-mode.ts";
import { TaskError, nameOf, optionsOf } from "./shot-options.ts";
import type { ShotOptions } from "./shot-options.ts";

/** The folder the files go in, from the app's root. */
const shotsFolder = ".shots";
/** How long a `vp dev` this task starts may take to answer, how often it is asked, and how long one answer may take. */
const startSeconds = 60;
const millisecondsPerSecond = 1000;
const startMs = startSeconds * millisecondsPerSecond;
const pollMs = 250;
const answerMs = millisecondsPerSecond;
/** Whether something answers at `url` within a second. */
async function answers(url: string): Promise<boolean> {
  try {
    // oxlint-disable-next-line eslint/no-restricted-globals -- this asks the app's own dev server, in Node, outside any app's client.
    const response = await fetch(url, { signal: AbortSignal.timeout(answerMs) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Stops a `vp dev` this task started, and everything it started. */
function stopper(child: ChildProcess): () => void {
  return () => {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // It ended already.
      }
    }
  };
}

/** Whether `origin` answers before `child` ends or `startMs` passes, asking every `pollMs`. */
async function cameUp(origin: string, child: ChildProcess, waited = 0): Promise<boolean> {
  if (child.exitCode !== null || waited >= startMs) {
    return false;
  }
  if (await answers(origin)) {
    return true;
  }
  await sleep(pollMs);
  return cameUp(origin, child, waited + pollMs);
}

/** The app's `vp dev` at `origin`: the one running, or a new one in fixture mode, which `stop` ends. */
async function devServer(origin: string): Promise<{ readonly stop: () => void }> {
  if (await answers(origin)) {
    return { stop: (): void => undefined };
  }
  const child = spawn("vp", ["dev", "--strictPort"], {
    detached: true,
    env: { ...process.env, BASIS_API_URL: "" },
    stdio: "ignore",
  });
  const stop = stopper(child);
  if (await cameUp(origin, child)) {
    return { stop };
  }
  stop();
  throw new TaskError(
    `ERROR vp dev did not answer at ${origin} within ${String(startSeconds)} s: run vp dev in this app to see why, then run vp run shot again while it runs.`,
  );
}

/** Headless Chromium, or a failure that says how to install it. */
async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const missing = String(error).includes("Executable doesn't exist");
    throw new TaskError(
      missing
        ? "ERROR Playwright's Chromium is not installed: run vp exec playwright install chromium, then vp run shot again."
        : `ERROR Chromium did not start (${String(error).split("\n")[0] ?? ""}): run vp exec playwright install chromium, and report the message if it repeats.`,
    );
  }
}

/** A page at the options' size and scheme, with the mode and density the app's head script reads from its cookie. */
async function pageFor(browser: Browser, origin: string, options: ShotOptions): Promise<Page> {
  const context = await browser.newContext({
    colorScheme: options.dark ? "dark" : "light",
    viewport: { height: options.height, width: options.width },
  });
  const preference = `${options.dark ? "dark" : "light"}.${options.density}`;
  await context.addCookies([{ name: "basis-ui-preferences", url: origin, value: preference }]);
  return context.newPage();
}

/** Opens the route, collecting what the page logs as errors, and waits for it to settle. */
async function open(page: Page, url: string, wait: number): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`uncaught: ${error.stack ?? error.message}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await sleep(wait);
  return errors;
}

/** Writes the page's picture, its accessibility tree and its errors beside each other, returning their paths. */
async function write(
  page: Page,
  base: string,
  errors: readonly string[],
): Promise<readonly string[]> {
  await mkdir(path.dirname(base), { recursive: true });
  await page.screenshot({ fullPage: true, path: `${base}.png` });
  await writeFile(`${base}.aria.yml`, `${await page.locator("body").ariaSnapshot()}\n`);
  await writeFile(`${base}.console.txt`, errors.map((line) => `${line}\n`).join(""));
  return [".png", ".aria.yml", ".console.txt"].map((end) => base + end);
}

/** Pictures the route on `browser`, writing its three files, and returns their paths from `root` and the page's
 * errors. */
async function picture(
  browser: Browser,
  { root, origin }: { readonly root: string; readonly origin: string },
  options: ShotOptions,
): Promise<{ readonly files: readonly string[]; readonly errors: readonly string[] }> {
  const page = await pageFor(browser, origin, options);
  const errors = await open(page, `${origin}${options.route}`, options.wait);
  const suffix =
    (options.dark ? "-dark" : "") + (options.density === "comfortable" ? "-comfortable" : "");
  const written = await write(
    page,
    path.join(root, shotsFolder, nameOf(options.route) + suffix),
    errors,
  );
  return { errors, files: written.map((file) => path.relative(root, file)) };
}

/** Takes the shot, writes its three files, and says where they are; a page that logged errors fails it. */
async function shoot(root: string, options: ShotOptions): Promise<string> {
  const origin = `http://localhost:${String(devPort(root))}`;
  const server = await devServer(origin);
  const browser = await launch();
  try {
    const { files, errors } = await picture(browser, { origin, root }, options);
    if (errors.length > 0) {
      throw new TaskError(
        `${files.join("\n")}\nERROR ${options.route} logged ${String(errors.length)} errors, listed in ${files[2] ?? ""}: fix them, or read them there before trusting the picture.`,
      );
    }
    return files.join("\n");
  } finally {
    await browser.close();
    server.stop();
  }
}

async function main(): Promise<void> {
  try {
    const done = await shoot(process.cwd(), optionsOf(process.argv.slice(2)));
    process.stdout.write(`${done}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof TaskError ? error.message : `ERROR the shot task failed: ${String(error)}; run it again, and report the message if it repeats.`}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
