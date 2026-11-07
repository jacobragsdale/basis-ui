/* The preset's plugins write @basis/ui's head script into an app's index.html, so no app keeps a copy of it. */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "vite-plus";
import { describe, expect, test } from "vite-plus/test";

import { headScript } from "#index.ts";
import { basisPlugins } from "#preset/index.ts";

const page = `<!doctype html>
<html lang="en">
  <head>
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`;

/** The index.html Vite builds from `page` with `basisPlugins()`, in a temporary folder it removes afterwards. */
async function builtPage(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "basis-ui-head-script-"));
  try {
    await writeFile(path.join(root, "index.html"), page);
    await writeFile(path.join(root, "main.js"), 'document.title = "App";\n');
    await build({ configFile: false, logLevel: "silent", plugins: basisPlugins(), root });
    return await readFile(path.join(root, "dist", "index.html"), "utf8");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

describe(basisPlugins, () => {
  test("a build's index.html runs headScript as a classic inline script in its head", async () => {
    const html = await builtPage();
    const script = html.indexOf(`<script>${headScript}</script>`);
    expect(script).toBeGreaterThan(html.indexOf("<head>"));
    expect(script).toBeLessThan(html.indexOf("</head>"));
  });
});
