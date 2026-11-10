import { describe, expect, test } from "vite-plus/test";

import { deviceSize, hairline, snap, snapRect, snapSpan } from "#canvas/device-pixels.ts";

/** Each value of `values` in device pixels at `ratio`. */
function device(values: readonly number[], ratio: number): readonly number[] {
  return values.map((value) => Math.round(value * ratio * 1e9) / 1e9);
}

describe(deviceSize, () => {
  test("fills an area with the whole device pixels inside it, and a CSS size of just those", () => {
    // 531 CSS pixels are 663.75 device pixels at 125 %: a backing store of 664 would be resampled into them.
    const size = deviceSize(601, 531, 1.25);
    expect([size.width, size.height]).toStrictEqual([751, 663]);
    expect(device([size.cssWidth, size.cssHeight], 1.25)).toStrictEqual([751, 663]);
  });

  test("keeps a size that is whole already, despite floating point", () => {
    // 300 × 1.15 is 344.99999999999994.
    expect(deviceSize(300, 384, 1.15).width).toBe(345);
    expect(deviceSize(384, 384, 1.25).height).toBe(480);
    expect(deviceSize(0, 0.2, 1).width).toBe(1);
  });
});

describe(snapSpan, () => {
  test("rounds a wide span's two edges to device pixels, so that neighbours tile", () => {
    const [first, second] = [
      snapSpan([30, 24], { ratio: 1.25 }),
      snapSpan([54, 24], { ratio: 1.25 }),
    ];
    expect(device(first, 1.25)).toStrictEqual([38, 30]);
    expect(device(second, 1.25)).toStrictEqual([68, 30]);
  });

  test("draws a rule a whole number of device pixels thick, against its span's end", () => {
    // A header 30 px tall at 125 % ends at 37.5 device pixels, which rounds to 38: its rule is the row above.
    expect(device(snapSpan([29, 1], { ratio: 1.25 }), 1.25)).toStrictEqual([37, 1]);
    expect(device(snapSpan([29, 1], { ratio: 1.5 }), 1.5)).toStrictEqual([44, 1]);
    expect(device(snapSpan([29, 1], { ratio: 2 }), 2)).toStrictEqual([58, 2]);
    expect(snapSpan([29, 1], { ratio: 1 })).toStrictEqual([29, 1]);
  });

  test("puts a rule against its span's start when asked", () => {
    expect(device(snapSpan([29, 1], { anchor: "start", ratio: 1.25 }), 1.25)).toStrictEqual([
      36, 1,
    ]);
  });

  test("takes a negative size as the span before its start", () => {
    expect(snapSpan([10, -4], { ratio: 1 })).toStrictEqual([6, 4]);
  });
});

describe(snapRect, () => {
  test("places a rectangle's sides as spans: a cell's bottom border is a rule, its width a span", () => {
    const rect = snapRect([13, 53, 80, 1], { ratio: 1.25 });
    expect(device(rect, 1.25)).toStrictEqual([16, 67, 100, 1]);
  });
});

describe(hairline, () => {
  test("strokes a one-pixel line over whole device pixels, as round(at) + 0.5 does at a ratio of 1", () => {
    expect(hairline(10.6, 1)).toStrictEqual({ at: 11.5, width: 1 });
    const { at, width } = hairline(10.6, 1.25);
    // 10.6 CSS pixels are 13.25 device pixels: the line covers device pixel 13.
    expect(device([at - width / 2, at + width / 2], 1.25)).toStrictEqual([13, 14]);
    expect(device([hairline(10, 2).width], 2)).toStrictEqual([2]);
  });
});

describe(snap, () => {
  test("moves a value to the nearest device pixel", () => {
    expect(device([snap(12.5, 1.25)], 1.25)).toStrictEqual([16]);
    expect(snap(12.5, 1)).toBe(13);
  });
});
