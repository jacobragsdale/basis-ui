import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { DrillRequest } from "#grid/types.ts";
import type { LayoutInput } from "#layout/layout.ts";

import { pressAt, renderGrid } from "./grid-helpers.tsx";

/** The middle of the first row, under the 30 px header of the compact density, the default, and of the second. */
const firstRow = 42;
const secondRow = 66;
/** Market value by fund, then desk: the funds' rows are closed, under the grand total. */
const byFundAndDesk: LayoutInput = {
  group_by: ["fund", "desk"],
  measures: [{ aggregate: "sum", column: "market_value" }],
};

describe("Grid's menus and tools", () => {
  test("opens a column's menu with Alt+Down, whose Hide column hides the column", async () => {
    const { grid, screen, changes } = await renderGrid();
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard("{ArrowRight}{Alt>}{ArrowDown}{/Alt}");
    const menu = screen.getByRole("dialog", { name: "Column fund" });
    await expect.element(menu.getByRole("menuitem").first()).toHaveFocus();
    await menu.getByRole("menuitem", { name: "Hide column" }).click();
    await expect.poll(() => changes.at(-1)?.columns).toStrictEqual(["desk", "market_value"]);
    await expect.element(grid).toHaveAttribute("aria-colcount", "2");
  });

  test("searches the text columns as the user types", async () => {
    const { grid, screen, changes } = await renderGrid();
    await screen.getByRole("searchbox", { name: "Search the grid" }).fill("boreal");
    await expect.poll(() => changes.at(-1)?.search).toBe("boreal");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3");
  });

  test("adds a totals row that counts the rows and sums no number, which it says in text", async () => {
    const { screen, changes } = await renderGrid();
    await screen.getByRole("button", { name: "Totals" }).click();
    await expect
      .poll(() => changes.at(-1)?.totals.map((total) => [total.column, total.aggregate]))
      .toStrictEqual([["desk", "count"]]);
    await expect
      .element(screen.getByRole("status", { name: "Totals row" }))
      .toHaveTextContent("Totals. Desk: 6");
  });

  test("reads the numbers selected in the status bar: their mean, extremes, exact sum and count", async () => {
    const { grid, screen } = await renderGrid();
    const reading = screen.getByRole("status", { name: "Selected numbers" });
    await pressAt(grid, { x: 40, y: firstRow });
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    // One cell has no reading.
    await expect.element(reading).not.toBeInTheDocument();
    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowDown}{ArrowLeft}{ArrowLeft}{/Shift}");
    // The text columns in the selection hold no numbers; market value's three do.
    await expect
      .element(reading)
      .toHaveAttribute("title", "Avg 83.58, Min -50.00, Max 200.25, Sum 250.75, Count 3");
    await userEvent.keyboard("{Escape}");
    await expect.element(reading).not.toBeInTheDocument();
  });

  test("opens and closes a pivot's group with Enter, which the layout records while it differs from the default", async () => {
    const { grid, changes } = await renderGrid({ layout: byFundAndDesk }, "3");
    await pressAt(grid, { x: 120, y: secondRow });
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => changes.at(-1)?.expanded)
      .toStrictEqual([{ expanded: true, path: ["Atlas"] }]);
    await expect.element(grid).toHaveAttribute("aria-rowcount", "5");
    // Closed again, as the layout's depth leaves it, the group needs no entry: a saved view stays as short as it was.
    await userEvent.keyboard("{Enter}");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3");
    expect(changes.at(-1)?.expanded).toStrictEqual([]);
  });

  test("asks for the rows behind a pivot's value on a double click", async () => {
    const drills: DrillRequest[] = [];
    const { grid } = await renderGrid(
      {
        grid: {
          onDrill: (request) => {
            drills.push(request);
          },
        },
        layout: byFundAndDesk,
      },
      "3",
    );
    await userEvent.dblClick(grid.element().querySelector("canvas") ?? grid.element(), {
      position: { x: 300, y: secondRow },
    });
    await expect
      .poll(() => drills)
      .toStrictEqual([{ label: "Atlas", path: ["Atlas"], split: null }]);
  });

  test("gives a pivot's measure header the menu the pivot provides", async () => {
    const { grid, screen } = await renderGrid(
      {
        grid: { measureMenu: ({ measure }) => <p>Measure {measure}</p> },
        layout: byFundAndDesk,
      },
      "3",
    );
    await pressAt(grid, { x: 300, y: firstRow });
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await expect
      .element(screen.getByRole("dialog", { name: "Value Sum of market_value" }))
      .toHaveTextContent("Measure 0");
  });

  test("shows the parts of its toolbar it is given", async () => {
    const { screen } = await renderGrid({ grid: { toolbar: { export: false } } });
    await expect.element(screen.getByRole("toolbar", { name: "Grid tools" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { exact: true, name: "Export" }))
      .not.toBeInTheDocument();
  });

  test("shows no toolbar when told to", async () => {
    const { screen } = await renderGrid({ grid: { toolbar: false } });
    await expect.element(screen.getByRole("toolbar")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("region", { name: "Groups" })).not.toBeInTheDocument();
  });

  test("says why a layout is not valid", async () => {
    const { screen } = await renderGrid(
      { layout: { formats: { market_value: { decimals: 31 } } } },
      "0",
    );
    await expect.element(screen.getByRole("alert")).toMatchTextContent(/^Invalid layout: /u);
  });
});
