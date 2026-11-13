import { describe, expect, test } from "vite-plus/test";

import { parseAmountText } from "#format/parse.ts";
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
    expect(parseAmountText(text)).toEqual({ ok: true, value });
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
  expect(parseAmount("5M", parSuffixes)).toEqual({ ok: true, value: 5000 });
  expect(parseAmount("5MM", parSuffixes)).toEqual({ ok: true, value: 5_000_000 });
  expect(parseAmount("5k", parSuffixes).ok).toBe(false);
  expect(parseAmount("5M", amountSuffixes)).toEqual({ ok: true, value: 5_000_000 });
});

test.each([
  ["25bp", "0.0025"],
  ["25 bps", "0.0025"],
  ["4.125%", "0.04125"],
  ["-12.5bp", "-0.00125"],
  ["0", "0"],
  ["0.00", "0"],
  ["-0", "0"],
])("the rate %s reads as %s", (text, value) => {
  expect(parseAmountText(text, rateSuffixes)).toEqual({ ok: true, value });
  expect(parseAmount(text, rateSuffixes)).toEqual({ ok: true, value: Number(value) });
});

test.each([
  ["25", '"25" needs a unit: write 25% or 25bp.'],
  ["4.375", '"4.375" needs a unit: write 4.375% or 4.375bp.'],
  ["(1,500.5)", '"(1,500.5)" needs a unit: write -1,500.5% or -1,500.5bp.'],
  [".5", '".5" needs a unit: write .5% or .5bp.'],
])("a rate field refuses the bare number %s, naming its units", (text, reason) => {
  expect(parseAmount(text, rateSuffixes)).toEqual({ ok: false, reason });
  expect(parseAmountText(text, rateSuffixes)).toEqual({ ok: false, reason });
});

test("a rate field's need of a unit is the suffix set's, and a spread of it keeps it", () => {
  expect(parseAmount("25", { ...rateSuffixes, pct: -2 }).ok).toBe(false);
  expect(parseAmount("25pct", { ...rateSuffixes, pct: -2 })).toEqual({ ok: true, value: 0.25 });
  expect(parseAmount("25", amountSuffixes)).toEqual({ ok: true, value: 25 });
  expect(parseAmount("25", parSuffixes)).toEqual({ ok: true, value: 25 });
});

test("digits too many for a double are refused, not read as Infinity", () => {
  const digits = "9".repeat(309);
  expect(parseAmount(digits)).toEqual({
    ok: false,
    reason: `"${digits}" is too large for a number.`,
  });
  expect(parseAmount(`-${digits}`).ok).toBe(false);
  expect(parseAmount("9".repeat(308)).ok).toBe(true);
  expect(parseAmount(`0.${"0".repeat(400)}1`)).toEqual({ ok: true, value: 0 });
});

test("a number is read exactly, then converted once, so a suffix adds no rounding of its own", () => {
  expect(parseAmount("1.1mm")).toEqual({ ok: true, value: 1_100_000 });
  expect(parseAmount("0.07m")).toEqual({ ok: true, value: 70_000 });
  expect(parseAmount("12345678901234567890.123456789")).toEqual({
    ok: true,
    value: 12_345_678_901_234_567_000,
  });
});
