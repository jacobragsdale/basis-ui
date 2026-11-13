import { describe, expect, test } from "vite-plus/test";

import {
  linearScale,
  logDomain,
  logScale,
  niceDomain,
  pixel,
  stepsAcross,
  tickLabels,
  valueTicks,
} from "#chart/scale.ts";

describe("value scales", () => {
  test("round a domain to steps, reaching zero when asked", () => {
    expect(niceDomain(3, 97, { count: 5, zero: false })).toStrictEqual([0, 100]);
    expect(niceDomain(30, 97, { count: 5, zero: true })).toStrictEqual([0, 100]);
    expect(niceDomain(-12, 37, { count: 5, zero: false })).toStrictEqual([-20, 40]);
    expect(niceDomain(5, 5, { count: 5, zero: false })[0]).toBeLessThan(5);
    expect(niceDomain(Number.NaN, 1, { count: 5, zero: false })).toStrictEqual([0, 1]);
  });

  test("map and invert linearly and logarithmically", () => {
    const linear = linearScale([0, 100], [200, 0]);
    expect(pixel(linear, 25)).toBe(150);
    expect(linear.invert(150)).toBe(25);
    const log = logScale(logDomain(3, 4000), [0, 400]);
    expect(log.domain).toStrictEqual([1, 10_000]);
    expect(pixel(log, 100)).toBe(200);
    expect(pixel(log, 0)).toBe(0);
  });

  test("label ticks in full under 10,000 and compactly above, one style per axis", () => {
    expect(tickLabels([0, 2500, 5000, 7500], 2500)).toStrictEqual(["0", "2,500", "5,000", "7,500"]);
    expect(tickLabels([0, 10_000, 20_000], 10_000)).toStrictEqual(["0", "10K", "20K"]);
    expect(tickLabels([0, 2_500_000, 5_000_000], 2_500_000)).toStrictEqual(["0", "2.5M", "5.0M"]);
    expect(tickLabels([0, 0.25, 0.5], 0.25)).toStrictEqual(["0", "0.25", "0.50"]);
  });

  test("place round ticks across the domain, powers of ten on a log scale", () => {
    const linear = valueTicks(linearScale([0, 100], [0, 1]), 5).map((tick) => tick.value);
    expect(linear).toStrictEqual([0, 20, 40, 60, 80, 100]);
    const log = valueTicks(logScale([1, 1000], [0, 1]), 5).map((tick) => tick.label);
    expect(log).toStrictEqual(["1", "10", "100", "1,000"]);
    // One style per axis: once a log axis reaches 10,000, its thousands are compact too.
    const wide = valueTicks(logScale([0.1, 100_000], [0, 1]), 5).map((tick) => tick.label);
    expect(wide).toStrictEqual(["0.1", "1", "10", "100", "1K", "10K", "100K"]);
  });

  test("take values no step can tell apart as one value, and walk a range in whole steps, bounded", () => {
    const one = niceDomain(1, 1, { count: 5, zero: false });
    expect(
      niceDomain(0.9999999999999999, 1.0000000000000002, { count: 5, zero: false }),
    ).toStrictEqual(one);
    expect(valueTicks(linearScale(one, [0, 1]), 5).map((tick) => tick.label)).toStrictEqual([
      "0.5",
      "1.0",
      "1.5",
    ]);
    // A step too fine for the range gives no ticks rather than millions, and a range of one value gives that value.
    expect(stepsAcross([0, 1], 1e-9)).toStrictEqual([]);
    expect(stepsAcross([1, 1.0000000000000002], 1e-16)).toStrictEqual([1]);
    expect(stepsAcross([0, 1], Number.NaN)).toStrictEqual([]);
    // A domain past the largest double keeps its values' ends, and a log domain stays within the powers it holds.
    expect(niceDomain(1e308, 1.7e308, { count: 5, zero: false })[1]).toBe(1.7e308);
    expect(logDomain(1.7e308, 1.7e308)).toStrictEqual([1e307, 1e308]);
    expect(pixel(linearScale([-1.7e308, 1.7e308], [0, 100]), 0)).toBeCloseTo(50);
  });

  test("label a range past a thousand trillion, or finer than twelve decimals, in scientific notation", () => {
    expect(tickLabels([0, 2e15, 4e15], 2e15)).toStrictEqual(["0", "2E15", "4E15"]);
    expect(tickLabels([1e-20, 2e-20], 1e-20)).toStrictEqual(["1E-20", "2E-20"]);
  });
});
