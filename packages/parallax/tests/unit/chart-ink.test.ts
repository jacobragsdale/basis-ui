import { describe, expect, test } from "vite-plus/test";

import { inkOn, luminance } from "#chart/ink.ts";

describe(luminance, () => {
  test("reads a colour's luminance from hex, rgb() and color(srgb), and nothing else", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("rgb(0, 0, 0)")).toBe(0);
    expect(luminance("color(srgb 1 1 1)")).toBeCloseTo(1);
    expect(luminance("oklch(0.6 0.2 260)")).toBeNull();
  });
});

describe(inkOn, () => {
  test("writes white on dark and saturated colours, and near-black on light ones", () => {
    expect(
      ["#2a78d6", "rgb(237, 161, 0)", "#ffffff", "unreadable"].map((color) => inkOn(color)),
    ).toStrictEqual(["#ffffff", "#111827", "#111827", "#ffffff"]);
  });
});
