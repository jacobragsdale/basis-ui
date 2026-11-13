/* Rows known by their key: a row chosen by focus stays chosen through a sort, a layout that moves the key column never
 * hands another column's value as a key, and with a `rowKey` alone, no rows chosen, every row event carries the key.
 * Each position's market value differs, so it is the key. */

import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import type { GridCell, GridRow } from "#grid/events.ts";
import { Grid } from "#grid/grid.tsx";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";

import { positionsBytes, startWorker } from "./data.ts";
import { pressAt } from "./grid-helpers.tsx";

/** A data cell's middle, in the compact density: 24 px rows under a 30 px header. */
const at = (row: number): { readonly x: number; readonly y: number } => ({
  x: 40,
  y: 42 + row * 24,
});
const byValue: LayoutInput = { sort: [{ column: "market_value", descending: true }] };
const noLayout: LayoutInput = {};
/** Long enough for the engine to answer both layouts. */
const settleMs = 500;

/** Waits long enough for the engine to answer the layouts given. */
async function settle(): Promise<void> {
  const until = performance.now() + settleMs;
  await expect.poll(() => performance.now()).toBeGreaterThan(until);
}

interface Heard {
  readonly picks: (readonly string[])[];
  readonly cells: GridCell[];
  readonly rows: GridRow[];
}

function Keyed({
  heard,
  layout,
  single,
}: {
  readonly heard: Heard;
  readonly layout: LayoutInput;
  readonly single: boolean;
}): ReactNode {
  const positions = useDataset("positions", positionsBytes);
  const events = {
    onCellClick: (cell: GridCell): void => {
      heard.cells.push(cell);
    },
    onRowActivate: (row: GridRow): void => {
      heard.rows.push(row);
    },
  };
  return (
    <div className="h-96 w-full max-w-3xl">
      {single ? (
        <Grid
          dataset={positions}
          layout={layout}
          selectable="single"
          rowKey="market_value"
          onSelectionChange={(keys) => {
            heard.picks.push(keys);
          }}
          {...events}
        />
      ) : (
        <Grid dataset={positions} layout={layout} rowKey="market_value" {...events} />
      )}
    </div>
  );
}

function page(heard: Heard, layout: LayoutInput, single: boolean): ReactNode {
  return (
    <ParallaxProvider worker={startWorker}>
      <Keyed heard={heard} layout={layout} single={single} />
    </ParallaxProvider>
  );
}

describe("a row chosen by focus", () => {
  test("stays chosen through a sort, and a pin of another column never hands its value as a key", async () => {
    const heard: Heard = { cells: [], picks: [], rows: [] };
    const screen = await render(page(heard, noLayout, true));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    await pressAt(grid, at(0));
    await expect.poll(() => heard.picks.at(-1)).toStrictEqual(["100.5"]);
    // The sort puts 400 where 100.5 was, and the pin moves the key column; the frames of both come and are drawn.
    await screen.rerender(page(heard, byValue, true));
    await screen.rerender(page(heard, { ...byValue, pinned: ["fund"] }, true));
    await settle();
    // Every key handed over is a market value, and the choice is still the row first chosen.
    expect([
      heard.picks.flat().every((key) => /^-?\d/u.test(key)),
      heard.picks.at(-1),
    ]).toStrictEqual([true, ["100.5"]]);
  });
});

describe("a grid with a rowKey and no rows chosen", () => {
  test("gives every cell clicked and row activated its row's key", async () => {
    const heard: Heard = { cells: [], picks: [], rows: [] };
    const screen = await render(page(heard, byValue, false));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    await pressAt(grid, at(0));
    await expect.poll(() => heard.cells.at(-1)?.key).toBe("400");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => heard.rows.at(-1)).toStrictEqual({ key: "400", row: 0 });
  });
});
