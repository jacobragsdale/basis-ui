import { describe, expect, test } from "vite-plus/test";

import {
  Decimal,
  bpsToFraction,
  bpsToPercent,
  delta,
  fractionToBps,
  fractionToPercent,
  percentChange,
  percentToBps,
  percentToFraction,
  roundToTick,
  shares,
} from "#numbers/index.ts";

const dec = (text: string): Decimal => Decimal.from(text);

function weights(values: readonly string[], scale: number): readonly string[] | string {
  const result = shares(
    values.map((value) => dec(value)),
    { scale },
  );
  return result.defined ? result.value.map(String) : result.reason;
}

function total(values: readonly string[], scale: number): string {
  const result = shares(
    values.map((value) => dec(value)),
    { scale },
  );
  return result.defined ? Decimal.sum(result.value).toString() : result.reason;
}

describe("rates", () => {
  test.each([
    [bpsToFraction, "25", "0.0025"],
    [bpsToFraction, "-12.5", "-0.00125"],
    [fractionToBps, "0.0025", "25"],
    [fractionToBps, "0.05", "500"],
    [fractionToBps, "0.0412575", "412.575"],
    [percentToFraction, "4.125", "0.04125"],
    [fractionToPercent, "0.04125", "4.125"],
    [fractionToPercent, "1", "100"],
    [bpsToPercent, "25", "0.25"],
    [percentToBps, "0.25", "25"],
    [percentToBps, "1.5", "150"],
  ])("%o of %s is %s, exactly", (convert, value, result) => {
    expect(convert(dec(value)).toString()).toBe(result);
  });

  test("conversions round-trip without losing digits", () => {
    const rate = dec("0.0412575");
    expect(bpsToFraction(fractionToBps(rate)).equals(rate)).toBe(true);
    expect(percentToFraction(fractionToPercent(rate)).equals(rate)).toBe(true);
  });

  test.each([
    ["4.1337", "0.005", "4.135"],
    ["4.1325", "0.005", "4.135"],
    ["-4.1325", "0.005", "-4.135"],
    ["99.51", "0.015625", "99.515625"],
    ["12.3", "0.25", "12.25"],
    ["7", "2", "8"],
  ])("%s to a tick of %s is %s", (value, tick, result) => {
    expect(roundToTick(dec(value), dec(tick)).toString()).toBe(result);
  });

  test("rounds to a tick by the rounding it is given", () => {
    expect(roundToTick(dec("4.1325"), dec("0.005"), "half-even").toString()).toBe("4.130");
    expect(roundToTick(dec("4.1349"), dec("0.005"), "floor").toString()).toBe("4.130");
  });

  test("refuses a tick that is not positive", () => {
    expect(() => roundToTick(dec("1"), dec("0"))).toThrow("A tick of 0 is not positive.");
    expect(() => roundToTick(dec("1"), dec("-0.5"))).toThrow(RangeError);
  });
});

describe("changes", () => {
  test("delta is to minus from", () => {
    expect(delta(dec("101.25"), dec("100.5")).toString()).toBe("-0.75");
  });

  test("percent change is a fraction of the base's size", () => {
    expect(percentChange(dec("100"), dec("105"), { scale: 4 })).toEqual({
      defined: true,
      value: dec("0.0500"),
    });
    const narrowed = percentChange(dec("-100"), dec("-50"), { scale: 2 });
    expect(narrowed.defined && narrowed.value.toString()).toBe("0.50");
    const third = percentChange(dec("3"), dec("4"), { rounding: "floor", scale: 3 });
    expect(third.defined && third.value.toString()).toBe("0.333");
  });

  test("a change from zero has no percentage, by name", () => {
    expect(percentChange(dec("0.00"), dec("5"), { scale: 2 })).toEqual({
      defined: false,
      reason: "zero-base",
    });
    expect(percentChange(dec("0"), dec("0"), { scale: 2 })).toEqual({
      defined: false,
      reason: "zero-base",
    });
  });
});

describe("shares", () => {
  test("sum to exactly 1, the leftover units going to the largest remainders", () => {
    expect(weights(["1", "1", "1"], 2)).toEqual(["0.34", "0.33", "0.33"]);
    expect(weights(["2", "1", "1"], 1)).toEqual(["0.5", "0.3", "0.2"]);
    expect(weights(["10", "20", "30", "40"], 2)).toEqual(["0.10", "0.20", "0.30", "0.40"]);
    expect(weights(["1.5", "2.25", "0.003"], 4)).toEqual(["0.3997", "0.5995", "0.0008"]);
  });

  test("break ties in the remainders by order", () => {
    expect(weights(["1", "1", "1", "1", "1", "1"], 1)).toEqual([
      "0.2",
      "0.2",
      "0.2",
      "0.2",
      "0.1",
      "0.1",
    ]);
  });

  test("of a long and short book take signs, and still sum to 1", () => {
    expect(weights(["150", "-50"], 2)).toEqual(["1.50", "-0.50"]);
    expect(weights(["-1", "-1", "-1"], 2)).toEqual(["0.34", "0.33", "0.33"]);
    expect(total(["7", "-3", "11", "0.5"], 3)).toBe("1.000");
  });

  test.each([
    [["1", "2", "3", "4", "5", "6", "7"], 2],
    [["0.1", "0.2", "0.3"], 0],
    [["123.456", "789.01", "1", "1", "1"], 5],
  ])("of %j at scale %i sum to 1", (values, scale) => {
    expect(total(values, scale)).toBe(Decimal.from(1n).round(scale).toString());
  });

  test("of a zero total, or of nothing, are undefined by name", () => {
    expect(weights(["5", "-5"], 2)).toBe("zero-total");
    expect(weights([], 2)).toBe("zero-total");
  });
});
