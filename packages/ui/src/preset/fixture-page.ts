/* The page in fixture mode, in `vp dev` (fixture-mode.ts) and in a build in fixture mode (fixture-build.ts): its own
 * module scripts replaced by one that starts MSW's worker with the fixtures, then imports them. */

import { existsSync } from "node:fs";
import path from "node:path";

import { generatedFolder } from "./orval-options.ts";

/** The module the page imports the fixtures from, which the plugin makes from the files. */
const fixturesModule = "virtual:basis/fixtures";
const resolvedFixturesModule = `\0${fixturesModule}`;

/** orval's MSW handlers in an app, from its root. */
const generatedHandlersFile = `${generatedFolder}/client.msw.ts`;

/** A module script of the app's own that a page loads, such as `<script type="module" src="/src/main.tsx">`. */
const scriptTag = /<script\b(?<attributes>[^>]*)>\s*<\/script>/giu;
const sourceAttribute = /\bsrc=["'](?<source>(?:\/(?!\/)|\.\/)[^"']+)["']/iu;
const moduleType = /\btype=["']module["']/iu;

/** The page, its own module scripts replaced by one that starts fixture mode and then imports them, in order. */
function withFixtureMode(html: string, root: string, base = "/"): string | undefined {
  const entries: string[] = [];
  const rest = html.replaceAll(scriptTag, (tag: string, attributes: string) => {
    const source = sourceAttribute.exec(attributes)?.groups?.["source"];
    if (source === undefined || !moduleType.test(attributes)) {
      return tag;
    }
    entries.push(source);
    return entries.length === 1 ? "<!-- basis:fixture-mode -->" : "";
  });
  if (entries.length === 0) {
    return undefined;
  }
  const generated = existsSync(path.join(root, generatedHandlersFile))
    ? `import * as generated from "/${generatedHandlersFile}";`
    : "const generated = {};";
  const script = [
    '<script type="module">',
    'import { startFixtureMode } from "@basis/ui/fixtures";',
    `import fixtures from "${fixturesModule}";`,
    generated,
    base === "/"
      ? "await startFixtureMode({ ...fixtures, generated });"
      : `await startFixtureMode({ ...fixtures, generated, base: ${JSON.stringify(base)} });`,
    ...entries.map((entry) => `await import(${JSON.stringify(entry)});`),
    "</script>",
  ].join("\n");
  return rest.replace("<!-- basis:fixture-mode -->", () => script);
}

export { fixturesModule, generatedHandlersFile, resolvedFixturesModule, withFixtureMode };
