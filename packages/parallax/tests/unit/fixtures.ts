/* The layouts parallax-protocol's Rust tests write, from the Rust types, which the schema must read back unchanged. */

import { readFileSync } from "node:fs";

function readLayouts(): readonly unknown[] {
  const text = readFileSync(new URL("../fixtures/layouts.json", import.meta.url), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new TypeError("tests/fixtures/layouts.json must hold a list of layouts.");
  }
  return parsed;
}

const layouts: readonly unknown[] = readLayouts();

export { layouts };
