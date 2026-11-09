import { describe, expect, test } from "vite-plus/test";

import { sortedBy, sortMarkOf } from "#grid/changes.ts";
import {
  defaultTotals,
  searchColumns,
  shownColumns,
  totalChoices,
  totalOf,
  withAllExpanded,
  withColumnBefore,
  withGroupedBy,
  withHidden,
  withoutGroup,
  withPinned,
  withShown,
  withSort,
  withTitle,
  withTotal,
} from "#grid/edit.ts";
import type { SourceField } from "#grid/fields.ts";
import { filterValue } from "#grid/labels.ts";
import { parseLayout } from "#layout/layout.ts";

const fields: readonly SourceField[] = [
  { kind: "integer", name: "position_id" },
  { kind: "text", name: "fund" },
  { kind: "text", name: "ticker" },
  { kind: "text", name: "sector" },
  { kind: "decimal", name: "price" },
];

describe("shownColumns and searchColumns", () => {
  test("put pinned columns first and search the text a grid shows", () => {
    const flat = parseLayout({
      columns: ["position_id", "fund", "price", "ticker"],
      pinned: ["ticker"],
    });
    expect(shownColumns(flat, fields)).toStrictEqual(["ticker", "position_id", "fund", "price"]);
    expect(searchColumns(flat, fields)).toStrictEqual(["ticker", "fund"]);
    expect(shownColumns(parseLayout({ pinned: ["price"] }), fields)).toStrictEqual([
      "price",
      "position_id",
      "fund",
      "ticker",
      "sector",
    ]);
  });

  test("search a pivot's groups and a detail view's groups and columns", () => {
    const pivot = parseLayout({
      group_by: ["sector"],
      measures: [{ aggregate: "count_all" }],
      split_by: ["fund"],
    });
    expect(searchColumns(pivot, fields)).toStrictEqual(["sector", "fund"]);
    const detail = parseLayout({
      columns: ["ticker", "price"],
      detail: true,
      group_by: ["sector"],
    });
    expect(searchColumns(detail, fields)).toStrictEqual(["sector", "ticker"]);
  });
});

describe("header menu edits", () => {
  const base = parseLayout({ columns: ["fund", "price"] });

  test("sort, hide, pin and rename a column", () => {
    expect(withSort(base, "price", true).sort).toStrictEqual([
      { column: "price", descending: true },
    ]);
    expect(withSort(withSort(base, "price", true), "price", null).sort).toStrictEqual([]);
    expect(withHidden(parseLayout({ pinned: ["ticker"] }), "ticker", fields)).toMatchObject({
      columns: ["position_id", "fund", "sector", "price"],
      pinned: [],
    });
    expect(withPinned(withPinned(base, "price", true), "fund", true).pinned).toStrictEqual([
      "price",
      "fund",
    ]);
    expect(withTitle(base, "fund", " Fund ").titles).toStrictEqual({ fund: "Fund" });
    expect(withTitle(withTitle(base, "fund", "Fund"), "fund", "").titles).toStrictEqual({});
  });

  test("total a column by the aggregates its kind takes", () => {
    const totalled = withTotal(base, "price", "sum");
    expect(totalOf(totalled, "price")).toBe("sum");
    expect(totalOf(withTotal(totalled, "price", null), "price")).toBeNull();
    expect(totalChoices("text")).toStrictEqual(["count", "distinct_count"]);
    expect(totalChoices("date")).toStrictEqual(["min", "max", "count", "distinct_count"]);
  });

  test("read a typed filter value exactly", () => {
    expect(filterValue("float", " 1.5 ")).toBe(1.5);
    expect(filterValue("decimal", "12345678901234567890.12")).toBe("12345678901234567890.12");
    expect(filterValue("boolean", "TRUE")).toBe(true);
    expect(filterValue("text", " a ")).toBe(" a ");
    expect(filterValue("integer", "  ")).toBeNull();
  });
});

