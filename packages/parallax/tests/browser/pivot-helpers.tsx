/* Helpers for the pivot's browser tests: the pivot of the holdings rendered in a provider, waiting for its rows and
 * its fields. */

import { expect } from "vite-plus/test";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import type { Layout, LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { startWorker } from "./data.ts";
import { PivotPage } from "./pivot-page.tsx";

/** Market value by fund, then desk, every level open: the grand total, two funds and two desks under each. */
const byFundAndDesk: LayoutInput = {
  expand_depth: 2,
  group_by: ["fund", "desk"],
  measures: [{ aggregate: "sum", column: "market_value" }],
};
const fieldCount = 5;

/** A rendered pivot: the screen, its grid, and the layouts it handed back. */
interface RenderedPivot {
  readonly screen: RenderResult;
  readonly grid: Locator;
  readonly changes: Layout[];
  /** The last layout handed back. */
  readonly last: () => Layout | undefined;
}

/** Renders the pivot of `first`, waiting for `rows` rows and its fields. */
async function renderPivot(first: LayoutInput = byFundAndDesk, rows = "7"): Promise<RenderedPivot> {
  const changes: Layout[] = [];
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <PivotPage first={first} changes={changes} />
    </ParallaxProvider>,
  );
  const grid = screen.getByRole("grid", { name: "holdings" });
  await expect.element(grid).toHaveAttribute("aria-rowcount", rows);
  await expect
    .poll(() => screen.getByRole("list", { name: "Fields" }).getByRole("listitem").elements())
    .toHaveLength(fieldCount);
  return { changes, grid, last: () => changes.at(-1), screen };
}

/** The pivot's canvas. */
function canvasOf(grid: Locator): HTMLCanvasElement {
  const canvas = grid.element().querySelector("canvas");
  if (canvas === null) {
    throw new Error("The pivot's grid has no canvas.");
  }
  return canvas;
}

export { canvasOf, renderPivot };
export type { RenderedPivot };
