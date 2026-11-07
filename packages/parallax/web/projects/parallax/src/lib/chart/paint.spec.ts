import { describe, expect, it } from "vitest";

import { fitText, inkOn, luminance, wrapText } from "./paint";

describe("inkOn", () => {
  it("reads a colour's luminance from hex, rgb() and color(srgb), and nothing else", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("rgb(0, 0, 0)")).toBe(0);
    expect(luminance("color(srgb 1 1 1)")).toBeCloseTo(1);
    expect(luminance("oklch(0.6 0.2 260)")).toBeNull();
  });

  it("writes white on dark and saturated colours, and near-black on light ones", () => {
    expect(inkOn("#2a78d6")).toBe("#ffffff");
    expect(inkOn("rgb(237, 161, 0)")).toBe("#111827");
    expect(inkOn("#ffffff")).toBe("#111827");
    expect(inkOn("unreadable")).toBe("#ffffff");
  });
});

describe("wrapText and fitText", () => {
  // Every character 6 px wide.
  const measure = (t: string): number => t.length * 6;

  it("wraps words into lines that fit, keeping a long word whole on its own line", () => {
    expect(wrapText("A pie can't show negative values", 60, measure)).toEqual(["A pie", "can't show", "negative", "values"]);
    expect(wrapText("Unbreakable", 30, measure)).toEqual(["Unbreakable"]);
  });

  it("cuts text at its end with an ellipsis, and leaves text that fits", () => {
    expect(fitText("Emerging Markets", 60, measure)).toBe("Emerging…");
    expect(fitText("Rates", 60, measure)).toBe("Rates");
  });
});
