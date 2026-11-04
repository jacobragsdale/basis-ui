import { describe, expect, it } from "vitest";

import type { FrameData } from "../frame";
import { WHOLE_CELLS, windowFor } from "./grid-source";

function frame(totalRows: number, totalColumns: number): FrameData {
  return { viewId: 1, configVersion: 1n, loadVersion: 1n, firstRow: 0, firstColumn: 0, rowCount: 0, totalRows, totalColumns, sourceAsOfMicros: 0n, pushed: false, columns: [], groups: [], tree: null };
}

describe("windowFor", () => {
  const visible = { firstRow: 100, rowCount: 30, firstColumn: 3, columnCount: 6 };

  it("asks for what is in view and a margin before the view's size is known", () => {
    expect(windowFor(visible, null)).toEqual({ firstRow: 60, rowCount: 110, firstColumn: 1, columnCount: 10 });
  });

  it("asks for a small view whole, with rows to spare up to the cell budget", () => {
    // 300 rows by 15 columns is 4,500 cells.
    expect(windowFor(visible, frame(300, 15))).toEqual({ firstRow: 0, rowCount: Math.floor(WHOLE_CELLS / 15), firstColumn: 0, columnCount: 15 });
    // A search that left five rows still asks for room to clear it.
    expect(windowFor({ ...visible, firstRow: 0 }, frame(5, 15)).rowCount).toBe(Math.floor(WHOLE_CELLS / 15));
    // A view at the budget is still small; every row is asked for.
    expect(windowFor(visible, frame(WHOLE_CELLS / 4, 4))).toEqual({ firstRow: 0, rowCount: WHOLE_CELLS / 4, firstColumn: 0, columnCount: 11 });
  });

  it("asks for what is in view and a margin of a larger view", () => {
    expect(windowFor(visible, frame(1_000_000, 15))).toEqual({ firstRow: 60, rowCount: 110, firstColumn: 1, columnCount: 10 });
    expect(windowFor(visible, frame(WHOLE_CELLS / 4 + 1, 4))).toEqual({ firstRow: 60, rowCount: 110, firstColumn: 1, columnCount: 10 });
  });
});
