/* Choosing a grid's rows: by checkbox, one, a Shift range, or every row from the header's; with Space; in single mode
 * by focus; with the app holding the keys; and refused, with the reason, when the view hides the key column. Each
 * position's market value differs, so it is the key. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { pressAt, renderGrid } from "./grid-helpers.tsx";
import type { Rendered } from "./grid-helpers.tsx";

/** The middle of the checkbox column, of the header, and of the rows, in the compact density, the default: 24 px rows
 * under a 30 px header. */
const checkbox = 16;
const header = 15;
const rowY = (row: number): number => 42 + row * 24;
/** A data cell's middle, past the checkboxes. */
const cell = 100;

const keys = ["100.5", "200.25", "-50", "400", "1.75", "0.25"];

/** A grid of the positions whose rows are chosen by checkbox, or by focus in single mode, with the keys each change
 * handed the app. */
async function chooser(
  selectable: true | "single" = true,
): Promise<Rendered & { readonly picks: (readonly string[])[] }> {
  const picks: (readonly string[])[] = [];
  const onSelectionChange = (chosen: readonly string[]): void => {
    picks.push(chosen);
  };
  const rendered = await renderGrid({
    grid: { onSelectionChange, rowKey: "market_value", selectable },
  });
  return { ...rendered, picks };
}

describe("Grid with rows chosen by checkbox", () => {
  test("checks a row, then with Shift every row to another, and unchecks one", async () => {
    const { grid, screen, picks } = await chooser();
    await pressAt(grid, { x: checkbox, y: rowY(0) });
    await expect.poll(() => picks.at(-1)).toStrictEqual(["100.5"]);
    await expect.element(screen.getByText("1 selected")).toBeVisible();
    await userEvent.keyboard("{Shift>}");
    await pressAt(grid, { x: checkbox, y: rowY(2) });
    await userEvent.keyboard("{/Shift}");
    await expect.poll(() => picks.at(-1)).toStrictEqual(["100.5", "200.25", "-50"]);
    await pressAt(grid, { x: checkbox, y: rowY(1) });
    await expect.poll(() => picks.at(-1)).toStrictEqual(["100.5", "-50"]);
  });

  test("checks every row from the header's checkbox, which clears a choice when there is one", async () => {
    const { grid, screen, picks } = await chooser();
    await pressAt(grid, { x: checkbox, y: header });
    await expect.poll(() => picks.at(-1)).toStrictEqual(keys);
    await expect.element(screen.getByText("6 rows selected")).toBeInTheDocument();
    await pressAt(grid, { x: checkbox, y: header });
    await expect.poll(() => picks.at(-1)).toStrictEqual([]);
  });

  test("checks the focused row with Space, and says a chosen row is", async () => {
    const { grid, screen, picks } = await chooser();
    await pressAt(grid, { x: cell, y: rowY(1) });
    await userEvent.keyboard(" ");
    await expect.poll(() => picks.at(-1)).toStrictEqual(["200.25"]);
    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(screen.getByRole("gridcell"))
      .toHaveTextContent("Row selected. fund: Atlas");
  });

  test("shows the keys the app holds", async () => {
    const { screen } = await renderGrid({
      grid: { rowKey: "market_value", selectable: true, selected: ["400", "0.25"] },
    });
    await expect.element(screen.getByText("2 selected")).toBeVisible();
  });

  test("says why rows cannot be chosen while the view hides the key column", async () => {
    const { screen } = await renderGrid({
      grid: { rowKey: "market_value", selectable: true },
      layout: { columns: ["desk", "fund"] },
    });
    await expect
      .element(screen.getByText("Rows cannot be selected while the market_value column is hidden."))
      .toBeVisible();
  });
});

describe("Grid with one row chosen by focus", () => {
  test("chooses the focused cell's row, and draws no checkboxes", async () => {
    const { grid, picks } = await chooser("single");
    // With no checkbox column, the left edge is the first data column's cell.
    await pressAt(grid, { x: checkbox, y: rowY(0) });
    await expect.poll(() => picks.at(-1)).toStrictEqual(["100.5"]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.poll(() => picks.at(-1)).toStrictEqual(["-50"]);
  });
});
