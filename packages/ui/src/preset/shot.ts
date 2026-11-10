/* The shot task the preset gives every app, run by Node in the app's root:
 *
 *   vp run shot ROUTE [--dark] [--comfortable] [--width N] [--height N] [--wait MS]
 *
 * It opens ROUTE, such as / or /positions?book=rates, in headless Chromium against the app's `vp dev`, the one already
 * running on the app's own port or one it starts in fixture mode and stops after (dev-server.ts), and writes three
 * files into
 * `.shots/`, named after the route: the page's screenshot (NAME.png), its accessibility tree as Playwright's ARIA
 * snapshot (NAME.aria.yml), and what the page logged as errors (NAME.console.txt, empty when it logged none). It prints
 * their paths. A page that logged errors fails the task, with the files still written, so an agent sees the errors
 * as well as the picture.
 *
 * Every failure is one line that starts with ERROR and ends with the fix. */

import path from "node:path";

import type { Browser } from "playwright";

import { devServer } from "./dev-server.ts";
import { devPort } from "./fixture-mode.ts";
import { TaskError, nameOf, optionsOf } from "./shot-options.ts";
import type { ShotOptions } from "./shot-options.ts";
import { launch, open, pageFor, write } from "./shot-page.ts";

/** The folder the files go in, from the app's root. */
const shotsFolder = ".shots";

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
  const server = await devServer(origin, root);
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
