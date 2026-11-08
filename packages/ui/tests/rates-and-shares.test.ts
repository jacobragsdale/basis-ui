import { describe, expect, test } from "vite-plus/test";

import { delta, percentChange, roundToTick, shares, sumPrecise } from "#numbers/index.ts";

/** Shares in hundredths of a unit at `scale`, as integers, so a test reads them without a double's tail. */
function weights(values: readonly number[], scale: number): readonly number[] | string {
  const result = shares(values, { scale });
  return result.defined ? result.value : result.reason;
}

function total(values: readonly number[], scale: number): number | string {
  const result = shares(values, { scale });
  return result.defined ? sumPrecise(result.value) : result.reason;
}

describe("roundToTick", () => {
  test.each([
    [4.1337, 0.005, 4.135],
    [4.1325, 0.005, 4.135],
    [-4.1325, 0.005, -4.135],
    [99.51, 0.015625, 99.515625],
    [12.3, 0.25, 12.25],
    [7, 2, 8],
  ])("%d to a tick of %d is %d, read at the shortest digits", (value, tick, result) => {
    expect(roundToTick(value, tick)).toBe(result);
  });

  test("rounds to a tick by the rounding it is given", () => {
    expect(roundToTick(4.1325, 0.005, "half-even")).toBe(4.13);
    expect(roundToTick(4.1349, 0.005, "floor")).toBe(4.13);
  });

  test("refuses a tick that is not positive, and values that are not finite", () => {
    expect(() => roundToTick(1, 0)).toThrow(
      "roundToTick(1, 0) needs a finite value and a positive tick.",
    );
    expect(() => roundToTick(1, -0.5)).toThrow(RangeError);
    expect(() => roundToTick(Number.NaN, 0.5)).toThrow(RangeError);
  });
});

describe("changes", () => {
  test("delta is to minus from", () => {
    expect(delta(101.25, 100.5)).toBe(-0.75);
  });

  test("percent change is a fraction of the base's size", () => {
    expect(percentChange(100, 105)).toStrictEqual({ defined: true, value: 0.05 });
    expect(percentChange(-100, -50)).toStrictEqual({ defined: true, value: 0.5 });
  });

  test("a change from zero has no percentage, by name", () => {
    expect(percentChange(0, 5)).toStrictEqual({ defined: false, reason: "zero-base" });
    expect(percentChange(-0, 0)).toStrictEqual({ defined: false, reason: "zero-base" });
  });
});

describe("shares", () => {
  test("sum to exactly 1 at their scale, the leftover units going to the largest remainders", () => {
    expect(weights([1, 1, 1], 2)).toStrictEqual([0.34, 0.33, 0.33]);
    expect(weights([2, 1, 1], 1)).toStrictEqual([0.5, 0.3, 0.2]);
    expect(weights([10, 20, 30, 40], 2)).toStrictEqual([0.1, 0.2, 0.3, 0.4]);
    expect(weights([1.5, 2.25, 0.003], 4)).toStrictEqual([0.3997, 0.5995, 0.0008]);
  });

  test("read each double at its shortest digits", () => {
    expect(weights([0.1, 0.2], 1)).toStrictEqual([0.3, 0.7]);
  });

  test("break ties in the remainders by order", () => {
    expect(weights([1, 1, 1, 1, 1, 1], 1)).toStrictEqual([0.2, 0.2, 0.2, 0.2, 0.1, 0.1]);
  });

  test("of a long and short book take signs, and still sum to 1", () => {
    expect(weights([150, -50], 2)).toStrictEqual([1.5, -0.5]);
    expect(weights([-1, -1, -1], 2)).toStrictEqual([0.34, 0.33, 0.33]);
    expect(total([7, -3, 11, 0.5], 3)).toBe(1);
  });

  test.each([
    [[1, 2, 3, 4, 5, 6, 7], 2],
    [[0.1, 0.2, 0.3], 0],
    [[123.456, 789.01, 1, 1, 1], 5],
  ])("of %j at scale %i sum to 1", (values, scale) => {
    expect(total(values, scale)).toBe(1);
  });

  test("of a zero total, or of nothing, are undefined by name", () => {
    expect(weights([5, -5], 2)).toBe("zero-total");
    expect(weights([], 2)).toBe("zero-total");
  });
});
