/* The browser's part of `vp run shot`: headless Chromium, the page at the options' size, mode and density, and the
 * three files written from it. */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { chromium, errors as playwrightErrors } from "playwright";
import type { Browser, Page } from "playwright";

import { chromiumInstall, ignored, versionSchema } from "./installed.ts";
import { TaskError } from "./shot-options.ts";
import type { ShotOptions } from "./shot-options.ts";

/** The command that installs the Chromium of the Playwright beside this module, `@basis/ui`'s. */
function installCommand(): string {
  const manifest: unknown = createRequire(import.meta.url)("playwright/package.json");
  return chromiumInstall(versionSchema.parse(manifest).version);
}

/** Headless Chromium, or a failure that says how to install it. */
async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const missing = String(error).includes("Executable doesn't exist");
    throw new TaskError(
      missing
        ? `ERROR Playwright's Chromium is not installed: run ${installCommand()}, then vp run shot again.`
        : `ERROR Chromium did not start (${String(error).split("\n")[0] ?? ""}): run ${installCommand()}, and report the message if it repeats.`,
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

/** How long a page may take to load, and how long after that the task waits at most for its network to go quiet,
 * which a page that polls never does. */
const loadSeconds = 30;
const millisecondsPerSecond = 1000;
const quietMs = 5000;

/** Loads `url`, waiting for its `load` event, or fails with the fix when it never comes. */
async function load(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { timeout: loadSeconds * millisecondsPerSecond, waitUntil: "load" });
  } catch (error) {
    if (error instanceof playwrightErrors.TimeoutError) {
      throw new TaskError(
        `ERROR ${url} did not finish loading within ${String(loadSeconds)} s, so something it loads never arrives: open it in a browser while vp dev runs, find the request that hangs in the network tab, then run vp run shot again.`,
      );
    }
    throw error;
  }
}

/** Opens the route, collecting what the page logs as errors, and waits for it to settle: for its `load` event, then
 * for its network to go quiet or `quietMs` to pass, then `wait` milliseconds more. */
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
  await load(page, url);
  await page.waitForLoadState("networkidle", { timeout: quietMs }).catch(ignored);
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

export { launch, open, pageFor, write };
