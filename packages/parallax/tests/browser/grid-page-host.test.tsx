/* The grid as an app's page holds it: a page that renders again with a layout equal to the last, a page that holds the
 * rows chosen, and a container that gives the grid no height. */

import "@basis/ui/styles.css";

import { useState } from "react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Grid } from "#grid/grid.tsx";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";

import { positionsBytes, startWorker } from "./data.ts";
import { canvasOf, pressAt, renderGrid } from "./grid-helpers.tsx";

/** The middle of the header, and of the first row, in the compact density, the default. */
const header = 15;
const firstRow = 42;

/** The middle of the checkbox column, whose header checks every row. */
const checkbox = 16;
const checkboxPx = 32;

/** What the header's checkbox shows, as an image of its cell. */
function headerCheck(canvas: HTMLCanvasElement): string {
  const ratio = window.devicePixelRatio;
  const cell = document.createElement("canvas");
  cell.width = checkboxPx * ratio;
  cell.height = header * 2 * ratio;
  cell
    .getContext("2d")
    ?.drawImage(canvas, 0, 0, cell.width, cell.height, 0, 0, cell.width, cell.height);
  return cell.toDataURL();
}

/** A page that holds the keys of the rows chosen, as an app that keeps them in its URL does. */
function Choosing(): ReactNode {
  const positions = useDataset("positions", positionsBytes);
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <div className="h-96 w-full max-w-3xl">
      <Grid
        dataset={positions}
        rowKey="market_value"
        selectable
        selected={selected}
        onSelectionChange={setSelected}
      />
    </div>
  );
}

/** A page that renders the grid with the layout it is given, leaving the user's changes to the grid. */
function Page({
  layout,
  className = "h-96 w-full max-w-3xl",
}: {
  readonly layout: LayoutInput;
  readonly className?: string;
}): ReactNode {
  const positions = useDataset("positions", positionsBytes);
  return (
    <div className={className}>
      <Grid dataset={positions} layout={layout} />
    </div>
  );
}

/** The page, rendered afresh with a new layout object each time, that says the same each time. */
function sortablePage(): ReactNode {
  return (
    <ParallaxProvider worker={startWorker}>
      <Page layout={{ columns: ["desk", "fund", "market_value"] }} />
    </ParallaxProvider>
  );
}

/** The header's checkbox of a grid that keeps its own keys, once it has checked every row. */
async function everyRowChecked(): Promise<string> {
  const { grid, screen } = await renderGrid({ grid: { rowKey: "market_value", selectable: true } });
  await pressAt(grid, { x: checkbox, y: header });
  await expect.element(screen.getByText("6 rows selected")).toBeInTheDocument();
  const all = headerCheck(canvasOf(grid));
  await screen.unmount();
  return all;
}

describe("Grid in an app's page", () => {
  test("keeps the user's changes when the page renders again with an equal layout", async () => {
    const screen = await render(sortablePage());
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    await pressAt(grid, { x: 40, y: header });
    await pressAt(grid, { x: 40, y: firstRow });
    // Sorted by desk, Credit comes first.
    await expect.element(screen.getByRole("gridcell")).toHaveTextContent("desk: Credit");
    // The page renders again, with a new layout object that says the same.
    await screen.rerender(sortablePage());
    await pressAt(grid, { x: 40, y: firstRow });
    await expect.element(screen.getByRole("gridcell")).toHaveTextContent("desk: Credit");
  });

  test("shows every row checked in the header once the page holding the keys takes every row's", async () => {
    const all = await everyRowChecked();
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Choosing />
      </ParallaxProvider>,
    );
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    const none = headerCheck(canvasOf(grid));
    await pressAt(grid, { x: checkbox, y: header });
    await expect.element(screen.getByText("6 rows selected")).toBeInTheDocument();
    await expect.poll(() => headerCheck(canvasOf(grid))).not.toBe(none);
    expect(headerCheck(canvasOf(grid))).toBe(all);
  });

  test("says what to do when its container gives it no height", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Page layout={{}} className="w-full max-w-3xl" />
      </ParallaxProvider>,
    );
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        'ERROR The grid has no height, as its container gives it none: give the container a height, such as h-96 or flex-1 in a flex column, or pass the grid height="auto".',
      );
  });
});
