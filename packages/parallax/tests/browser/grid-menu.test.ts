/* A right click's menu on the grid's cells, the events an app hears of them, and the handle's cell methods: Filter by
 * keeps the rows of a cell's value, an app's items follow the grid's, a click, a double click and Enter reach the app,
 * and the handle scrolls to a cell and gives the selection. Rows are 24 px under a 30 px header. */

import "@basis/ui/styles.css";

import { createRef } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { GridCell, GridRow } from "#grid/events.ts";
import type { GridHandle } from "#grid/use-grid-handles.ts";

import { canvasOf, pressAt, renderGrid } from "./grid-helpers.tsx";

const rowY = (row: number): number => 42 + row * 24;
/** A cell of the desk column, the first. */
const x = 40;

describe("Grid's menu on its cells", () => {
  test("opens at a right click, and Filter by keeps the rows of the cell's value", async () => {
    const { grid, screen, changes } = await renderGrid();
    await userEvent.click(canvasOf(grid), { button: "right", position: { x, y: rowY(0) } });
    await screen.getByRole("menuitem", { name: "Filter by Rates" }).click();
    await expect
      .poll(() => changes.at(-1)?.filters)
      .toStrictEqual([{ column: "desk", columns: [], op: "eq", value: "Rates", values: [] }]);
  });

  test("ends with the app's items, and tells the app which cell it opened on", async () => {
    const onSelect = vi.fn<() => void>();
    const opened: (GridCell | null)[] = [];
    const { grid, screen } = await renderGrid({
      grid: {
        contextMenuItems: (cell) => [{ label: `Book ${cell?.text ?? ""}`, onSelect }],
        onContextMenu: (cell) => {
          opened.push(cell);
        },
      },
    });
    await userEvent.click(canvasOf(grid), { button: "right", position: { x, y: rowY(1) } });
    await screen.getByRole("menuitem", { name: "Book Credit" }).click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(opened.at(-1)).toMatchObject({ column: "desk", row: 1, text: "Credit" });
  });
});

describe("Grid's cell events", () => {
  test("tells the app of a click on a cell, and of a row a double click or Enter activates", async () => {
    const clicked: GridCell[] = [];
    const activated: GridRow[] = [];
    const { grid } = await renderGrid({
      grid: {
        onCellClick: (cell) => {
          clicked.push(cell);
        },
        onRowActivate: (row) => {
          activated.push(row);
        },
      },
    });
    await pressAt(grid, { x, y: rowY(2) });
    await expect
      .poll(() => clicked.at(-1))
      .toMatchObject({ column: "desk", link: false, row: 2, text: "Rates" });
    await userEvent.dblClick(canvasOf(grid), { position: { x, y: rowY(3) } });
    await expect.poll(() => activated.at(-1)).toStrictEqual({ key: null, row: 3 });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.poll(() => activated.at(-1)).toStrictEqual({ key: null, row: 4 });
  });

  test("scrolls to a cell through its handle, selects it, and gives the selection", async () => {
    const gridRef = createRef<GridHandle>();
    await renderGrid({ gridRef });
    gridRef.current?.scrollTo(4, "market_value");
    await expect
      .poll(() => gridRef.current?.getSelection())
      .toStrictEqual({ bottom: 4, columns: ["market_value"], top: 4 });
  });
});
