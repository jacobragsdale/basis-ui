import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { checkLayout, layoutSchema, layoutVersion, parseLayout } from "#layout/layout.ts";

import { layouts } from "./fixtures.ts";

const chart = (indicators: unknown): unknown => ({ chart: { indicators, kind: "candlestick" } });

describe("the layout schema", () => {
  test("reads every layout the Rust crate writes back unchanged", () => {
    expect(layouts.length).toBeGreaterThan(1);
    for (const layout of layouts) {
      expect(parseLayout(layout)).toStrictEqual(layout);
    }
  });

  test("fills in the same defaults as the Rust crate", () => {
    expect(parseLayout({})).toStrictEqual(layouts[0]);
  });

  test("refuses unknown fields, as the Rust crate does", () => {
    expect(layoutSchema.safeParse({ groupBy: ["fund"], group_by: ["fund"] }).success).toBe(false);
    expect(
      layoutSchema.safeParse({ measures: [{ aggregate: "sum", colour: "red", column: "x" }] })
        .success,
    ).toBe(false);
  });

  test("refuses values the engine would refuse", () => {
    expect(layoutSchema.safeParse({ version: 3 }).success).toBe(false);
    expect(layoutSchema.safeParse({ column_widths: { x: -1 } }).success).toBe(false);
    expect(
      layoutSchema.safeParse({ measures: [{ aggregate: "percentile", percentile: 1.5 }] }).success,
    ).toBe(false);
    expect(layoutSchema.safeParse({ formats: { x: { decimals: 31 } } }).success).toBe(false);
  });

  test("fills in TA-Lib's default periods", () => {
    expect(
      parseLayout(chart([{ kind: "macd" }, { kind: "vwap" }])).chart?.indicators,
    ).toStrictEqual([{ fast: 12, kind: "macd", signal: 9, slow: 26 }, { kind: "vwap" }]);
  });

  test("checks indicators as the engine does", () => {
    const backwards = checkLayout(chart([{ fast: 26, kind: "macd", slow: 12 }]));
    expect(backwards.ok ? "" : backwards.error).toContain("fast average must be shorter");
    for (const wrong of [
      [{ kind: "sma", period: 0 }],
      [{ kind: "vwap", period: 5 }],
      [{ deviations: -1, kind: "bollinger" }],
      [{ kind: "vortex" }],
    ]) {
      expect(checkLayout(chart(wrong)).ok).toBe(false);
    }
  });

  test("brings older versions up to date, as the Rust crate does", () => {
    expect(parseLayout({ version: 0 }).version).toBe(layoutVersion);
    expect(parseLayout({ version: 1 }).version).toBe(2);
  });

  test("says what is wrong in English, and leaves Zod's settings for the host alone", () => {
    const checked = checkLayout({ colour: "red", version: 1.5 });
    expect(checked.ok).toBe(false);
    expect(checked.ok ? "" : checked.error).toContain('Unrecognized key: "colour"');
    expect(checked.ok ? "" : checked.error).toContain(
      "Invalid input: expected int, received number",
    );
    expect(() => parseLayout({ expand_depth: -1 })).toThrow("Too small: expected number to be >=0");
    expect(z.int().safeParse(1.5).error?.issues[0]?.message).toBe(
      "Invalid input: expected int, received number",
    );
  });
});

describe("orders and the tenor axis, which roadmap step 2.8 adds", () => {
  test("read orders by name or as an object, and refuse the rest, as the Rust crate does", () => {
    const orders = {
      bucket: { by: "years" },
      rating: "rating",
      sector: { values: ["Govt", "Muni"] },
      tenor: "tenor",
      ticker: "text",
    };
    expect(parseLayout({ orders }).orders).toStrictEqual(orders);
    for (const wrong of ["alphabet", { by: 3 }, { values: "x" }, { tenor: true }]) {
      expect(checkLayout({ orders: { sector: wrong } }).ok).toBe(false);
    }
  });

  test("leave a layout that sets none of them as it was", () => {
    const layout = parseLayout({ chart: { kind: "line", x: "date", y: ["close"] } });
    expect("orders" in layout).toBe(false);
    expect(layout.chart === null ? true : "tenor_spacing" in layout.chart).toBe(false);
  });

  test("take a tenor axis spaced evenly or by length", () => {
    const { chart: curve } = parseLayout({
      chart: { axis: "tenor", kind: "line", tenor_spacing: "length", x: "tenor" },
    });
    expect([curve?.axis, curve?.tenor_spacing]).toStrictEqual(["tenor", "length"]);
    expect(checkLayout({ chart: { kind: "line", tenor_spacing: "log" } }).ok).toBe(false);
  });
});

describe("a trading axis's calendar and session, which roadmap step 2.8 adds", () => {
  test("take SIFMA's calendar and an overnight session", () => {
    const session = { closes: "17:00", opens: "18:00" };
    const { chart: yields } = parseLayout({
      chart: { axis: "trading", calendar: "sifma", kind: "line", session, x: "time" },
    });
    expect([yields?.calendar, yields?.session]).toStrictEqual(["sifma", session]);
  });

  test("leave a layout that sets neither as it was", () => {
    const { chart: prices } = parseLayout({ chart: { axis: "trading", kind: "line" } });
    expect(
      prices === null ? [] : ["calendar", "session"].filter((key) => key in prices),
    ).toStrictEqual([]);
  });

  test("refuse a calendar it does not know, and times that are not HH:MM, as the Rust crate does", () => {
    const wrong = [
      { calendar: "lse" },
      { session: { closes: "17:00", opens: "8:00" } },
      { session: { closes: "24:00", opens: "08:00" } },
      { session: { closes: "17:60", opens: "08:00" } },
      { session: { opens: "08:00" } },
    ];
    for (const fields of wrong) {
      expect(checkLayout({ chart: { axis: "trading", kind: "line", ...fields } }).ok).toBe(false);
    }
  });
});
