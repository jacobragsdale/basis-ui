/* The grid's body when it has no rows to draw: a skeleton while the first rows load, and a line once no row matches the
 * filters. Rows are 24 px under a 30 px header. */

import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Grid } from "#grid/grid.tsx";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import { readTheme } from "#theme/read.ts";

import { countedBytes, positionsBytes, startWorker } from "./data.ts";
import { gatedWorker } from "./gated-worker.ts";
import { canvasOf, drawn, renderGrid } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";

/** The canvas's colour at CSS pixel `x`, `y`, `r,g,b`. */
function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): string {
  const ratio = canvas.width / canvas.clientWidth;
  const context = canvas.getContext("2d") ?? expect.unreachable("no context");
  return context
    .getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
    .data.slice(0, 3)
    .join(",");
}

/** A CSS colour as the canvas draws it, `r,g,b`. */
function rgbOf(color: string): string {
  const context =
    document.createElement("canvas").getContext("2d") ?? expect.unreachable("no context");
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data.slice(0, 3).join(",");
}

/** How many of a band's pixels across the canvas, at `y`, differ from the background. */
function inkedAcross(canvas: HTMLCanvasElement, y: number): number {
  const background = rgbOf(readTheme(canvas).background);
  let inked = 0;
  for (let x = 0; x < canvas.clientWidth; x += 2) {
    inked += pixelAt(canvas, x, y) === background ? 0 : 1;
  }
  return inked;
}

test("draws a skeleton of rows while the first rows load", async () => {
  const gate = gatedWorker();
  gate.close();
  const screen = await render(
    <ParallaxProvider worker={gate.start}>
      <GridPage />
    </ParallaxProvider>,
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toBeInTheDocument();
  const bar = (): string => rgbOf(readTheme(canvasOf(grid)).chromeBackground);
  await expect
    .poll(async () => {
      await drawn();
      return pixelAt(canvasOf(grid), 20, 30 + 12);
    })
    .toBe(bar());
  gate.open();
});

test("says no row matches once the filters leave none", async () => {
  const { grid } = await renderGrid(
    { layout: { filters: [{ column: "desk", op: "eq", value: "Nowhere" }] } },
    "0",
  );
  const canvas = canvasOf(grid);
  const theme = readTheme(canvas);
  const [header, row] = [
    Number(theme.headerHeight.replace("px", "")),
    Number(theme.rowHeight.replace("px", "")),
  ];
  // The line sits two rows below the header, where a skeleton's bar would be had no frame come.
  await expect.poll(() => inkedAcross(canvas, header + 2 * row)).toBeGreaterThan(0);
  expect(inkedAcross(canvas, header + row / 2)).toBe(0);
});

/** A grid of the positions in `layout`, telling `errors` each error it reports. */
function ReportingGrid({
  layout,
  errors,
}: {
  readonly layout: LayoutInput;
  readonly errors: (string | null)[];
}): ReactNode {
  const positions = useDataset("positions", positionsBytes);
  return (
    <div className="h-96 w-full max-w-3xl">
      <Grid
        dataset={positions}
        layout={layout}
        onError={(error) => {
          errors.push(error);
        }}
      />
    </div>
  );
}

test("tells the app why the engine refused its layout, and shows the rows once the layout is corrected", async () => {
  const errors: (string | null)[] = [];
  const page = (layout: LayoutInput): ReactNode => (
    <ParallaxProvider worker={startWorker}>
      <ReportingGrid layout={layout} errors={errors} />
    </ParallaxProvider>
  );
  const screen = await render(page({ sort: [{ column: "region", descending: false }] }));
  await expect.poll(() => errors).toHaveLength(1);
  expect(errors[0]).toMatch(/region/u);
  await screen.rerender(page({ sort: [{ column: "fund", descending: false }] }));
  await expect.poll(() => errors).toStrictEqual([errors[0], null]);
  await expect.element(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "6");
});

test("offers to clear a layout the engine refused, such as a sort and a pin on a column the data dropped", async () => {
  const { grid, screen, changes } = await renderGrid(
    { layout: { pinned: ["region"], sort: [{ column: "region", descending: false }] } },
    "0",
  );
  await screen.getByRole("button", { name: "Clear sorts, filters, groups and pins" }).click();
  await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
  expect([changes.at(-1)?.sort, changes.at(-1)?.pinned]).toStrictEqual([[], []]);
});

test("keeps an auto-height grid within what a canvas holds, however tall its maxHeight", async () => {
  const { grid } = await renderGrid(
    { grid: { height: "auto", maxHeight: 1_000_000_000 }, source: () => countedBytes(50_000) },
    "50000",
  );
  await drawn();
  expect(canvasOf(grid).clientHeight).toBeLessThanOrEqual(8192);
});
