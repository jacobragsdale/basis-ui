import "@basis/ui/styles.css";

import { Profiler } from "react";
import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ParallaxProvider } from "#react/provider.tsx";

import { hugeBytes, startWorker } from "./data.ts";
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
