import { describe, expect, test } from "vite-plus/test";

import {
  columnCondition,
  filterLabel,
  highlightRanges,
  isFiltered,
  withColumnCondition,
  withoutFilter,
  withoutFilters,
} from "#grid/filters.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutFilter } from "#layout/layout.ts";

const filter = (parts: Partial<LayoutFilter>): LayoutFilter => ({
  column: "sector",
  columns: [],
  op: "in",
  value: null,
  values: [],
  ...parts,
});
const title = (column: string): string => (column === "sector" ? "Sector" : column);

describe("filter chips", () => {
  test("say what each filter keeps", () => {
    expect(filterLabel(filter({ values: ["Energy", null] }), title)).toBe(
      "Sector: Energy, (blank)",
    );
    expect(filterLabel(filter({ values: ["a", "b", "c", "d", "e"] }), title)).toBe(
      "Sector: a, b, c +2 more",
    );
    expect(filterLabel(filter({ op: "not_in", values: ["Energy"] }), title)).toBe(
      "Sector: not Energy",
    );
    expect(filterLabel(filter({ column: "price", op: "ge", value: "100" }), title)).toBe(
      "price ≥ 100",
    );
    expect(filterLabel(filter({ op: "is_null" }), title)).toBe("Sector is blank");
    expect(
      filterLabel(filter({ columns: ["fund", "ticker"], op: "not_contains", value: "x" }), title),
    ).toBe("Sector or 2 more does not contain x");
  });

  test("come off one at a time, or all at once with the search", () => {
    const layout = parseLayout({
      filters: [filter({ values: ["Energy"] }), filter({ column: "fund", op: "is_null" })],
      search: "atl",
    });
    expect(withoutFilter(layout, 0).filters.map((each) => each.column)).toStrictEqual(["fund"]);
    expect(withoutFilters(layout)).toMatchObject({ filters: [], search: "" });
  });
});

describe("highlightRanges", () => {
  test("finds every match, ignoring case", () => {
    expect(highlightRanges("Atlas Global Atlantic", "atl")).toStrictEqual([
      [0, 3],
      [13, 16],
    ]);
    expect(highlightRanges("aaaa", "aa")).toStrictEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(highlightRanges("Rates", "")).toStrictEqual([]);
    expect(highlightRanges("Rates", "x")).toStrictEqual([]);
  });

  test("marks nothing when lowering changes the text's length", () => {
    expect(highlightRanges("İstanbul", "stan")).toStrictEqual([]);
  });
});

describe("a column's own filter", () => {
  const base = parseLayout({
    columns: ["fund", "price"],
    filters: [{ column: "fund", columns: ["ticker"], op: "contains", value: "x" }],
  });

  test("is read and written apart from searches across columns", () => {
    expect(columnCondition(base, "fund")).toStrictEqual({ kind: "none" });
    const ranged = withColumnCondition(base, "price", { from: "1", kind: "between", to: "5" });
    expect(columnCondition(ranged, "price")).toStrictEqual({ from: "1", kind: "between", to: "5" });
    expect(isFiltered(ranged, "price")).toBe(true);
    const listed = withColumnCondition(ranged, "price", { kind: "values", values: ["2", null] });
    expect(columnCondition(listed, "price")).toStrictEqual({ kind: "values", values: ["2", null] });
    expect(listed.filters).toHaveLength(2);
    expect(
      withColumnCondition(listed, "price", { kind: "values", values: [] }).filters,
    ).toStrictEqual(base.filters);
  });

  test("takes a condition of one value", () => {
    const one = withColumnCondition(base, "fund", { kind: "one", op: "not_contains", value: "a" });
    expect(columnCondition(one, "fund")).toStrictEqual({
      kind: "one",
      op: "not_contains",
      value: "a",
    });
  });
});
