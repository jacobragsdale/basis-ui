import { describe, expect, test } from "vite-plus/test";

import { inkOn, luminance } from "#chart/ink.ts";

describe(luminance, () => {
  test("reads a colour's luminance from hex, rgb(), color(srgb), oklch() and oklab(), and nothing else", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("rgb(0, 0, 0)")).toBe(0);
    expect(luminance("color(srgb 1 1 1)")).toBeCloseTo(1);
    expect(luminance("oklch(1 0 0)")).toBeCloseTo(1);
    expect(luminance("oklch(50% 0 none)")).toBeCloseTo(luminance("rgb(99, 99, 99)") ?? 0, 2);
    // #2a78d6, as the theme writes it in OKLCH and OKLab.
    expect(luminance("oklch(0.5762 0.1631 256.5)")).toBeCloseTo(luminance("#2a78d6") ?? 0, 2);
    expect(luminance("oklab(0.5762 -0.0381 -0.1586)")).toBeCloseTo(luminance("#2a78d6") ?? 0, 2);
    expect(luminance("hsl(0 0% 0%)")).toBeNull();
  });
});

describe(inkOn, () => {
  test("writes white on dark and saturated colours, and near-black on light ones", () => {
    expect(
      ["#2a78d6", "rgb(237, 161, 0)", "#ffffff", "unreadable"].map((color) => inkOn(color)),
    ).toStrictEqual(["#ffffff", "#111827", "#111827", "#ffffff"]);
    // The theme's ramp, from its lightest step to its darkest.
    expect(
      ["oklch(0.93 0.0361 245)", "oklch(0.37 0.0931 245)"].map((color) => inkOn(color)),
    ).toStrictEqual(["#111827", "#ffffff"]);
  });
});
