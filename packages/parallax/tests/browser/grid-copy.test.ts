/* Copying a grid's selection when something stands in the way: a clipboard that refuses says so in the status bar,
 * and a selection the view outgrew, as a search leaves fewer rows, copies the cells the view still has. */

import "@basis/ui/styles.css";

import { createRef } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { GridHandle } from "#grid/use-grid-handles.ts";

import { copyFrom, pressAt, renderGrid } from "./grid-helpers.tsx";

/** A data cell's middle in the first row, under the 30 px header. */
const firstCell = { x: 40, y: 42 };

describe("a copy", () => {
  test("from the grid's handle says why it failed, when the clipboard refuses", async () => {
    const gridRef = createRef<GridHandle>();
    const { grid, screen } = await renderGrid({ gridRef });
    await pressAt(grid, firstCell);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("the clipboard is busy"),
    );
    await gridRef.current?.copy();
    await expect
      .element(screen.getByText("Copy failed: the clipboard is busy"))
      .toBeInTheDocument();
    vi.restoreAllMocks();
  });

  test("of a selection the view outgrew copies the cells the view still has", async () => {
    const { grid, screen } = await renderGrid();
    await pressAt(grid, firstCell);
    await userEvent.keyboard("{Control>}a{/Control}");
    await screen.getByRole("searchbox", { name: "Search the grid" }).fill("boreal");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3");
    await expect.poll(() => copyFrom(grid).split("\r\n")).toHaveLength(3);
  });
});
