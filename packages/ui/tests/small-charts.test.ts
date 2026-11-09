/* The geometry behind Sparkline and CellBar: where a series' line, area and last point go in a sparkline's box, its
 * trend, and how far a cell's bar runs. The gallery's browser tests render the components themselves. */

import { describe, expect, test } from "vite-plus/test";

import { barSpan } from "#components/cell-bar-span.ts";
import { sparkGeometry, trendOf } from "#components/sparkline-geometry.ts";

const box = { height: 24, inset: 2, width: 96 };

describe("sparkGeometry", () => {
  test("spreads values across the box, the lowest at the bottom and the highest at the top", () => {
    const { line, last } = sparkGeometry([1, 3, 2], box);
    expect(line).toBe("M2 22L48 2L94 12");
    expect(last).toStrictEqual({ x: 94, y: 12 });
  });

  test("breaks the line at a missing value, and has no last point when the last is missing", () => {
    const { line, area, last } = sparkGeometry([1, null, 2, Number.NaN, 3, null], box);
    expect(line.match(/M/gu)).toHaveLength(3);
    expect(area.match(/Z/gu)).toHaveLength(3);
    expect(last).toBeNull();
  });

  test("draws a flat series across the middle, one value at the centre, and nothing without a value", () => {
    expect(sparkGeometry([5, 5, 5], box).line).toBe("M2 12L48 12L94 12");
    expect(sparkGeometry([7], box).last).toStrictEqual({ x: 48, y: 12 });
    expect(sparkGeometry([null, Number.NaN], box)).toStrictEqual({
      area: "",
      last: null,
      line: "",
    });
  });

  test("draws a lone value between gaps as a dot: a line of no length, which the round caps draw", () => {
    expect(sparkGeometry([1, null, 2, null, 3], box).line).toBe("M2 22h0M48 12h0M94 2h0");
  });

  test("closes each run's area down to the box's bottom", () => {
    expect(sparkGeometry([1, 3], box).area).toBe("M2 24L2 22L94 2L94 24Z");
  });
});

describe("trendOf", () => {
  test("compares the first value drawn with the last", () => {
    expect([trendOf([1, 2]), trendOf([null, 3, 2]), trendOf([4, 9, 4]), trendOf([])]).toStrictEqual(
      ["up", "down", "flat", "flat"],
    );
  });
});

describe("barSpan", () => {
  test("runs from the left as the value's share of the column's largest magnitude", () => {
    expect(barSpan(25, 100, false)).toStrictEqual({ width: 25, x: 0 });
    expect(barSpan(-50, 100, false)).toStrictEqual({ width: 50, x: 0 });
    expect(barSpan(250, 100, false)).toStrictEqual({ width: 100, x: 0 });
  });

  test("grows both ways from the middle when signed", () => {
    expect(barSpan(50, 100, true)).toStrictEqual({ width: 25, x: 50 });
    expect(barSpan(-100, 100, true)).toStrictEqual({ width: 50, x: 0 });
  });

  test("draws nothing for a value that is no number or a column whose largest is zero", () => {
    expect(barSpan(Number.NaN, 100, false).width).toBe(0);
    expect(barSpan(5, 0, true).width).toBe(0);
  });
});
