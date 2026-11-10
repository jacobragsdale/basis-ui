import { describe, expect, test } from "vite-plus/test";

import { contrastRatio, linearColour, luminance } from "./contrast.ts";

/** What the browser computes for a colour. */
function computed(colour: string): string {
  const probe = document.createElement("div");
  probe.style.color = colour;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

describe(luminance, () => {
  test("is WCAG's weighted sum of the linear channels", () => {
    expect(luminance("color(srgb-linear 1 1 1)")).toBeCloseTo(1, 10);
    expect(luminance("color(srgb-linear 0 0 0)")).toBe(0);
    expect(luminance("color(srgb-linear 1 0 0)")).toBeCloseTo(0.2126, 10);
  });

  test("reads what the browser computes for a token in linear sRGB", () => {
    document.documentElement.style.setProperty("--probe", "#777777");
    try {
      // #777777 is 0.184 in luminance.
      const grey = computed(linearColour("probe"));
      expect(luminance(grey)).toBeCloseTo(0.184, 3);
    } finally {
      document.documentElement.style.removeProperty("--probe");
    }
  });

  test("is undefined for anything else", () => {
    expect(luminance("rgb(0, 0, 0)")).toBeUndefined();
    expect(luminance("")).toBeUndefined();
  });
});

describe(contrastRatio, () => {
  test("is 21 for black on white, either way round, and 1 for a colour on itself", () => {
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 10);
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 10);
    expect(contrastRatio(0.4, 0.4)).toBe(1);
  });

  test("is undefined when either luminance is unknown", () => {
    expect(contrastRatio(undefined, 1)).toBeUndefined();
  });
});
