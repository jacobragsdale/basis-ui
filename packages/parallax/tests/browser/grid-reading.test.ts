import "@basis/ui/styles.css";

import { Float64, Table, Utf8, tableToIPC, vectorFromArray } from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { pressAt, renderGrid } from "./grid-helpers.tsx";

/** The middle of the first row, under the 30 px header of the compact density, the default. */
const firstRow = 42;
const rows = 2000;

/** 2,000 bonds, far more rows than the grid holds on screen: yields of 1% to 20.99% and par of 1 to 2,000 million. */
function bondsBytes(): ArrayBuffer {
  const ids = Array.from({ length: rows }, (_unused, i) => `B${String(i)}`);
  const table = new Table({
    id: vectorFromArray(ids, new Utf8()),
    par: vectorFromArray(
      ids.map((_id, i) => (i + 1) * 1_000_000),
      new Float64(),
    ),
    yield: vectorFromArray(
      ids.map((_id, i) => 0.01 + (i % 2000) / 10_000),
      new Float64(),
    ),
  });
  return new Uint8Array(tableToIPC(table, "stream")).buffer;
}

describe("The status bar's reading of a selection", () => {
  test("writes its figures in the format the selected column is shown in", async () => {
    const { grid, screen } = await renderGrid({
      layout: { formats: { market_value: { decimals: 1, percent: true } } },
    });
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
    await expect
      .element(screen.getByRole("status", { name: "Selected numbers" }))
      .toHaveAttribute(
        "title",
        "Avg 15,037.5%, Min 10,050.0%, Max 20,025.0%, Sum 30,075.0%, Count 2",
      );
  });

  test("fetches the rows a selection needs that the grid does not hold", async () => {
    const { grid, screen } = await renderGrid(
      {
        layout: { formats: { par: { abbreviate: "millions", suffixes: "par" } } },
        source: bondsBytes,
      },
      String(rows),
    );
    await pressAt(grid, { x: 40, y: firstRow });
    // Par is the second column; Ctrl+Shift+Down selects it to the last bond, most of which are off the screen.
    await userEvent.keyboard("{ArrowRight}{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
    await expect
      .element(screen.getByRole("status", { name: "Selected numbers" }))
      .toHaveAttribute(
        "title",
        "Avg 1,000.5MM, Min 1.0MM, Max 2,000.0MM, Sum 2,001,000.0MM, Count 2,000",
      );
  });
});
