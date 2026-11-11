import "@basis/ui/styles.css";

import { Profiler } from "react";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import type { WorkerPort } from "#engine/port.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { countedBytes, hugeBytes, pairedBytes, startWorker } from "./data.ts";
import { gatedWorker } from "./gated-worker.ts";
import type { GatedWorker } from "./gated-worker.ts";
import { canvasOf } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";

/** How many frames the test scrolls, and how many rows each, enough to need new rows from the engine most frames. */
const steps = 30;
const rowsPerStep = 40;
const rowPx = 30;

/** Scrolls `element` down `count` steps, one animation frame each. */
async function scrollDown(element: Element, count: number): Promise<void> {
  if (count === 0) {
    return;
  }
  element.scrollBy({ top: rowsPerStep * rowPx });
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  await promise;
  await scrollDown(element, count - 1);
}

test("scrolls through 150,000 rows without a React render a frame", async () => {
  let commits = 0;
  const screen = await render(
    <Profiler
      id="grid"
      onRender={() => {
        commits += 1;
      }}
    >
      <ParallaxProvider worker={startWorker}>
        <GridPage source={hugeBytes} />
      </ParallaxProvider>
    </Profiler>,
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid, { timeout: 30_000 }).toHaveAttribute("aria-rowcount", "150000");
  const before = commits;
  await scrollDown(grid.element(), steps);
  await expect.element(grid).toHaveAttribute("aria-rowcount", "150000");
  // A render or two may follow the scroll, as the status bar's age ticks; one a frame would be thirty.
  expect(commits - before).toBeLessThan(3);
});

/** Waits for the page's next animation frame. */
async function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  await promise;
}

/** Waits for the page's next two animation frames, by when a scroll has been handled and drawn. */
async function frames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** The compact density's rows, the default: a medium control's 28 px, under a large control's 30 px header. */
const compactRowPx = 28;
const compactHeaderPx = 30;
const hundredRows = (): ArrayBuffer => countedBytes(100);
/** Rows past the far scroll's, of a view too large to fetch whole, which load in one step and show at once, so the grid
 * is at rest once they show. */
const manyRows = (): ArrayBuffer => pairedBytes(12_000);
const summed: LayoutInput = { totals: [{ aggregate: "sum", column: "value" }] };

/** Renders a grid of `source` on `worker`, waiting for its `rows` rows; returns its scrolling element. */
async function renderRows(
  worker: () => WorkerPort,
  {
    source,
    rows,
    layout = {},
  }: { readonly source: () => ArrayBuffer; readonly rows: string; readonly layout?: LayoutInput },
): Promise<{ readonly grid: Locator; readonly screen: RenderResult }> {
  const screen = await render(
    <ParallaxProvider worker={worker}>
      <GridPage source={source} layout={layout} />
    </ParallaxProvider>,
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", rows);
  // A load shows its first rows before the rest: the grid is at rest once the last have come.
  await expect
    .poll(() =>
      grid
        .element()
        .closest('[data-slot="grid"]')
        ?.querySelector('[data-slot="grid-status-loading"]'),
    )
    .toBeNull();
  await frames();
  return { grid, screen };
}

test("keeps the focused row above the totals row as the keyboard moves it down", async () => {
  const { grid, screen } = await renderRows(startWorker, {
    layout: summed,
    rows: "100",
    source: hundredRows,
  });
  await expect
    .element(screen.getByRole("status", { name: "Totals row" }))
    .toHaveTextContent("Totals. value: 4,950.00");
  const scroll = grid.element();
  // The rows that show whole above the totals row, which takes the body's last row.
  const above = Math.floor((scroll.clientHeight - compactHeaderPx) / compactRowPx) - 1;
  await userEvent.click(canvasOf(grid), {
    position: { x: 40, y: compactHeaderPx + compactRowPx / 2 },
  });
  await userEvent.keyboard("{ArrowDown}".repeat(above - 1));
  expect(scroll.scrollTop).toBe(0);
  // One more, and the row would be under the totals: the grid scrolls it into view above them.
  await userEvent.keyboard("{ArrowDown}");
  expect(scroll.scrollTop).toBe(compactRowPx);
});

/** Scrolls far down while the engine's answers wait, then back to the top before they arrive; returns how many
 * windows of the far rows the grid asked for. */
async function scrollAwayAndBack(gate: GatedWorker, scroll: Element): Promise<number> {
  gate.close();
  scroll.scrollTop = 10_000 * compactRowPx;
  await frames();
  scroll.scrollTop = 0;
  await frames();
  return gate
    .sent("setViewport")
    .filter((asked) => asked.body.case === "setViewport" && asked.body.value.firstRow > 5000n)
    .length;
}

test("keeps the rows on screen when a frame arrives late for rows the user has left", async () => {
  const gate = gatedWorker();
  const { grid } = await renderRows(gate.start, { rows: "12000", source: manyRows });
  await frames();
  const top = canvasOf(grid).toDataURL();
  expect(await scrollAwayAndBack(gate, grid.element())).toBe(1);
  // Back at the top before the engine answers, the rows the grid holds show again.
  expect(canvasOf(grid).toDataURL()).toBe(top);
  // The answer for the rows left behind arrives, and anything after it waits.
  gate.deliver();
  await frames();
  expect(canvasOf(grid).toDataURL()).toBe(top);
  gate.open();
});
