import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { countedBytes } from "./data.ts";
import { copyFrom, pressAt, renderGrid } from "./grid-helpers.tsx";

/** The middle of the header, and of the first row, in the compact density, the default: a 24 px row under a 30 px
 * header. */
const header = 15;
const firstRow = 42;
const thousandRows = (): ArrayBuffer => countedBytes(1000);

describe("Grid", () => {
  test("shows a flat view's rows and columns, and the status bar says where they come from", async () => {
    const { grid, screen } = await renderGrid();
    await expect.element(grid).toHaveAttribute("aria-colcount", "3");
    await expect.element(grid).toHaveAccessibleName("positions");
    await expect.element(screen.getByText("6 rows")).toBeVisible();
    await expect
      .element(grid)
      .toHaveAccessibleDescription(/^6 rows and 3 columns\. Arrow keys move/u);
  });

  test("sorts by a header's column when it is clicked, ascending, then descending, then not", async () => {
    const { grid, changes } = await renderGrid();
    await pressAt(grid, { x: 40, y: header });
    await expect
      .poll(() => changes.at(-1)?.sort)
      .toStrictEqual([{ column: "desk", descending: false }]);
    await pressAt(grid, { x: 40, y: header });
    await expect
      .poll(() => changes.at(-1)?.sort)
      .toStrictEqual([{ column: "desk", descending: true }]);
    await pressAt(grid, { x: 40, y: header });
    await expect.poll(() => changes.at(-1)?.sort).toStrictEqual([]);
  });

  test("keeps its own changes when the app does not hold its layout", async () => {
    const { grid, screen } = await renderGrid({ controlled: false });
    await pressAt(grid, { x: 40, y: header });
    await pressAt(grid, { x: 40, y: firstRow });
    // Sorted by desk, Credit comes first.
    await expect.element(screen.getByRole("gridcell")).toHaveTextContent("desk: Credit");
  });

  test("says the focused cell as the grid's active descendant, and the selection's size", async () => {
    const { grid, screen } = await renderGrid();
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard("{ArrowRight}");
    const cell = screen.getByRole("gridcell");
    await expect.element(cell).toHaveTextContent("fund: Atlas");
    await expect.element(grid).toHaveAttribute("aria-activedescendant", cell.element().id);
    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowRight}{/Shift}");
    await expect.element(screen.getByText("2 rows by 2 columns selected")).toBeInTheDocument();
  });

  test("copies a selection as tab-separated text with every digit", async () => {
    const { grid } = await renderGrid();
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard("{Control>}a{/Control}");
    const lines = copyFrom(grid).split("\r\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("Rates\tAtlas\t100.5");
  });

  test.each([
    ["Ctrl+A", "{Control>}a{/Control}"],
    ["Ctrl+A with Caps Lock", "{Control>}A{/Control}"],
    ["Ctrl+Shift+A", "{Control>}{Shift>}A{/Shift}{/Control}"],
  ])("selects everything with %s, and stays where it is", async (_name, keys) => {
    const { grid, screen } = await renderGrid({ source: thousandRows }, "1000");
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard(keys);
    await expect.element(screen.getByText("1,000 rows by 1 column selected")).toBeInTheDocument();
    expect(grid.element().scrollTop).toBe(0);
  });
});
