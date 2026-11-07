import { describe, expect, it } from "vitest";

import { parseLayout } from "../layout";
import type { SourceField } from "../grid/grid-source";
import {
  addGroup,
  addMeasure,
  areasOf,
  drillLayout,
  filterValue,
  measure,
  measureSort,
  moveChip,
  moveGroup,
  moveMeasure,
  operandOf,
  placeField,
  removeGroup,
  removeMeasure,
  setExpandDepth,
  withField,
  withMeasureFormat,
  withMeasureSort,
  withoutField
} from "./edit";

const base = parseLayout({
  dataset: "positions",
  group_by: ["fund", "strategy"],
  split_by: ["asset_class"],
  measures: [{ column: "market_value_usd", aggregate: "sum" }, { column: "daily_pnl_usd", aggregate: "sum" }, { aggregate: "count_all" }],
  group_sort: { by: { measure: 1 }, descending: true },
  having: [
    { measure: 0, op: "gt", value: 0 },
    { measure: 2, op: "ge", value: 10 }
  ],
  top_n: { n: 5, measure: 2 },
  expanded: [{ path: ["Atlas"], expanded: false }],
  column_widths: { "__measure:0": 100, "__measure:1": 110, "__measure:2": 120, __tree: 300, "2024": 90 }
});

describe("row and column groups", () => {
  it("adds, moves and removes, and forgets expanded rows when the row groups change", () => {
    const added = addGroup(base, "group_by", "sector");
    expect(added.group_by).toEqual(["fund", "strategy", "sector"]);
    expect(added.expanded).toEqual([]);
    expect(addGroup(base, "group_by", "fund")).toBe(base);
    expect(moveGroup(base, "group_by", 1, -1).group_by).toEqual(["strategy", "fund"]);
    expect(moveGroup(base, "group_by", 0, -1).group_by).toEqual(["fund", "strategy"]);
    expect(removeGroup(base, "group_by", 0).group_by).toEqual(["strategy"]);
  });

  it("keeps expanded rows when only the column groups change", () => {
    const changed = addGroup(base, "split_by", "currency");
    expect(changed.split_by).toEqual(["asset_class", "currency"]);
    expect(changed.expanded).toEqual(base.expanded);
  });
});

describe("measures", () => {
  it("removing one drops what named it and renumbers the rest", () => {
    const removed = removeMeasure(base, 1);
    expect(removed.measures.map((m) => m.column)).toEqual(["market_value_usd", null]);
    expect(removed.group_sort).toEqual({ by: "key", descending: false });
    expect(removed.having).toEqual([
      { measure: 0, op: "gt", value: 0 },
      { measure: 1, op: "ge", value: 10 }
    ]);
    expect(removed.top_n?.measure).toBe(1);
    expect(removed.column_widths).toEqual({ "__measure:0": 100, "__measure:1": 120, __tree: 300, "2024": 90 });
  });

  it("removing the top-N measure clears top-N", () => {
    expect(removeMeasure(base, 2).top_n).toBeNull();
  });

  it("moving one carries its sort, filters and width with it", () => {
    const moved = moveMeasure(base, 1, -1);
    expect(moved.measures.map((m) => m.column)).toEqual(["daily_pnl_usd", "market_value_usd", null]);
    expect(moved.group_sort).toEqual({ by: { measure: 0 }, descending: true });
    expect(moved.having[0]).toEqual({ measure: 1, op: "gt", value: 0 });
    expect(moved.column_widths).toEqual({ "__measure:0": 110, "__measure:1": 100, "__measure:2": 120, __tree: 300, "2024": 90 });
    expect(moveMeasure(base, 0, -1)).toBe(base);
  });

  it("adds with defaults the schema accepts", () => {
    const added = addMeasure(base, measure("percentile", "price_local"));
    expect(parseLayout(added).measures[3]).toEqual({ column: "price_local", aggregate: "percentile", percentile: 0.5, weight: null, unit_column: null, show_as: "value", format: null });
  });
});

describe("filters", () => {
  it("reads typed text as the engine expects", () => {
    expect(filterValue("float", "1.5")).toBe(1.5);
    expect(filterValue("float", "inf")).toBe("inf");
    expect(filterValue("decimal", " 12345678901234567.89 ")).toBe("12345678901234567.89");
    expect(filterValue("integer", "9007199254740993")).toBe("9007199254740993");
    expect(filterValue("boolean", "TRUE")).toBe(true);
    expect(filterValue("text", " Atlas ")).toBe(" Atlas ");
    expect(filterValue("date", "")).toBeNull();
  });

  it("knows how many operands each operator takes", () => {
    expect(operandOf("in")).toBe("many");
    expect(operandOf("is_null")).toBe("none");
    expect(operandOf("contains")).toBe("one");
  });
});

it("setting the expand depth forgets groups opened by hand", () => {
  expect(setExpandDepth(base, 2)).toMatchObject({ expand_depth: 2, expanded: [] });
});

