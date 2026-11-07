import { expect, test } from "vite-plus/test";

import { packageName } from "../src/index.ts";

test("the entry point loads", () => {
  expect(packageName).toBe("@basis/ui");
});
