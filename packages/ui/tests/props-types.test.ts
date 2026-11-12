/* Every component @basis/ui exports has its props type exported beside it, named for it, as `ButtonProps`, so an app
 * that wraps or passes a component's props names them rather than writing `ComponentProps<typeof Button>`. */

import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { exportedNames, publicModules } from "#catalogue/exports.ts";

/** The catalogue as written, whose components the test checks. */
const componentSchema = z.object({ module: z.string(), name: z.string() });
const catalogueSchema = z.object({ components: z.array(componentSchema) });
const written: unknown = JSON.parse(
  readFileSync(new URL("../catalogue.json", import.meta.url), "utf8"),
);
const catalogue = catalogueSchema.parse(written);

test("every component @basis/ui exports has its props type exported, named for it", () => {
  const [root] = publicModules;
  if (root === undefined) {
    throw new Error("The catalogue lists no public module.");
  }
  const types = new Set(
    exportedNames(root)
      .filter((exported) => exported.isType)
      .map((exported) => exported.name),
  );
  const components = catalogue.components
    .filter((component) => component.module === "@basis/ui")
    .map((component) => component.name);
  expect(components.filter((name) => !types.has(`${name}Props`))).toStrictEqual([]);
});
