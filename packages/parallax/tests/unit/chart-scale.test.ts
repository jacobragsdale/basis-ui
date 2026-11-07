import { describe, expect, test } from "vite-plus/test";

import {
  linearScale,
  logDomain,
  logScale,
  niceDomain,
  pixel,
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
});