describe("drillLayout", () => {
  it("filters to the group's rows, keeping the pivot's filters and formats", () => {
    const withFilter = parseLayout({ ...base, filters: [{ column: "currency", op: "eq", value: "USD" }], formats: { market_value_usd: { decimals: 0 } } });
    const drilled = drillLayout(withFilter, ["Atlas", null]);
    expect(drilled.group_by).toEqual([]);
    expect(drilled.measures).toEqual([]);
    expect(drilled.filters).toEqual([
      { column: "currency", op: "eq", value: "USD", values: [], columns: [] },
      { column: "fund", op: "eq", value: "Atlas", values: [], columns: [] },
      { column: "strategy", op: "is_null", value: null, values: [], columns: [] }
    ]);
    expect(drilled.formats).toEqual(withFilter.formats);
    expect(drilled.dataset).toBe("positions");
    expect(parseLayout(drilled)).toEqual(drilled);
  });

  it("adds the pivot values of a cell under column pivots", () => {
    const drilled = drillLayout(base, ["Atlas"], ["Bond"]);
    expect(drilled.filters.slice(-2)).toEqual([
      { column: "fund", op: "eq", value: "Atlas", values: [], columns: [] },
      { column: "asset_class", op: "eq", value: "Bond", values: [], columns: [] }
    ]);
  });

  it("drills into every row for the grand total", () => {
    expect(drillLayout(base, []).filters).toEqual(base.filters);
  });
});

describe("the field list", () => {
  const fields: readonly SourceField[] = [
    { name: "fund", kind: "text" },
    { name: "strategy", kind: "text" },
    { name: "asset_class", kind: "text" },
    { name: "market_value_usd", kind: "float" },
    { name: "daily_pnl_usd", kind: "float" },
    { name: "quantity", kind: "decimal" }
  ];
  const field = (name: string): SourceField => fields.find((f) => f.name === name) ?? { name, kind: "text" };

  it("puts a field in an area: a group leaves the other axis, and a value is a new sum or count", () => {
    expect(placeField(base, field("asset_class"), "rows", 1)).toMatchObject({ group_by: ["fund", "asset_class", "strategy"], split_by: [], expanded: [] });
    expect(placeField(base, field("fund"), "rows", null).group_by).toEqual(["strategy", "fund"]);
    const valued = placeField(base, field("quantity"), "values", 0);
    expect(valued.measures.map((m) => [m.aggregate, m.column])).toEqual([
      ["sum", "quantity"],
      ["sum", "market_value_usd"],
      ["sum", "daily_pnl_usd"],
      ["count_all", null]
    ]);
    // Measures named by position follow: the sort was by measure 1 and top-N by measure 2.
    expect(valued.group_sort.by).toEqual({ measure: 2 });
    expect(valued.top_n?.measure).toBe(3);
    expect(placeField(base, field("fund"), "values").measures.at(-1)).toMatchObject({ aggregate: "count", column: "fund" });
  });

  it("moves chips within an area and between areas, as the drop point shows them", () => {
    expect(moveChip(base, { area: "rows", index: 0 }, "rows", null, fields).group_by).toEqual(["strategy", "fund"]);
    expect(moveChip(base, { area: "rows", index: 1 }, "rows", 0, fields).group_by).toEqual(["strategy", "fund"]);
    expect(moveChip(base, { area: "rows", index: 0 }, "rows", 1, fields)).toBe(base);
    expect(moveChip(base, { area: "rows", index: 1 }, "columns", 0, fields)).toMatchObject({ group_by: ["fund"], split_by: ["strategy", "asset_class"] });
    expect(moveChip(base, { area: "values", index: 2 }, "values", 0, fields).measures.map((m) => m.aggregate)).toEqual(["count_all", "sum", "sum"]);
    const grouped = moveChip(base, { area: "values", index: 1 }, "rows", null, fields);
    expect(grouped.group_by).toEqual(["fund", "strategy", "daily_pnl_usd"]);
    expect(grouped.measures).toHaveLength(2);
    // A count of rows has no column to group by.
    expect(moveChip(base, { area: "values", index: 2 }, "rows", null, fields)).toBe(base);
  });

  it("ticks a field into Rows or Values, and unticking takes it out of every area", () => {
    expect(withField(base, field("asset_class"))).toMatchObject({ group_by: ["fund", "strategy", "asset_class"], split_by: [] });
    expect(withField(base, field("quantity")).measures).toHaveLength(4);
    const filtered = { ...base, filters: [{ column: "fund", op: "eq" as const, value: "Atlas", values: [], columns: [] }] };
    expect(areasOf(filtered, "fund")).toEqual(["rows", "filters"]);
    expect(areasOf(base, "market_value_usd")).toEqual(["values"]);
    const without = withoutField(filtered, "fund");
    expect(without).toMatchObject({ group_by: ["strategy"], filters: [] });
    expect(withoutField(base, "market_value_usd").measures.map((m) => m.column)).toEqual(["daily_pnl_usd", null]);
  });

  it("formats a measure, and back at every default it has no format", () => {
    const millions = withMeasureFormat(base, 0, { abbreviate: "millions", decimals: 1 });
    expect(millions.measures[0]?.format).toMatchObject({ abbreviate: "millions", decimals: 1, negative: "minus" });
    expect(withMeasureFormat(millions, 0, { abbreviate: null, decimals: null }).measures[0]?.format).toBeNull();
  });

  it("sorts the groups by a measure, or by their keys again", () => {
    expect(measureSort(base, 1)).toBe("descending");
    expect(measureSort(base, 0)).toBeNull();
    const ascending = withMeasureSort(base, 0, false);
    expect(measureSort(ascending, 0)).toBe("ascending");
    expect(withMeasureSort(ascending, 0, null).group_sort).toEqual({ by: "key", descending: false });
  });
});
