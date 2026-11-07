import { describe, expect, test } from "vite-plus/test";

import type { SourceField } from "#grid/fields.ts";
import { parseLayout } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";
import { drillLayout, drillSource } from "#pivot/drill.ts";
import {
  areasOf,
  chipColumn,
  moveChip,
  placeField,
  removeChip,
  setExpandDepth,
  topN,
  withField,
  withoutField,
} from "#pivot/edit.ts";
import type { Placed, Target } from "#pivot/edit.ts";
import {
  addMeasure,
  measure,
  measureSort,
  moveMeasure,
  removeMeasure,
  withMeasureFormat,
  withMeasureSort,
} from "#pivot/measures.ts";

const base = parseLayout({
  column_widths: {
    "2024": 90,
    "__measure:0": 100,
    "__measure:1": 110,
    "__measure:2": 120,
    __tree: 300,
  },
  dataset: "positions",
  expanded: [{ expanded: false, path: ["Atlas"] }],
  group_by: ["fund", "strategy"],
  group_sort: { by: { measure: 1 }, descending: true },
  having: [
    { measure: 0, op: "gt", value: 0 },
    { measure: 2, op: "ge", value: 10 },
  ],
  measures: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
    { aggregate: "count_all" },
  ],
  split_by: ["asset_class"],
  top_n: topN(5, 2),
});

const fields: readonly SourceField[] = [
  { kind: "text", name: "fund" },
  { kind: "text", name: "strategy" },
  { kind: "text", name: "asset_class" },
  { kind: "float", name: "market_value_usd" },
  { kind: "float", name: "daily_pnl_usd" },
  { kind: "decimal", name: "quantity" },
];

function field(name: string): SourceField {
  return fields.find((entry) => entry.name === name) ?? { kind: "text", name };
}

/** A chip of the rows. */
function rows(index: number): Placed {
  return { area: "rows", index };
}

/** Moves a chip as a drop does. */
function move(layout: Layout, from: Placed, to: Target): Layout {
  return moveChip(layout, { from, to }, fields);
}

describe("row and column groups", () => {
  test("move and leave, and the row groups' expanded paths are forgotten when they change", () => {
    const added = placeField(base, field("asset_class"), { area: "rows", at: null });
    expect(added).toMatchObject({ expanded: [], group_by: ["fund", "strategy", "asset_class"] });
    expect(move(base, { area: "rows", index: 1 }, { area: "rows", at: 0 }).group_by).toStrictEqual([
      "strategy",
      "fund",
    ]);
    expect(removeChip(base, { area: "rows", index: 0 }).group_by).toStrictEqual(["strategy"]);
  });

  test("keep the expanded paths when only the column groups change", () => {
    const changed = placeField(base, field("quantity"), { area: "columns", at: null });
    expect(changed.split_by).toStrictEqual(["asset_class", "quantity"]);
    expect(changed.expanded).toStrictEqual(base.expanded);
  });
});

describe("measures", () => {
  test("removing one drops what named it and renumbers the rest", () => {
    const removed = removeMeasure(base, 1);
    expect(removed.measures.map((entry) => entry.column)).toStrictEqual(["market_value_usd", null]);
    expect(removed.group_sort).toStrictEqual({ by: "key", descending: false });
    expect(removed.having).toStrictEqual([
      { measure: 0, op: "gt", value: 0 },
      { measure: 1, op: "ge", value: 10 },
    ]);
    expect(removed.top_n?.measure).toBe(1);
    expect(removed.column_widths).toStrictEqual({
      "2024": 90,
      "__measure:0": 100,
      "__measure:1": 120,
      __tree: 300,
    });
  });

  test("removing the top-N measure clears top-N", () => {
    expect(removeMeasure(base, 2).top_n).toBeNull();
  });

  test("moving one carries its sort, filters and width with it", () => {
    const moved = moveMeasure(base, 1, -1);
    expect(moved.measures.map((entry) => entry.column)).toStrictEqual([
      "daily_pnl_usd",
      "market_value_usd",
      null,
    ]);
    expect(moved.group_sort).toStrictEqual({ by: { measure: 0 }, descending: true });
    expect(moved.having[0]).toStrictEqual({ measure: 1, op: "gt", value: 0 });
    expect(moved.column_widths).toStrictEqual({
      "2024": 90,
      "__measure:0": 110,
      "__measure:1": 100,
      "__measure:2": 120,
      __tree: 300,
    });
    expect(moveMeasure(base, 0, -1)).toBe(base);
  });

  test("adds with defaults the schema accepts", () => {
    const added = addMeasure(base, measure("percentile", "price_local"));
    expect(parseLayout(added).measures[3]).toStrictEqual({
      aggregate: "percentile",
      column: "price_local",
      format: null,
      percentile: 0.5,
      show_as: "value",
      unit_column: null,
      weight: null,
    });
  });

  test("format one, and back at every default it has no format", () => {
    const millions = withMeasureFormat(base, 0, { abbreviate: "millions", decimals: 1 });
    expect(millions.measures[0]?.format).toMatchObject({
      abbreviate: "millions",
      decimals: 1,
      negative: "minus",
    });
    const plain = withMeasureFormat(millions, 0, { abbreviate: null, decimals: null });
    expect(plain.measures[0]?.format).toBeNull();
  });

  test("sort the groups by one, or by their keys again", () => {
    expect(measureSort(base, 1)).toBe("descending");
    expect(measureSort(base, 0)).toBeNull();
    const ascending = withMeasureSort(base, 0, false);
    expect(measureSort(ascending, 0)).toBe("ascending");
    expect(withMeasureSort(ascending, 0, null).group_sort).toStrictEqual({
      by: "key",
      descending: false,
    });
  });
});

