import { describe, expect, test } from "vite-plus/test";

import { fitText, wrapText } from "#chart/text.ts";

// Every character 6 px wide.
function measure(text: string): number {
  return text.length * 6;
}

describe("fitting text to room", () => {
  test("wraps words into lines that fit, keeping a long word whole on its own line", () => {
    expect(wrapText("A pie can't show negative values", 60, measure)).toStrictEqual([
      "A pie",
      "can't show",
      "negative",
      "values",
    ]);
    expect(wrapText("Unbreakable", 30, measure)).toStrictEqual(["Unbreakable"]);
  });

  test("cuts text at its end with an ellipsis, and leaves text that fits", () => {
    expect(fitText("Emerging Markets", 60, measure)).toBe("Emerging…");
    expect(fitText("Rates", 60, measure)).toBe("Rates");
    expect(fitText("Rates", 3, measure)).toBe("");
  });
});
