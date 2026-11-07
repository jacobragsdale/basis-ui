import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { sumPrecise } from "#numbers/index.ts";
import { exactSum } from "#vendor/sum-precise/exact-sum.ts";

/** Adding in turn, which rounds at every step. */
function naive(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

function* tenthsToThreeTenths(): Generator<number> {
  yield 0.1;
  yield 0.2;
  yield 0.3;
}

describe("where adding in turn fails", () => {
  // From CPython's test_fsum, the TC39 proposal's tests, and the classic cases.
  test.each([
    [[0.1, 0.2, 0.3], 0.6],
    [Array.from({ length: 10 }, () => 0.1), 1],
    [[1e100, 1, -1e100], 1],
    [[1e100, 1, -1e100, 1e-100, 1e50, -1, -1e50], 1e-100],
    [[2 ** 53, -0.5, -(2 ** -54)], 2 ** 53 - 1],
    [[2 ** 53, 1, 2 ** -100], 2 ** 53 + 2],
    [[2 ** 53 - 4, 0.5, 2 ** -54], 2 ** 53 - 3],
    [[1e16, 1, 1e-16], 10_000_000_000_000_002],
    [[1e308, 1e308, 0.1, 0.1, 1e30, 0.1, -1e30, -1e308, -1e308], 0.30000000000000004],
    [[Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE], Number.MAX_VALUE],
  ])("%j sums to %s", (values, total) => {
    expect(exactSum(values)).toBe(total);
    expect(naive(values)).not.toBe(total);
  });
});

describe("the edges Math.sumPrecise defines", () => {
  test.each([
    [[], -0],
    [[-0, -0], -0],
    [[-0, 0], 0],
    // Adding in turn gets this one right only because its tie rounds to even.
    [[2 ** 53 + 10, 1, 2 ** -100], 2 ** 53 + 12],
    [[1, -1], 0],
    [[Number.MAX_VALUE, Number.MAX_VALUE], Number.POSITIVE_INFINITY],
    [[-Number.MAX_VALUE, -Number.MAX_VALUE], Number.NEGATIVE_INFINITY],
    [[1, Number.POSITIVE_INFINITY, -1e308], Number.POSITIVE_INFINITY],
    [[Number.NEGATIVE_INFINITY], Number.NEGATIVE_INFINITY],
    [[Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY], Number.NaN],
    [[1, Number.NaN, 2], Number.NaN],
    [[Number.POSITIVE_INFINITY, Number.NaN], Number.NaN],
  ])("%j sums to %s", (values, total) => {
    expect(exactSum(values)).toBe(total);
  });

  test("reads any iterable once", () => {
    expect(exactSum(tenthsToThreeTenths())).toBe(0.6);
    expect(exactSum(new Set([1e100, 1, -1e100]))).toBe(1);
  });
});

describe("the native Math.sumPrecise", () => {
  afterEach(() => {
    Reflect.deleteProperty(Math, "sumPrecise");
  });

  test("is missing from this Node, so the fallback runs", () => {
    expect("sumPrecise" in Math).toBe(false);
    expect(sumPrecise([0.1, 0.2, 0.3])).toBe(0.6);
  });

  test("is called where the browser has it", () => {
    const native = vi.fn((values: Iterable<number>) => exactSum(values));
    Object.defineProperty(Math, "sumPrecise", { configurable: true, value: native });
    expect(sumPrecise([1e100, 1, -1e100])).toBe(1);
    expect(native).toHaveBeenCalledWith([1e100, 1, -1e100]);
  });
});