test("setting the expand depth forgets groups opened by hand", () => {
  expect(setExpandDepth(base, 2)).toMatchObject({ expand_depth: 2, expanded: [] });
});

describe("drillLayout", () => {
  test("filters to the group's rows, keeping the pivot's filters and formats", () => {
    const withFilter = parseLayout({
      ...base,
      filters: [{ column: "currency", op: "eq", value: "USD" }],
      formats: { market_value_usd: { decimals: 0 } },
    });
    const drilled = drillLayout(withFilter, ["Atlas", null]);
    expect(drilled.group_by).toStrictEqual([]);
    expect(drilled.measures).toStrictEqual([]);
    expect(drilled.filters).toStrictEqual([
      { column: "currency", columns: [], op: "eq", value: "USD", values: [] },
      { column: "fund", columns: [], op: "eq", value: "Atlas", values: [] },
      { column: "strategy", columns: [], op: "is_null", value: null, values: [] },
    ]);
    expect(drilled.formats).toStrictEqual(withFilter.formats);
    expect(drilled.dataset).toBe("positions");
    expect(parseLayout(drilled)).toStrictEqual(drilled);
  });

  test("adds the pivot values of a cell under column pivots", () => {
    const drilled = drillLayout(base, ["Atlas"], ["Bond"]);
    expect(drilled.filters.slice(-2)).toStrictEqual([
      { column: "fund", columns: [], op: "eq", value: "Atlas", values: [] },
      { column: "asset_class", columns: [], op: "eq", value: "Bond", values: [] },
    ]);
  });

  test("drills into every row for the grand total", () => {
    expect(drillLayout(base, []).filters).toStrictEqual(base.filters);
  });

  test("its rows change with the pivot's groups and filters, not its values or widths", () => {
    expect(drillSource(removeMeasure(base, 0))).toBe(drillSource(base));
    expect(drillSource(setExpandDepth(base, 1))).toBe(drillSource(base));
    expect(drillSource(removeChip(base, { area: "rows", index: 1 }))).not.toBe(drillSource(base));
  });
});

describe("the field list", () => {
  test("puts a field in an area: a group leaves the other axis, and a value is a new sum or count", () => {
    expect(placeField(base, field("asset_class"), { area: "rows", at: 1 })).toMatchObject({
      expanded: [],
      group_by: ["fund", "asset_class", "strategy"],
      split_by: [],
    });
    expect(placeField(base, field("fund"), { area: "rows", at: null }).group_by).toStrictEqual([
      "strategy",
      "fund",
    ]);
    const valued = placeField(base, field("quantity"), { area: "values", at: 0 });
    expect(valued.measures.map((entry) => [entry.aggregate, entry.column])).toStrictEqual([
      ["sum", "quantity"],
      ["sum", "market_value_usd"],
      ["sum", "daily_pnl_usd"],
      ["count_all", null],
    ]);
    // Measures named by position follow: the sort was by measure 1 and top-N by measure 2.
    expect(valued.group_sort.by).toStrictEqual({ measure: 2 });
    expect(valued.top_n?.measure).toBe(3);
    expect(
      placeField(base, field("fund"), { area: "values", at: null }).measures.at(-1),
    ).toMatchObject({ aggregate: "count", column: "fund" });
  });

  test("moves chips within an area and between areas, as the drop point shows them", () => {
    expect(move(base, rows(0), { area: "rows", at: null }).group_by).toStrictEqual([
      "strategy",
      "fund",
    ]);
    expect(move(base, rows(1), { area: "rows", at: 0 }).group_by).toStrictEqual([
      "strategy",
      "fund",
    ]);
    expect(move(base, rows(0), { area: "rows", at: 1 })).toBe(base);
    expect(move(base, rows(1), { area: "columns", at: 0 })).toMatchObject({
      group_by: ["fund"],
      split_by: ["strategy", "asset_class"],
    });
    const counted = move(base, { area: "values", index: 2 }, { area: "values", at: 0 });
    expect(counted.measures.map((entry) => entry.aggregate)).toStrictEqual([
      "count_all",
      "sum",
      "sum",
    ]);
  });

  test("moves a value to the rows as a group, but not a count of rows, which has no column", () => {
    const grouped = move(base, { area: "values", index: 1 }, { area: "rows", at: null });
    expect(grouped.group_by).toStrictEqual(["fund", "strategy", "daily_pnl_usd"]);
    expect(grouped.measures).toHaveLength(2);
    expect(chipColumn(base, { area: "values", index: 2 })).toBeNull();
    expect(move(base, { area: "values", index: 2 }, { area: "rows", at: null })).toBe(base);
  });

  test("ticks a field into Rows or Values, and unticking takes it out of every area", () => {
    expect(withField(base, field("asset_class"))).toMatchObject({
      group_by: ["fund", "strategy", "asset_class"],
      split_by: [],
    });
    expect(withField(base, field("quantity")).measures).toHaveLength(4);
    const filtered = parseLayout({
      ...base,
      filters: [{ column: "fund", op: "eq", value: "Atlas" }],
    });
    expect(areasOf(filtered, "fund")).toStrictEqual(["rows", "filters"]);
    expect(areasOf(base, "market_value_usd")).toStrictEqual(["values"]);
    expect(withoutField(filtered, "fund")).toMatchObject({ filters: [], group_by: ["strategy"] });
    expect(
      withoutField(base, "market_value_usd").measures.map((entry) => entry.column),
    ).toStrictEqual(["daily_pnl_usd", null]);
  });

  test("unticking a field also takes away the measures weighted by it", () => {
    const weighted = parseLayout({
      ...base,
      measures: [{ aggregate: "weighted_mean", column: "market_value_usd", weight: "quantity" }],
    });
    expect(withoutField(weighted, "quantity").measures).toStrictEqual([]);
  });
});
