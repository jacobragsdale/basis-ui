/* The layouts parallax-protocol's Rust tests write, from the Rust types, which the schema must read back unchanged:
 * those every reader reads, and those that set the fields roadmap step 2.8 adds, which the Angular layer does not. */

import { readFileSync } from "node:fs";

function readLayouts(file: string): readonly unknown[] {
  const text = readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`tests/fixtures/${file} must hold a list of layouts.`);
  }
  return parsed;
}

const layouts: readonly unknown[] = [
  ...readLayouts("layouts.json"),
  ...readLayouts("layouts-2.8.json"),
];

export { layouts };
