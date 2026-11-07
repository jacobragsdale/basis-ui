import { describe, expect, test } from "vite-plus/test";

import { clampCell, contains, moveFocus, rangeOf, selectAll, toTsv } from "#grid/selection.ts";
import { missingWindow, wholeCells, windowFor } from "#grid/window.ts";

const extent = { columns: 5, rows: 100, tree: true };

describe("selection", () => {
  test("normalizes a range whichever way it was dragged", () => {
    const range = rangeOf({ anchor: { column: 3, row: 9 }, focus: { column: -1, row: 2 } });
    expect(range).toStrictEqual({ bottom: 9, left: -1, right: 3, top: 2 });
    expect(contains(range, { column: -1, row: 5 })).toBe(true);
    expect(contains(range, { column: 0, row: 10 })).toBe(false);
  });

  test("moves the focus within the view, extending only with Shift", () => {
    const at = { anchor: { column: 1, row: 5 }, focus: { column: 1, row: 5 } };
    expect(moveFocus(at, { columns: 0, extend: false, rows: 1 }, extent)).toStrictEqual({
      anchor: { column: 1, row: 6 },
      focus: { column: 1, row: 6 },
    });
    expect(moveFocus(at, { columns: 1, extend: true, rows: 1 }, extent)).toStrictEqual({
      anchor: { column: 1, row: 5 },
      focus: { column: 2, row: 6 },
    });
    expect(
      moveFocus(at, { columns: -1000, extend: false, rows: -1000 }, extent).focus,
    ).toStrictEqual({ column: -1, row: 0 });
    expect(moveFocus(at, { columns: 1000, extend: false, rows: 1000 }, extent).focus).toStrictEqual(
      { column: 4, row: 99 },
    );
  });

  test("has no group column in a flat view", () => {
    expect(clampCell({ column: -1, row: 0 }, { columns: 2, rows: 3, tree: false })).toStrictEqual({
      column: 0,
      row: 0,
    });
    expect(selectAll({ columns: 2, rows: 3, tree: false })).toStrictEqual({
      anchor: { column: 0, row: 0 },
      focus: { column: 1, row: 2 },
    });
  });

  test("joins cells with tabs and rows with CRLF, quoting as Excel does", () => {
    expect(
      toTsv([
        ["a", "1234567.891"],
        ["b", ""],
      ]),
    ).toBe("a\t1234567.891\r\nb\t");
    expect(toTsv([['say "hi"', "two\tcells", "two\nlines"]])).toBe(
      '"say ""hi"""\t"two\tcells"\t"two\nlines"',
    );
  });
});

/** What a frame says of its view's size. */
function totals(
  totalRows: number,
  totalColumns: number,
): { readonly totalRows: number; readonly totalColumns: number } {
  return { totalColumns, totalRows };
}

describe("the window a grid asks for", () => {
  const visible = { columnCount: 6, firstColumn: 3, firstRow: 100, rowCount: 30 };

  test("is what is in view and a margin, before the view's size is known or for a large view", () => {
    const margined = { columnCount: 10, firstColumn: 1, firstRow: 60, rowCount: 110 };
    expect(windowFor(visible, null)).toStrictEqual(margined);
    expect(windowFor(visible, totals(1_000_000, 15))).toStrictEqual(margined);
    expect(windowFor(visible, totals(wholeCells / 4 + 1, 4))).toStrictEqual(margined);
  });

  test("is the whole of a small view, with rows to spare up to the cell budget", () => {
    // 300 rows by 15 columns is 4,500 cells.
    expect(windowFor(visible, totals(300, 15))).toStrictEqual({
      columnCount: 15,
      firstColumn: 0,
      firstRow: 0,
      rowCount: Math.floor(wholeCells / 15),
    });
    // A search that left five rows still asks for room to clear it.
    expect(windowFor({ ...visible, firstRow: 0 }, totals(5, 15)).rowCount).toBe(
      Math.floor(wholeCells / 15),
    );
    expect(windowFor(visible, totals(wholeCells / 4, 4))).toStrictEqual({
      columnCount: 11,
      firstColumn: 0,
      firstRow: 0,
      rowCount: wholeCells / 4,
    });
  });

  test("is nothing when the window asked for last holds what is in view", () => {
    expect(missingWindow(visible, null, windowFor(visible, null))).toBeNull();
    expect(
      missingWindow({ ...visible, firstRow: 5000 }, null, windowFor(visible, null)),
    ).toStrictEqual(windowFor({ ...visible, firstRow: 5000 }, null));
  });
});
