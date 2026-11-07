import { describe, expect, it } from "vitest";

import { parseLayout } from "../layout";
import type { LayoutFilter } from "../layout";
import {
  withAllExpanded,
  withGroupedBy,
  withoutGroup,
  columnCondition,
  defaultTotals,
  filterLabel,
  highlightRanges,
  isFiltered,
  searchColumns,
  shownColumns,
  totalChoices,
  totalOf,
  withColumnBefore,
  withColumnCondition,
  withHidden,
  withShown,
  withPinned,
  withSort,
  withTitle,
  withTotal,
  withoutFilter,
  withoutFilters
} from "./edit";
import type { SourceField } from "./grid-source";

const fields: readonly SourceField[] = [
  { name: "position_id", kind: "integer" },
  { name: "fund", kind: "text" },
  { name: "ticker", kind: "text" },
  { name: "sector", kind: "text" },
  { name: "price", kind: "decimal" }
];

describe("shownColumns and searchColumns", () => {
  it("put pinned columns first and search the text a grid shows", () => {
    const flat = parseLayout({ columns: ["position_id", "fund", "price", "ticker"], pinned: ["ticker"] });
    expect(shownColumns(flat, fields)).toEqual(["ticker", "position_id", "fund", "price"]);
    expect(searchColumns(flat, fields)).toEqual(["ticker", "fund"]);
    expect(shownColumns(parseLayout({ pinned: ["price"] }), fields)).toEqual(["price", "position_id", "fund", "ticker", "sector"]);
  });

  it("search a pivot's groups and a detail view's groups and columns", () => {
    expect(searchColumns(parseLayout({ group_by: ["sector"], split_by: ["fund"], measures: [{ aggregate: "count_all" }] }), fields)).toEqual(["sector", "fund"]);
    expect(searchColumns(parseLayout({ group_by: ["sector"], detail: true, columns: ["ticker", "price"] }), fields)).toEqual(["sector", "ticker"]);
  });
});

describe("filter chips", () => {
  const filter = (f: Partial<LayoutFilter>): LayoutFilter => ({ column: "sector", op: "in", value: null, values: [], columns: [], ...f });
  const title = (column: string): string => (column === "sector" ? "Sector" : column);

  it("say what each filter keeps", () => {
    expect(filterLabel(filter({ values: ["Energy", null] }), title)).toBe("Sector: Energy, (blank)");
    expect(filterLabel(filter({ values: ["a", "b", "c", "d", "e"] }), title)).toBe("Sector: a, b, c +2 more");
    expect(filterLabel(filter({ op: "not_in", values: ["Energy"] }), title)).toBe("Sector: not Energy");
    expect(filterLabel(filter({ column: "price", op: "ge", value: "100" }), title)).toBe("price ≥ 100");
    expect(filterLabel(filter({ op: "is_null" }), title)).toBe("Sector is blank");
    expect(filterLabel(filter({ op: "not_contains", value: "x", columns: ["fund", "ticker"] }), title)).toBe("Sector or 2 more does not contain x");
  });

  it("come off one at a time, or all at once with the search", () => {
    const layout = parseLayout({ search: "atl", filters: [filter({ values: ["Energy"] }), filter({ column: "fund", op: "is_null" })] });
    expect(withoutFilter(layout, 0).filters.map((f) => f.column)).toEqual(["fund"]);
    expect(withoutFilters(layout)).toMatchObject({ filters: [], search: "" });
  });
});

describe("highlightRanges", () => {
  it("finds every match, ignoring case", () => {
    expect(highlightRanges("Atlas Global Atlantic", "atl")).toEqual([
      [0, 3],
      [13, 16]
    ]);
    expect(highlightRanges("aaaa", "aa")).toEqual([
      [0, 2],
      [2, 4]
    ]);
    expect(highlightRanges("Rates", "")).toEqual([]);
    expect(highlightRanges("Rates", "x")).toEqual([]);
  });

  it("marks nothing when lowering changes the text's length", () => {
    expect(highlightRanges("İstanbul", "stan")).toEqual([]);
  });
});

