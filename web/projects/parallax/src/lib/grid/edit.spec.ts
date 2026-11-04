import { describe, expect, it } from "vitest";

import { parseLayout } from "../layout";
import type { LayoutFilter } from "../layout";
import { filterLabel, highlightRanges, searchColumns, shownColumns, withoutFilter, withoutFilters } from "./edit";
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
