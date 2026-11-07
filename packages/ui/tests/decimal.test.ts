import { describe, expect, test } from "vite-plus/test";

import { createFormatter } from "#index.ts";
import { Decimal, defaultRounding } from "#numbers/index.ts";

describe("making a Decimal", () => {
  test("from text keeps the scale it was written with", () => {
    const price = Decimal.from("101.50");
    expect([price.unscaled, price.scale, price.toString()]).toEqual([10_150n, 2, "101.50"]);
  });

  test("from an unscaled integer and a scale", () => {
    expect(Decimal.from(-123_450n, 2).toString()).toBe("-1234.50");
    expect(Decimal.from(42n).toString()).toBe("42");
    expect(Decimal.from(5n, 30).toString()).toBe("0.000000000000000000000000000005");
  });

  test.each([" 1.5", "1.5 ", "1_000", "NaN", "Infinity", "-Infinity", "١٢"])(
    "refuses %j, which Python's Decimal would read",
    (text) => {
      expect(() => Decimal.from(text)).toThrow(SyntaxError);
    },
  );

  test("names the fix when text is not a number", () => {
    expect(() => Decimal.from("1,000")).toThrow(
      '"1,000" is not a decimal number; write one such as 1234.5 or -0.0025.',
    );
  });

  test("refuses an exponent that would stall the page", () => {
    expect(Decimal.from("1e10000").toString()).toHaveLength(10_001);
    expect(() => Decimal.from("1e10001")).toThrow(RangeError);
    expect(() => Decimal.from("1e-10001")).toThrow(RangeError);
  });

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a scale of %s", (scale) => {
    expect(() => Decimal.from(1n, scale)).toThrow(RangeError);
    expect(() => Decimal.from("1").round(scale)).toThrow(RangeError);
    expect(() => Decimal.from("1").div(Decimal.from("3"), { scale })).toThrow(RangeError);
  });

  test("from a number only with a scale and a rounding, and never from NaN or an infinity", () => {
    expect(Decimal.fromNumber(2.675, 2, "half-away-from-zero").toString()).toBe("2.68");
    expect(Decimal.fromNumber(0.1 + 0.2, 2, "half-even").toString()).toBe("0.30");
    expect(Decimal.fromNumber(-0, 1, "floor").toString()).toBe("0.0");
    expect(() => Decimal.fromNumber(Number.NaN, 2, "floor")).toThrow(RangeError);
    expect(() => Decimal.fromNumber(Number.NEGATIVE_INFINITY, 2, "floor")).toThrow(RangeError);
  });
});

describe("arithmetic", () => {
  const price = Decimal.from("1.50");
  const fraction = Decimal.from("-0.125");

  test("is exact, at the scales Python's decimal gives", () => {
    expect(price.add(fraction).toString()).toBe("1.375");
    expect(price.sub(fraction).toString()).toBe("1.625");
    expect(price.mul(fraction).toString()).toBe("-0.18750");
    expect(Decimal.from("0.1").add(Decimal.from("0.2")).toString()).toBe("0.3");
  });

  test("divides to the scale it is given, half away from zero unless told otherwise", () => {
    expect(defaultRounding).toBe("half-away-from-zero");
    expect(Decimal.from("2").div(Decimal.from("3"), { scale: 4 }).toString()).toBe("0.6667");
    expect(Decimal.from("1").div(Decimal.from("8"), { scale: 2 }).toString()).toBe("0.13");
    expect(
      Decimal.from("1").div(Decimal.from("8"), { rounding: "half-even", scale: 2 }).toString(),
    ).toBe("0.12");
    expect(Decimal.from("-7").div(Decimal.from("2"), { scale: 0 }).toString()).toBe("-4");
  });

  test("refuses to divide by zero", () => {
    expect(() => price.div(Decimal.from("0.00"), { scale: 2 })).toThrow(
      "1.50 cannot be divided by zero.",
    );
  });

  test("rounds to fewer digits and pads to more", () => {
    expect(Decimal.from("2.5").round(0).toString()).toBe("3");
    expect(Decimal.from("-2.5").round(0).toString()).toBe("-3");
    expect(Decimal.from("2.5").round(0, "half-even").toString()).toBe("2");
    expect(Decimal.from("-0.004").round(2).toString()).toBe("0.00");
    expect(Decimal.from("1.5").round(4).toString()).toBe("1.5000");
  });

  test("compares across scales", () => {
    expect(Decimal.from("1.5").equals(Decimal.from("1.50"))).toBe(true);
    expect(Decimal.from("1.5").compare(Decimal.from("1.49999"))).toBe(1);
    expect(Decimal.from("-2").compare(Decimal.from("1"))).toBe(-1);
  });

  test("signs", () => {
    expect([
      fraction.abs().toString(),
      fraction.neg().toString(),
      fraction.sign(),
      price.sign(),
      Decimal.zero.sign(),
    ]).toEqual(["0.125", "0.125", -1, 1, 0]);
    expect([Decimal.from("0.000").isZero(), fraction.isZero()]).toEqual([true, false]);
  });

  test("sums a list at its largest scale, and nothing to zero", () => {
    const total = Decimal.sum([Decimal.from("0.1"), Decimal.from("0.20"), Decimal.from("-0.3")]);
    expect(total.toString()).toBe("0.00");
    expect(Decimal.sum([]).toString()).toBe("0");
    expect(Decimal.sum(new Set([price])).toString()).toBe("1.50");
  });

  test("never changes the values it was given", () => {
    price.add(fraction).mul(fraction).round(0);
    expect([price.toString(), fraction.toString()]).toEqual(["1.50", "-0.125"]);
    expect(Object.isFrozen(price)).toBe(true);
  });
});

describe("converting", () => {
  test("to text, never with an exponent", () => {
    expect(Decimal.from("1E+21").toString()).toBe("1000000000000000000000");
    expect(Decimal.from("1e-7").toString()).toBe("0.0000001");
    expect(String(Decimal.from("-0.50"))).toBe("-0.50");
  });

  test("to the nearest double, for charts", () => {
    expect(Decimal.from("0.1").toNumber()).toBe(0.1);
    expect(Decimal.from("9007199254740993").toNumber()).toBe(9_007_199_254_740_992);
  });

  test("to JSON as the string an API reads", () => {
    expect(JSON.stringify({ price: Decimal.from("99.515625") })).toBe('{"price":"99.515625"}');
  });

  test("fails rather than compare or add as a primitive", () => {
    const price = Decimal.from("1.5");
    expect(() => price.valueOf()).toThrow(TypeError);
    expect(() => Number(price)).toThrow("Decimal 1.5 has no primitive value");
  });

  test("feeds the formatter its unscaled digits and scale", () => {
    const formatter = createFormatter();
    const amount = Decimal.from("-1234567.125");
    expect(formatter.decimal(amount.unscaled, amount.scale)).toBe("-1,234,567.125");
    const rounded = amount.round(2);
    expect(formatter.decimal(rounded.unscaled, rounded.scale)).toBe("-1,234,567.13");
    const rate = Decimal.from("0.04125");
    expect(createFormatter({ percent: true, decimals: 3 }).decimal(rate.unscaled, rate.scale)).toBe(
      "4.125%",
    );
  });
});
