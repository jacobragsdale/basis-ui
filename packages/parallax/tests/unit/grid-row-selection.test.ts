/* Row selection's rules: where the key column is, or why rows cannot be chosen; checking and unchecking keys; what the
 * header's checkbox shows; and the checkbox column's place at the grid's left edge. The browser tests check rows on a
 * real grid. */

import { describe, expect, test } from "vite-plus/test";

import {
  columnAt,
  defaultWidth,
  flatGeometry,
  selectColumn,
  windowColumns,
} from "#grid/geometry.ts";
import type { SourceField } from "#grid/fields.ts";
import { keyColumn, RowChoice, toggled, withKeys } from "#grid/row-selection.ts";
import { parseLayout } from "#layout/layout.ts";

const fields: readonly SourceField[] = [
  { kind: "integer", name: "trade_id" },
  { kind: "text", name: "fund" },
  { kind: "decimal", name: "par" },
];

describe(keyColumn, () => {
  test("finds the key among the columns the view shows, pinned ones first", () => {
    expect(keyColumn(parseLayout({}), fields, "par")).toStrictEqual({ index: 2, ok: true });
    expect(keyColumn(parseLayout({ pinned: ["par"] }), fields, "par")).toStrictEqual({
      index: 0,
      ok: true,
    });
  });

  test("says why rows cannot be chosen: a hidden key column, or a pivot", () => {
    expect(keyColumn(parseLayout({ columns: ["fund"] }), fields, "trade_id")).toStrictEqual({
      ok: false,
      reason: "Rows cannot be selected while the trade_id column is hidden.",
    });
    const pivot = parseLayout({
      group_by: ["fund"],
      measures: [{ aggregate: "sum", column: "par" }],
    });
    expect(keyColumn(pivot, fields, "trade_id")).toStrictEqual({
      ok: false,
      reason: "A pivot's rows are groups, which cannot be selected.",
    });
  });

  test("waits, saying nothing, until the view has a layout and columns", () => {
    expect(keyColumn(null, fields, "par")).toStrictEqual({ ok: false, reason: "" });
    expect(keyColumn(parseLayout({}), [], "par")).toStrictEqual({ ok: false, reason: "" });
  });
});

describe("checking keys", () => {
  test("toggles one key, keeping the order they were chosen in", () => {
    const chosen = new Set(["7", "3"]);
    expect(toggled(chosen, "5")).toStrictEqual(["7", "3", "5"]);
    expect(toggled(chosen, "7")).toStrictEqual(["3"]);
  });

  test("adds a range's keys after those already chosen, once each", () => {
    expect(withKeys(new Set(["7", "3"]), ["3", "4", "5"])).toStrictEqual(["7", "3", "4", "5"]);
  });

  test("shows none, some or all in the header, and some once the keys are not those it checked", () => {
    const choice = new RowChoice();
    expect(choice.header).toBe("none");
    expect(choice.replace(["1", "2"])).toBe(true);
    expect(choice.header).toBe("some");
    choice.checkedAll(["1", "2"]);
    expect(choice.replace(["2", "1"])).toBe(false);
    expect(choice.header).toBe("all");
    choice.replace(["1"]);
    expect([choice.header, choice.has("1"), choice.has(null)]).toStrictEqual(["some", true, false]);
  });

  test("shows all in the header when the app gives back, a render later, the keys it checked", () => {
    const choice = new RowChoice();
    choice.checkedAll(["1", "2"]);
    expect(choice.header).toBe("none");
    choice.replace(["2", "1"]);
    expect(choice.header).toBe("all");
    choice.checkedAll(null);
    expect(choice.header).toBe("some");
  });
});

describe("the checkbox column", () => {
  const geometry = flatGeometry(
    3,
    {},
    { names: ["fund", "par", "trade_id"], selectPx: 32, treePx: 200 },
  );

  test("sits at the left edge, before the group column and the data columns", () => {
    expect(geometry.x(0)).toBe(232);
    expect([
      columnAt(geometry, 10, 0),
      columnAt(geometry, 40, 0),
      columnAt(geometry, 240, 0),
    ]).toStrictEqual([selectColumn, -1, 0]);
    expect(geometry.contentWidth).toBe(232 + 3 * defaultWidth);
  });

  test("keeps the key column in the window, wherever the view is scrolled", () => {
    const flat = flatGeometry(10, {}, { names: [] });
    expect(windowColumns(flat, { scrollLeft: 0, width: 300 }, null)).toStrictEqual({
      columnCount: 3,
      firstColumn: 0,
    });
    expect(windowColumns(flat, { scrollLeft: 0, width: 300 }, 8)).toStrictEqual({
      columnCount: 9,
      firstColumn: 0,
    });
    expect(windowColumns(flat, { scrollLeft: 1000, width: 300 }, 1)).toStrictEqual({
      columnCount: 9,
      firstColumn: 1,
    });
  });
});
