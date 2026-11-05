import { describe, expect, it } from "vitest";

import { fitText, scaledFont, wrapText } from "./paint";

describe("scaledFont", () => {
  it("scales the theme's size in pixels and sets a weight, and leaves a font without one alone", () => {
    expect(scaledFont("13px system-ui, sans-serif", 1.25, "600")).toBe("600 16px system-ui, sans-serif");
    expect(scaledFont("12.5px Arial", 2, "bold")).toBe("bold 25px Arial");
    expect(scaledFont("caption", 2, "600")).toBe("caption");
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
