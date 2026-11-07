/* Helpers for the grid's browser tests: a grid rendered in a provider and waiting for its rows, a press on its canvas,
 * and its selection copied through a copy event. */

import { expect } from "vite-plus/test";
import type { Locator } from "vite-plus/test/browser";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import type { Layout } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { startWorker } from "./data.ts";
import { GridPage } from "./grid-page.tsx";
import type { GridPageProps } from "./grid-page.tsx";

/** A rendered grid: the screen, the grid, and the layouts it handed back. */
interface Rendered {
  readonly screen: RenderResult;
  readonly grid: Locator;
  readonly changes: Layout[];
}

/** Renders a grid of the positions, waiting for `rows` rows. */
async function renderGrid(props: GridPageProps = {}, rows = "6"): Promise<Rendered> {
  const changes: Layout[] = [];
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <GridPage changes={changes} {...props} />
    </ParallaxProvider>,
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", rows);
  return { changes, grid, screen };
}

/** The grid's canvas. */
function canvasOf(grid: Locator): HTMLCanvasElement {
  const canvas = grid.element().querySelector("canvas");
  if (canvas === null) {
    throw new Error("The grid has no canvas.");
  }
  return canvas;
}

/** Presses the canvas at `x`, `y`, in CSS pixels from its top left. */
async function pressAt(
  grid: Locator,
  at: { readonly x: number; readonly y: number },
): Promise<void> {
  await userEvent.click(canvasOf(grid), { position: at });
}

/** Copies the selection as Ctrl+C would, and returns the text the grid put on the clipboard. */
function copyFrom(grid: Locator): string {
  const event = new ClipboardEvent("copy", {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer(),
  });
  grid.element().dispatchEvent(event);
  return event.clipboardData?.getData("text/plain") ?? "";
}

export { canvasOf, copyFrom, pressAt, renderGrid };
export type { Rendered };
