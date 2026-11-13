/* The browser's part of `vp run shot`: headless Chromium, the page at the options' size, mode and density, and how it
 * opens and settles. */

import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

import { chromium, errors as playwrightErrors } from "playwright";
import type { Browser, Page } from "playwright";

import { defaultPreferences, preferencesCookie, serializePreferences } from "#theme/preferences.ts";

import { chromiumFailure, ignored, versionSchema } from "./installed.ts";
import { TaskError } from "./task-error.ts";
import type { ShotOptions } from "./shot-options.ts";

/** The version of the Playwright beside this module, `@basis/ui`'s. */
function playwrightVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("playwright/package.json");
  return versionSchema.parse(manifest).version;
}

/** The Microsoft Edge every Windows desktop has, headless, for a desktop where Playwright's Chromium could not be
 * downloaded, as one with no route to Playwright's download site; or `null` where it does not start. */
async function installedEdge(task: string): Promise<Browser | null> {
  if (process.platform !== "win32") {
    return null;
  }
  const edge = await chromium.launch({ channel: "msedge", headless: true }).catch(ignored);
  if (edge !== null) {
    process.stderr.write(
      `Playwright's Chromium is not installed, so vp run ${task} uses the installed Microsoft Edge.\n`,
    );
  }
  return edge;
}

/** Headless Chromium, or on Windows, when it is not installed, the installed Edge; or a failure that says how to
 * install it, or the libraries it needs, and run `task`, `shot` unless named, again. */
async function launch(task = "shot"): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const said = String(error);
    const edge = said.includes("Executable doesn't exist") ? await installedEdge(task) : null;
    if (edge !== null) {
      return edge;
    }
    throw new TaskError(chromiumFailure(said, playwrightVersion(), task));
  }
}

/** A page at the options' size and scheme, with the mode, density and theme the app's head script reads from its
 * cookie, as a user's choice in the user menu sets them; the page is never edited. */
async function pageFor(
  browser: Browser,
  origin: string,
  options: Pick<ShotOptions, "density" | "height" | "mode" | "theme" | "width">,
): Promise<Page> {
  const context = await browser.newContext({
    colorScheme: options.mode,
    viewport: { height: options.height, width: options.width },
  });
  // The cookie as the user menu writes it, `dark.compact.full.default.host`, without its attributes.
  const [cookie = ""] = serializePreferences({
    density: options.density,
    mode: options.mode,
    motion: defaultPreferences.motion,
    theme: options.theme,
  }).split(";");
  const value = cookie.slice(cookie.indexOf("=") + 1);
  await context.addCookies([{ name: preferencesCookie, url: origin, value }]);
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

export { launch, open, pageFor };
