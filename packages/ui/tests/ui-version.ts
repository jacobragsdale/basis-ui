/* @basis/ui's own version, as its package.json states it, for the tests that name it: an app's pin, and the version
 * the tasks say they write from. A release changes package.json, and every test follows. */

import { readFileSync } from "node:fs";

import { z } from "zod";

const manifest: unknown = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

/** The version of @basis/ui, and of @basis/parallax, which releases with it. */
const uiVersion = z.object({ version: z.string() }).parse(manifest).version;

export { uiVersion };
