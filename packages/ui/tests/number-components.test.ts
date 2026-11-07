/* The rules behind the number components and AmountInput: the text each number shows through the formatter, and the
 * schema that gives a form the parse reason. The gallery's browser tests render the components themselves. */

import { describe, expect, test } from "vite-plus/test";

import {
  bpsText,
  moneyText,
  numText,
  pctText,
  price32Text,
  signedText,
} from "#components/num-text.ts";
import { amountSchema, parSuffixes, rateSuffixes } from "#index.ts";
import { Decimal } from "#numbers/index.ts";

describe("number text", () => {
  test.each([
    ["decimal text keeps its scale", numText("1234.50"), "1,234.50"],
    ["a negative decimal", numText("-1234.5"), "-1,234.5"],
    ["a double shows two decimals", numText(1234.5), "1,234.50"],
    ["a bigint shows none", numText(1234n), "1,234"],
    ["a Decimal", numText(Decimal.from("-0.25")), "-0.25"],
    ["null", numText(null), ""],
    ["abbreviated", numText("1500000", { abbreviate: "M" }), "1.5M"],
    ["in parentheses", numText("-12.5", { negative: "parentheses" }), "(12.5)"],
    ["without commas", numText(1_234_567n, { thousands: false }), "1234567"],
    ["NaN", numText(Number.NaN), "—"],
  ])("%s", (_name, shown, text) => {
    expect(shown.text).toBe(text);
  });

  test("a Decimal of another copy of the class reads by its shape", () => {
    expect(numText({ scale: 2, unscaled: -123_450n }).text).toBe("-1,234.50");
  });

  test("text that is not a decimal throws, as Decimal.from does", () => {
    expect(() => numText("12abc")).toThrow(SyntaxError);
  });

  test.each([
    ["1.25", "gain"],
    ["-1.25", "loss"],
    ["0", "none"],
    ["0.001", "none"],
    ["-0.001", "none"],
  ] as const)("%s points to %s once rounded", (value, direction) => {
    expect(numText(value, { decimals: 2 }).direction).toBe(direction);
  });

  test("a signed gain takes a plus sign, and a loss or zero none", () => {
    expect(signedText("1.25", "gain")).toBe("+1.25");
    expect(signedText("-1.25", "loss")).toBe("-1.25");
    expect(signedText("0.00", "none")).toBe("0.00");
  });
});

describe("money text", () => {
  test.each([
    { currency: "USD", format: {}, text: "$1,234.50", value: "1234.5" },
    { currency: "USD", format: {}, text: "-$1,234.50", value: "-1234.5" },
    { currency: "USD", format: { negative: "parentheses" }, text: "($1,234.50)", value: "-1234.5" },
    { currency: "EUR", format: {}, text: "€1,234.50", value: "1234.5" },
    { currency: "JPY", format: {}, text: "¥1,234", value: "1234" },
    { currency: "CHF", format: {}, text: "CHF\u00A01,234.50", value: "1234.5" },
    { currency: "USD", format: { abbreviate: "M" }, text: "$1.5M", value: "1500000" },
    { currency: "USD", format: { decimals: 4 }, text: "$1,234.5678", value: "1234.5678" },
  ] as const)("$value $currency with $format is $text", ({ currency, format, text, value }) => {
    expect(moneyText(value, currency, format).text).toBe(text);
  });

  test("a code that is not a currency throws", () => {
    expect(() => moneyText("1", "DOLLARS")).toThrow(RangeError);
  });
});

describe("rate text", () => {
  test.each([
    ["a fraction as decimal text", pctText("0.0525"), "5.25%"],
    ["a fraction as a double", pctText(0.0525), "5.25%"],
    ["a percentage as decimal text", pctText("5.25", {}, "percent"), "5.25%"],
    ["a percentage as a double", pctText(5.25, {}, "percent"), "5.25%"],
    ["a percentage as a bigint", pctText(5n, {}, "percent"), "5.00%"],
    ["a negative fraction", pctText(-0.001), "-0.10%"],
    ["a fraction in basis points", bpsText("0.0025"), "25 bp"],
    ["a fraction's scale carries over", bpsText("0.00125"), "12.5 bp"],
    ["a double in basis points", bpsText(0.0025), "25.00 bp"],
    ["basis points as they are", bpsText(25n, {}, "bp"), "25 bp"],
    ["basis points in parentheses", bpsText("-0.0025", { negative: "parentheses" }), "(25 bp)"],
  ])("%s", (_name, shown, text) => {
    expect(shown.text).toBe(text);
  });
});

describe("Treasury price text", () => {
  test.each([
    ["99.515625", {}, "99-16+"],
    [99.5078125, {}, "99-162"],
    ["-0.140625", {}, "-0-04+"],
    ["99.515625", { precision: "thirty-seconds" }, "99-17"],
    [100n, {}, "100-00"],
  ] as const)("%s with %o is %s", (value, format, text) => {
    expect(price32Text(value, format).text).toBe(text);
  });

  test("a double that is not finite has no price", () => {
    expect(price32Text(Number.POSITIVE_INFINITY).text).toBe("—");
  });
});

describe(amountSchema, () => {
  test("accepts the decimal an AmountInput read", () => {
    expect(amountSchema(parSuffixes).parse("5000")).toBe("5000");
    expect(amountSchema(rateSuffixes).parse("0.0025")).toBe("0.0025");
  });

  test("gives the parser's reason for text that reads as no number", () => {
    const result = amountSchema(parSuffixes).safeParse("5k");
    expect(result.error?.issues.map(({ message }) => message)).toStrictEqual([
      '"k" is not a suffix this field accepts: use m, mm, bn.',
    ]);
  });

  test("asks for an amount when the field is empty, unless nullable", () => {
    expect(amountSchema().safeParse(null).error?.issues[0]?.message).toBe("Enter an amount.");
    expect(amountSchema().nullable().parse(null)).toBeNull();
  });
});
