/* The rules behind the number components and AmountInput: the text each number shows through the formatter, and the
 * schema that gives a form the parse reason. Every value is a double, as APIs send them. The gallery's browser tests
 * render the components themselves. */

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

describe("number text", () => {
  test.each([
    ["a double shows two decimals", numText(1234.5), "1,234.50"],
    ["a negative", numText(-1234.5), "-1,234.50"],
    ["set decimals", numText(1234.5, { decimals: 1 }), "1,234.5"],
    ["15 significant digits, then the decimals shown", numText(2.675, { decimals: 2 }), "2.68"],
    ["null", numText(null), ""],
    ["abbreviated", numText(1_500_000, { abbreviate: "M" }), "1.5M"],
    ["in parentheses", numText(-12.5, { negative: "parentheses" }), "(12.50)"],
    ["without commas", numText(1_234_567, { decimals: 0, thousands: false }), "1234567"],
    ["NaN", numText(Number.NaN), "—"],
  ])("%s", (_name, shown, text) => {
    expect(shown.text).toBe(text);
  });

  test.each([
    [1.25, "gain"],
    [-1.25, "loss"],
    [0, "none"],
    [0.001, "none"],
    [-0.001, "none"],
  ] as const)("%d points to %s once rounded", (value, direction) => {
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
    { currency: "USD", format: {}, text: "$1,234.50", value: 1234.5 },
    { currency: "USD", format: {}, text: "-$1,234.50", value: -1234.5 },
    { currency: "USD", format: { negative: "parentheses" }, text: "($1,234.50)", value: -1234.5 },
    { currency: "EUR", format: {}, text: "€1,234.50", value: 1234.5 },
    { currency: "JPY", format: {}, text: "¥1,234", value: 1234 },
    { currency: "CHF", format: {}, text: "CHF 1,234.50", value: 1234.5 },
    { currency: "USD", format: { abbreviate: "M" }, text: "$1.5M", value: 1_500_000 },
    { currency: "USD", format: { decimals: 4 }, text: "$1,234.5678", value: 1234.5678 },
  ] as const)("$value $currency with $format is $text", ({ currency, format, text, value }) => {
    expect(moneyText(value, currency, format).text).toBe(text);
  });

  test("a code that is not a currency shows a dash", () => {
    expect(moneyText(1, "DOLLARS")).toStrictEqual({ direction: "none", text: "—" });
  });

  test.each([31, -1, 2.5, Number.NaN])(
    "%d decimals, which no format takes, show a dash",
    (decimals) => {
      expect([
        numText(1234.5, { decimals }).text,
        moneyText(1234.5, "USD", { decimals }).text,
        pctText(0.05, { decimals }).text,
        bpsText(0.0025, { decimals }).text,
      ]).toStrictEqual(["—", "—", "—", "—"]);
    },
  );
});

describe("rate text", () => {
  test.each([
    ["a fraction as a percentage", pctText(0.0525), "5.25%"],
    ["a negative fraction", pctText(-0.001), "-0.10%"],
    ["a fraction in basis points", bpsText(0.0025), "25.00\u00A0bp"],
    ["basis points at set decimals", bpsText(0.00125, { decimals: 1 }), "12.5\u00A0bp"],
    [
      "basis points in parentheses",
      bpsText(-0.0025, { decimals: 0, negative: "parentheses" }),
      "(25\u00A0bp)",
    ],
  ])("%s", (_name, shown, text) => {
    expect(shown.text).toBe(text);
  });
});

describe("Treasury price text", () => {
  test.each([
    [99.515625, {}, "99-16+"],
    [99.5078125, {}, "99-162"],
    [-0.140625, {}, "-0-04+"],
    [99.515625, { precision: "thirty-seconds" }, "99-17"],
    [99.515625, { precision: "thirty-seconds", rounding: "half-even" }, "99-16"],
    [100, {}, "100-00"],
  ] as const)("%d with %o is %s", (value, format, text) => {
    expect(price32Text(value, format).text).toBe(text);
  });

  test("a double that is not finite has no price", () => {
    expect(price32Text(Number.POSITIVE_INFINITY).text).toBe("—");
    expect(price32Text(Number.NaN, { rounding: "floor" }).text).toBe("—");
  });
});

/** The messages a schema's refusal of `held` gives. */
function messages(schema: ReturnType<typeof amountSchema>, held: string): unknown {
  return schema.safeParse(held).error?.issues.map(({ message }) => message);
}

describe(amountSchema, () => {
  test("accepts the number an AmountInput read", () => {
    expect(amountSchema(parSuffixes).parse(5000)).toBe(5000);
    expect(amountSchema(rateSuffixes).parse(0.0025)).toBe(0.0025);
  });

  test("reads text the way the input does, exactly and then as a number", () => {
    expect(amountSchema(parSuffixes).parse("5M")).toBe(5000);
    expect(amountSchema(rateSuffixes).parse("25bp")).toBe(0.0025);
    expect(amountSchema().parse("1.1mm")).toBe(1_100_000);
  });

  test("refuses a bare rate, and a number too large for a double, with the parser's reasons", () => {
    expect(messages(amountSchema(rateSuffixes), "25")).toStrictEqual([
      '"25" needs a unit: write 25% or 25bp.',
    ]);
    expect(amountSchema(rateSuffixes).parse("0")).toBe(0);
    const digits = "9".repeat(309);
    expect(messages(amountSchema(), digits)).toStrictEqual([
      `"${digits}" is too large for a number.`,
    ]);
    expect(amountSchema().safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
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
