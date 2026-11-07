import { describe, expect, test } from "vite-plus/test";

import { amountSuffixes, parSuffixes, parseAmount, rateSuffixes } from "#index.ts";

describe("amounts", () => {
  test.each([
    ["0", "0"],
    ["1234", "1234"],
    ["1,234.50", "1234.5"],
    ["  42  ", "42"],
    ["-1,234", "-1234"],
    ["+7", "7"],
    ["(1,234.50)", "-1234.5"],
    [".5", "0.5"],
    ["5.", "5"],
    ["007", "7"],
    ["250k", "250000"],
    ["250 K", "250000"],
    ["1.5m", "1500000"],
    ["1.5mm", "1500000"],
    ["2bn", "2000000000"],
    ["0.000001b", "1000"],
    ["-0", "0"],
    ["(0.00)", "0"],
    ["12345678901234567890.123456789", "12345678901234567890.123456789"],
  ])("%s reads as %s", (text, value) => {
    expect(parseAmount(text)).toEqual({ ok: true, value });
  });

  test.each([
    ["", "Enter a number."],
    ["abc", '"abc" has no digits.'],
    ["1.2.3", '"1.2.3" is not a number.'],
    ["12,34", '"12,34" has commas in the wrong places; group digits in threes.'],
    ["(-5)", '"(-5)" is negative twice.'],
    ["5x", '"x" is not a suffix this field accepts: use k, m, mm, b, bn.'],
    ["25bp", '"bp" is not a suffix this field accepts: use k, m, mm, b, bn.'],
    [".", '"." has no digits.'],
  ])("%s is refused: %s", (text, reason) => {
    expect(parseAmount(text)).toEqual({ ok: false, reason });
  });
});

test("bond-market par reads m as thousands and mm as millions", () => {
  expect(parseAmount("5M", parSuffixes)).toEqual({ ok: true, value: "5000" });
  expect(parseAmount("5MM", parSuffixes)).toEqual({ ok: true, value: "5000000" });
  expect(parseAmount("5k", parSuffixes).ok).toBe(false);
  expect(parseAmount("5M", amountSuffixes)).toEqual({ ok: true, value: "5000000" });
});

test.each([
  ["25bp", "0.0025"],
  ["25 bps", "0.0025"],
  ["4.125%", "0.04125"],
  ["-12.5bp", "-0.00125"],
  ["0.0425", "0.0425"],
])("the rate %s reads as %s", (text, value) => {
  expect(parseAmount(text, rateSuffixes)).toEqual({ ok: true, value });
});
