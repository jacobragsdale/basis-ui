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
