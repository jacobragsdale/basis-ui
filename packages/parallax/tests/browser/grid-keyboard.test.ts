/* The keyboard's edges on a grid: with nothing selected a key selects the first cell and does nothing else; Alt with
 * an arrow is the browser's; Ctrl+Space is the header's checkbox; Enter on a link cell clicks it; Shift+F10 opens the
 * menu of the focused cell; and the focused cell says how its column sorts and filters. The positions' columns are
 * desk, fund and market value. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { GridCell, GridRow } from "#grid/events.ts";

import { pressAt, renderGrid } from "./grid-helpers.tsx";

/** A data cell's middle, past the checkboxes when there are some. */
const at = (row: number): { readonly x: number; readonly y: number } => ({
  x: 40,
  y: 42 + row * 24,
});

/** The element of the grid's page with id `id`. */
function byId(grid: Element, id: string | null): Element | null {
  return id === null || id === "" ? null : grid.ownerDocument.querySelector(`#${CSS.escape(id)}`);
}

/** The focused cell's element, the grid's active descendant. */
function active(grid: Element): Element | null {
  return byId(grid, grid.getAttribute("aria-activedescendant"));
}

describe("the grid's keyboard", () => {
  test("selects the first cell with a first key, activating no row and moving from no cell", async () => {
    const rows: GridRow[] = [];
    const { grid } = await renderGrid({
      grid: {
        onRowActivate: (row) => {
          rows.push(row);
        },
      },
    });
    grid.element().focus();
    await userEvent.keyboard("{Enter}");
    expect(rows).toStrictEqual([]);
    await expect.poll(() => active(grid.element())?.textContent).toBe("Desk: Rates");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.poll(() => rows).toStrictEqual([{ key: null, row: 1 }]);
  });

  test("leaves Alt with an arrow to the browser", async () => {
    const { grid } = await renderGrid();
    await pressAt(grid, at(0));
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await expect.poll(() => active(grid.element())?.textContent).toBe("Desk: Rates");
  });

  test("checks every row with Ctrl+Space, as the header's checkbox does", async () => {
    const picks: (readonly string[])[] = [];
    const { grid } = await renderGrid({
      grid: {
        onSelectionChange: (keys) => {
          picks.push(keys);
        },
        rowKey: "market_value",
        selectable: true,
      },
    });
    await pressAt(grid, at(0));
    await userEvent.keyboard("{Control>} {/Control}");
    await expect.poll(() => picks.at(-1)?.length).toBe(6);
  });

  test("clicks a link cell with Enter", async () => {
    const cells: GridCell[] = [];
    const { grid } = await renderGrid({
      grid: {
        onCellClick: (cell) => {
          cells.push(cell);
        },
      },
      layout: { cells: { fund: { kind: "link" } } },
    });
    await pressAt(grid, at(0));
    const clicks = cells.length;
    await userEvent.keyboard("{ArrowRight}{Enter}");
    await expect
      .poll(() => cells.slice(clicks).map((cell) => [cell.column, cell.link]))
      .toStrictEqual([["fund", true]]);
  });

  test("opens the focused cell's menu with Shift+F10", async () => {
    const opened: (GridCell | null)[] = [];
    const { grid } = await renderGrid({
      grid: {
        onContextMenu: (cell) => {
          opened.push(cell);
        },
      },
    });
    await pressAt(grid, at(0));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Shift>}{F10}{/Shift}");
    await expect.poll(() => opened.at(-1)?.row).toBe(2);
  });

  test("says how the focused cell's column sorts and filters", async () => {
    const { grid } = await renderGrid(
      {
        layout: {
          filters: [{ column: "market_value", op: "gt", value: 0 }],
          sort: [{ column: "market_value", descending: true }],
        },
      },
      "5",
    );
    await pressAt(grid, at(0));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect
      .poll(() => {
        const described = active(grid.element())?.getAttribute("aria-describedby") ?? null;
        return byId(grid.element(), described)?.textContent;
      })
      .toBe("Sorted descending. Filtered.");
  });
});
