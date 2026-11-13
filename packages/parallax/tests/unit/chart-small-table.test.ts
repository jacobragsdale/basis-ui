import { describe, expect, test } from "vite-plus/test";

import { smallTable, tableContent } from "#chart/small-table.ts";

/** The table of one column of `values`, or why there is none. */
function tableOf(values: readonly unknown[]): ReturnType<typeof smallTable> {
  return smallTable(
    tableContent(
      values.map((value) => ({ value })),
      ["value"],
    ),
  );
}

describe("a small chart's table", () => {
  test("is the same for rows of the same plotted content, and reads only the columns plotted", () => {
    const rows = [{ desk: { name: "Atlas" }, exposure: 3, sector: "Rates" }];
    const rebuilt = [{ desk: { name: "Boreal" }, exposure: 3, sector: "Rates" }];
    expect(tableContent(rows, ["sector", "exposure"])).toBe(
      tableContent(rebuilt, ["sector", "exposure"]),
    );
    expect(smallTable(tableContent(rows, ["sector", "exposure"])).problem).toBeNull();
  });

  test("types each column by its values, absent and non-finite values missing", () => {
    const table = smallTable(
      tableContent(
        [
          { day: "2026-11-12", on: true, pnl: 1, sector: "Rates" },
          { day: null, on: false, pnl: Number.NaN, sector: "Credit" },
          { on: null, pnl: Number.POSITIVE_INFINITY },
        ],
        ["day", "on", "pnl", "sector"],
      ),
    );
    expect([table.problem, table.kinds]).toStrictEqual([
      null,
      { day: "date", on: "boolean", pnl: "number", sector: "text" },
    ]);
    expect(table.xValues).toStrictEqual(["2026-11-12", null, null]);
  });

  test("refuses a date that is no day, rather than read it as another", () => {
    for (const day of ["0000-00-00", "2026-13-01", "2026-02-30"]) {
      expect(tableOf(["2026-11-12", day]).problem).toBe(
        `Column value holds "${day}" in row 2, which is not a day: give its dates as YYYY-MM-DD`,
      );
    }
    expect(tableOf(["2024-02-29"]).kinds).toStrictEqual({ value: "date" });
  });

  test("refuses values of several kinds, or of none a chart draws, rather than throw", () => {
    expect(tableOf([3, "N/A"]).problem).toMatch(
      /^Column value mixes kinds of value, such as "N\/A" in row 2/u,
    );
    expect(tableOf([{ amount: 3 }]).problem).toMatch(
      /^Column value holds \{"amount":3\} in row 1/u,
    );
    expect(tableOf([3, "N/A"]).bytes).toBeNull();
  });
});