describe("column order and totals", () => {
  test("move a column within its zone", () => {
    const layout = parseLayout({
      columns: ["position_id", "fund", "ticker", "price"],
      pinned: ["price"],
    });
    const moved = withColumnBefore(layout, fields, { before: "position_id", column: "ticker" });
    expect(shownColumns(moved, fields)).toStrictEqual(["price", "ticker", "position_id", "fund"]);
    const last = withColumnBefore(layout, fields, { before: null, column: "position_id" });
    expect(shownColumns(last, fields)).toStrictEqual(["price", "fund", "ticker", "position_id"]);
    const two = withPinned(layout, "fund", true);
    expect(withColumnBefore(two, fields, { before: "price", column: "fund" }).pinned).toStrictEqual(
      ["fund", "price"],
    );
  });

  test("show a hidden column last, and give a grid without totals sums of its numbers", () => {
    const layout = parseLayout({ columns: ["position_id", "fund"] });
    expect(withShown(layout, fields, { column: "price", shown: true }).columns).toStrictEqual([
      "position_id",
      "fund",
      "price",
    ]);
    expect(withShown(layout, fields, { column: "fund", shown: false }).columns).toStrictEqual([
      "position_id",
    ]);
    // No number is summed on its own: the totals row counts the rows, under the first column shown.
    const counted = defaultTotals(parseLayout({ columns: ["fund", "price"] }), fields);
    expect(counted.totals.map((total) => [total.column, total.aggregate])).toStrictEqual([
      ["fund", "count"],
    ]);
    expect(
      defaultTotals(layout, fields).totals.map((total) => [total.column, total.aggregate]),
    ).toStrictEqual([["position_id", "count"]]);
  });
});

describe("grouping a grid", () => {
  test("groups by columns, keeping rows under their groups, and ungroups back to a list", () => {
    const one = withGroupedBy(parseLayout({ columns: ["fund", "ticker", "price"] }), "fund");
    expect(one).toMatchObject({ detail: true, expand_depth: 1, group_by: ["fund"] });
    const two = withGroupedBy(one, "ticker", 0);
    expect(two.group_by).toStrictEqual(["ticker", "fund"]);
    expect(withGroupedBy(two, "fund", 0).group_by).toStrictEqual(["fund", "ticker"]);
    expect(withoutGroup(two, "ticker")).toMatchObject({ detail: true, group_by: ["fund"] });
    expect(withoutGroup(one, "fund")).toMatchObject({
      detail: false,
      expand_depth: 0,
      group_by: [],
    });
    expect(withAllExpanded(two, false)).toMatchObject({ expand_depth: 0, expanded: [] });
    expect(withAllExpanded(two, true).expand_depth).toBe(2);
  });
});

describe("a header click's sort", () => {
  test("cycles a column's sort, and Shift adds it to the others", () => {
    const flat = parseLayout({ columns: ["fund", "price"] });
    const once = sortedBy(flat, 0, { additive: false, name: "fund" });
    expect(once.sort).toStrictEqual([{ column: "fund", descending: false }]);
    expect(sortedBy(once, 0, { additive: false, name: "fund" }).sort).toStrictEqual([
      { column: "fund", descending: true },
    ]);
    const both = sortedBy(once, 1, { additive: true, name: "price" });
    expect(both.sort).toStrictEqual([
      { column: "fund", descending: false },
      { column: "price", descending: false },
    ]);
    expect(sortMarkOf(both, 1, "price")).toStrictEqual({ descending: false, priority: 2 });
  });

  test("sorts a pivot's groups by a measure, largest last, then first, then by their keys", () => {
    const pivot = parseLayout({
      group_by: ["fund"],
      measures: [{ aggregate: "count_all" }, { aggregate: "count_all" }],
    });
    const once = sortedBy(pivot, 3, { additive: false, name: "" });
    expect(once.group_sort).toStrictEqual({ by: { measure: 1 }, descending: false });
    const twice = sortedBy(once, 3, { additive: false, name: "" });
    expect(sortMarkOf(twice, 1, "")).toStrictEqual({ descending: true, priority: null });
    expect(sortedBy(twice, 3, { additive: false, name: "" }).group_sort).toStrictEqual({
      by: "key",
      descending: false,
    });
    expect(sortedBy(pivot, -1, { additive: false, name: "" }).group_sort).toStrictEqual({
      by: "key",
      descending: true,
    });
  });
});
