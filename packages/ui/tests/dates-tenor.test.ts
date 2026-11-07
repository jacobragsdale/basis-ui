import { describe, expect, test } from "vite-plus/test";

import { addTenor, compareTenors, parseTenor, tenorText } from "#dates/index.ts";
import type { Tenor } from "#dates/index.ts";

const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);

function tenor(text: string): Tenor {
  const reading = parseTenor(text);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.value;
}

describe("parseTenor", () => {
  test.each([
    ["1D", 1, "D"],
    ["2W", 2, "W"],
    ["3M", 3, "M"],
    ["10Y", 10, "Y"],
    [" 6m ", 6, "M"],
    ["30y", 30, "Y"],
  ])("reads %j", (text, count, unit) => {
    expect(parseTenor(text)).toStrictEqual({ ok: true, value: { count, unit } });
  });

  test.each(["", "M", "3", "3Q", "3 M", "-1Y", "1.5Y", "ON", "10000D"])("refuses %j", (text) => {
    const reading = parseTenor(text);
    expect(reading.ok).toBe(false);
    expect(reading.ok ? "" : reading.reason).toContain("is not a tenor");
  });

  test("refuses a zero length and says why", () => {
    expect(parseTenor("0M")).toStrictEqual({
      ok: false,
      reason: '"0M" is not a tenor: it needs a length of at least 1M.',
    });
  });

  test("writes a tenor back", () => {
    expect(tenorText(tenor("10y"))).toBe("10Y");
  });
});

describe("addTenor", () => {
  test.each([
    ["2026-11-06", "1D", "2026-11-07"],
    ["2026-11-06", "2W", "2026-11-20"],
    ["2026-11-06", "3M", "2027-02-06"],
    ["2026-11-06", "10Y", "2036-11-06"],
  ])("%s + %s is %s", (start, text, expected) => {
    expect(addTenor(date(start), tenor(text)).toString()).toBe(expected);
  });

  test.each([
    ["2026-01-31", "1M", "2026-02-28"],
    ["2028-01-31", "1M", "2028-02-29"],
    ["2026-03-31", "1M", "2026-04-30"],
    ["2024-02-29", "1Y", "2025-02-28"],
    ["2025-02-28", "1M", "2025-03-28"],
    ["2026-08-31", "6M", "2027-02-28"],
  ])("a day past the month reached is its last day: %s + %s is %s", (start, text, expected) => {
    expect(addTenor(date(start), tenor(text)).toString()).toBe(expected);
  });

  test.each([
    ["2025-02-28", "1M", "2025-03-31"],
    ["2026-04-30", "1M", "2026-05-31"],
    ["2023-02-28", "1Y", "2024-02-29"],
    ["2026-01-31", "1M", "2026-02-28"],
    ["2026-01-30", "1M", "2026-02-28"],
    ["2026-01-15", "1M", "2026-02-15"],
    ["2026-02-28", "2W", "2026-03-14"],
  ])("with endOfMonth, a month end stays a month end: %s + %s is %s", (start, text, expected) => {
    expect(addTenor(date(start), tenor(text), { endOfMonth: true }).toString()).toBe(expected);
  });
});

describe("compareTenors", () => {
  test("sorts 1D < 1W < 1M < 3M < 1Y < 2Y < 10Y", () => {
    const sorted = ["10Y", "3M", "1Y", "1D", "2Y", "1M", "1W"]
      .map((text) => tenor(text))
      .toSorted(compareTenors);
    expect(sorted.map((each) => tenorText(each))).toStrictEqual([
      "1D",
      "1W",
      "1M",
      "3M",
      "1Y",
      "2Y",
      "10Y",
    ]);
  });

  test("orders mixed units by length", () => {
    expect(compareTenors(tenor("4W"), tenor("1M"))).toBe(-1);
    expect(compareTenors(tenor("52W"), tenor("1Y"))).toBe(-1);
    expect(compareTenors(tenor("13M"), tenor("1Y"))).toBe(1);
    expect(compareTenors(tenor("12M"), tenor("1Y"))).toBe(0);
    expect(compareTenors(tenor("7D"), tenor("1W"))).toBe(0);
  });
});
