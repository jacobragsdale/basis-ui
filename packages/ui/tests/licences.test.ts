/* The licences of the packages `@basis/ui`'s build bundles into dist/: the build refuses any package its
 * `deps.onlyBundle` does not name, and each it names ships its licence in licenses/NAME/LICENSE, as the installed
 * package holds it. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const config = readFileSync(path.join(packageRoot, "vite.config.ts"), "utf8");
const listed = /onlyBundle: \[(?<names>[^\]]*)\]/u.exec(config)?.groups?.["names"] ?? "";
const bundled = [...listed.matchAll(/"(?<name>[^"]+)"/gu)].map(
  (match) => match.groups?.["name"] ?? "",
);

test("the build names the packages it may bundle", () => {
  expect(bundled).toStrictEqual(["culori"]);
});

test.each(bundled)("the package ships %s's licence beside the code it bundles from it", (name) => {
  const installed = path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));
  expect(readFileSync(path.join(packageRoot, "licenses", name, "LICENSE"), "utf8")).toBe(
    readFileSync(path.join(installed, "LICENSE"), "utf8"),
  );
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
  expect(manifest).toMatchObject({ files: expect.arrayContaining(["licenses"]) as unknown });
});
