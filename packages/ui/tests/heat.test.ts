/* The heat cell's step for a value, and the contrast its ink is measured by. */

import { describe, expect, test } from "vite-plus/test";

import { contrast, heatToken, luminance, outward } from "#components/heat.ts";

describe(heatToken, () => {
  const sequential = { max: 100, min: 0, scale: "sequential" } as const;

  test.each([
    [0, "seq-1"],
    [5, "seq-1"],
    [50, "seq-5"],
    [100, "seq-9"],
    [150, "seq-9"],
    [-20, "seq-1"],
  ] as const)("puts %s on %s of the sequential scale from 0 to 100", (value, token) => {
    expect(heatToken(value, sequential)).toBe(token);
  });

  const diverging = { max: 0.05, min: -0.02, scale: "diverging" } as const;

  test.each([
    [0, "div-6"],
    [0.05, "div-11"],
    [-0.05, "div-1"],
    [0.01, "div-7"],
    [-0.01, "div-5"],
  ] as const)(
    "puts %s on %s of the diverging scale, as far either way as the larger end",
    (value, token) => {
      expect(heatToken(value, diverging)).toBe(token);
    },
  );

  test("puts every value at the top of a domain with no width", () => {
    expect(heatToken(3, { max: 3, min: 3, scale: "sequential" })).toBe("seq-9");
    expect(heatToken(0, { max: 0, min: 0, scale: "diverging" })).toBe("div-6");
  });
});

describe(outward, () => {
  test("is the next step toward the end of the scale, and none past an end or at the midpoint", () => {
    expect(outward("seq-6")).toBe("seq-7");
    expect(outward("seq-9")).toBeUndefined();
    expect(outward("div-3")).toBe("div-2");
    expect(outward("div-9")).toBe("div-10");
    expect(outward("div-1")).toBeUndefined();
    expect(outward("div-11")).toBeUndefined();
    expect(outward("div-6")).toBeUndefined();
  });
});

describe(contrast, () => {
  test("is WCAG's: 21 between black and white, 1 between a colour and itself", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([118, 118, 118], [118, 118, 118])).toBe(1);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
  });
});
