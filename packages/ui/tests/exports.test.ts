/* What @basis/ui's root exports, and what it must not: an app gets components, never the helpers that draw them, so
 * no app can style a plain element as a component past `shadcn/no-restyle`. */

import { expect, test, vi } from "vite-plus/test";

/* It imports the whole library's source, which a busy CI runner can make take many seconds: a minute holds there,
 * where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

test("the root exports no variant helper and no cva", async () => {
  const exports: Record<string, unknown> = await import("#index.ts");
  const helpers = Object.keys(exports).filter(
    (name) => name.endsWith("Variants") || name === "cva",
  );
  expect(helpers).toStrictEqual([]);
});