describe("header menu edits", () => {
  const base = parseLayout({ columns: ["fund", "price"], filters: [{ column: "fund", op: "contains", value: "x", columns: ["ticker"] }] });

  it("read and write a column's own filter, leaving searches across columns alone", () => {
    expect(columnCondition(base, "fund")).toEqual({ kind: "none" });
    const ranged = withColumnCondition(base, "price", { kind: "between", from: "1", to: "5" });
    expect(columnCondition(ranged, "price")).toEqual({ kind: "between", from: "1", to: "5" });
    expect(isFiltered(ranged, "price")).toBe(true);
    const listed = withColumnCondition(ranged, "price", { kind: "values", values: ["2", null] });
    expect(columnCondition(listed, "price")).toEqual({ kind: "values", values: ["2", null] });
    expect(listed.filters).toHaveLength(2);
    expect(withColumnCondition(listed, "price", { kind: "values", values: [] }).filters).toEqual(base.filters);
    expect(columnCondition(withColumnCondition(base, "fund", { kind: "one", op: "not_contains", value: "a" }), "fund")).toEqual({ kind: "one", op: "not_contains", value: "a" });
  });

  it("sort, hide, pin, rename and total a column", () => {
    expect(withSort(base, "price", true).sort).toEqual([{ column: "price", descending: true }]);
    expect(withSort(withSort(base, "price", true), "price", null).sort).toEqual([]);
    expect(withHidden(parseLayout({ pinned: ["ticker"] }), "ticker", fields)).toMatchObject({ columns: ["position_id", "fund", "sector", "price"], pinned: [] });
    expect(withPinned(withPinned(base, "price", true), "fund", true).pinned).toEqual(["price", "fund"]);
    expect(withPinned(withPinned(base, "price", true), "price", false).pinned).toEqual([]);
    expect(withTitle(base, "fund", " Fund ").titles).toEqual({ fund: "Fund" });
    expect(withTitle(withTitle(base, "fund", "Fund"), "fund", "").titles).toEqual({});
    const totalled = withTotal(base, "price", "sum");
    expect(totalOf(totalled, "price")).toBe("sum");
    expect(totalOf(withTotal(totalled, "price", null), "price")).toBeNull();
    expect(totalChoices("text")).toEqual(["count", "distinct_count"]);
  });
});

describe("column order and totals", () => {
  it("moves a column within its zone", () => {
    const layout = parseLayout({ columns: ["position_id", "fund", "ticker", "price"], pinned: ["price"] });
    expect(shownColumns(withColumnBefore(layout, fields, "ticker", "position_id"), fields)).toEqual(["price", "ticker", "position_id", "fund"]);
    expect(shownColumns(withColumnBefore(layout, fields, "position_id", null), fields)).toEqual(["price", "fund", "ticker", "position_id"]);
    const two = withPinned(layout, "fund", true);
    expect(withColumnBefore(two, fields, "fund", "price").pinned).toEqual(["fund", "price"]);
  });

  it("shows a hidden column last, and gives a grid without totals sums of its numbers", () => {
    const layout = parseLayout({ columns: ["position_id", "fund"] });
    expect(withShown(layout, fields, "price", true).columns).toEqual(["position_id", "fund", "price"]);
    expect(withShown(layout, fields, "fund", false).columns).toEqual(["position_id"]);
    expect(defaultTotals(parseLayout({ columns: ["fund", "price"] }), fields).totals.map((t) => [t.column, t.aggregate])).toEqual([["price", "sum"]]);
    expect(defaultTotals(layout, fields).totals.map((t) => [t.column, t.aggregate])).toEqual([["position_id", "count"]]);
  });
});

describe("grouping a grid", () => {
  it("groups by columns, keeping rows under their groups, and ungroups back to a list", () => {
    const flat = parseLayout({ columns: ["fund", "ticker", "price"] });
    const one = withGroupedBy(flat, "fund");
    expect(one).toMatchObject({ group_by: ["fund"], detail: true, expand_depth: 1 });
    const two = withGroupedBy(one, "ticker", 0);
    expect(two.group_by).toEqual(["ticker", "fund"]);
    expect(withGroupedBy(two, "fund", 0).group_by).toEqual(["fund", "ticker"]);
    expect(withoutGroup(two, "ticker")).toMatchObject({ group_by: ["fund"], detail: true });
    expect(withoutGroup(one, "fund")).toMatchObject({ group_by: [], detail: false, expand_depth: 0 });
    expect(withAllExpanded(two, false)).toMatchObject({ expand_depth: 0, expanded: [] });
    expect(withAllExpanded(two, true).expand_depth).toBe(2);
  });
});
