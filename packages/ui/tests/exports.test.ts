/* What @basis/ui's root exports, and what it must not: an app gets components, never the helpers that draw them, so
 * no app can style a plain element as a component past `shadcn/no-restyle`. */

import { expect, test } from "vite-plus/test";

test("the root exports no variant helper and no cva", async () => {
  const exports: Record<string, unknown> = await import("#index.ts");
  const helpers = Object.keys(exports).filter(
    (name) => name.endsWith("Variants") || name === "cva",
  );
  expect(helpers).toStrictEqual([]);
});
