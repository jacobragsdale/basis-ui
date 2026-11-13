/* A choice of every row, from the header's checkbox, as the rows it covers change: a filter, a search or a reload
 * changes them, and the app hears the choice again, so a bulk action acts on the rows the grid shows checked. Past the
 * keys a fetch takes, an app that takes keys is refused rather than left holding none. */

import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Grid } from "#grid/grid.tsx";
import type { RowsChosen } from "#grid/row-selection.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";

import { countedBytes, positionsBytes, startWorker } from "./data.ts";
import { pressAt } from "./grid-helpers.tsx";

/** The header's checkbox, in the compact density: 16 px in, in the 30 px header. */
const headerCheckbox = { x: 16, y: 15 };
const atlasView = {
  // As the layout holds the filter, its defaults filled in.
  filters: [{ column: "fund", columns: [], op: "eq", value: "Atlas", values: [] }],
  rows: 3,
  search: "",
};
const allKeys = ["100.5", "200.25", "-50", "400", "1.75", "0.25"];
const atlasKeys = ["100.5", "200.25", "-50"];
const noLayout: LayoutInput = {};
const atlas: LayoutInput = { filters: [{ column: "fund", op: "eq", value: "Atlas" }] };

/** What the app heard: the keys, and the rows chosen. */
interface Heard {
  readonly keys: (readonly string[])[];
  readonly rows: RowsChosen[];
}

interface ChoosingProps {
  readonly heard: Heard;
  readonly layout?: LayoutInput;
  readonly source?: DatasetSource;
  readonly rowKey?: string;
  /** Whether the app takes keys, or only the rows chosen. */
  readonly keys?: boolean;
}

function Choosing({
  heard,
  layout = noLayout,
  source = positionsBytes,
  rowKey = "market_value",
  keys = true,
}: ChoosingProps): ReactNode {
  const dataset = useDataset("rows", source);
  return (
    <div className="h-96 w-full max-w-3xl">
      <Grid
        dataset={dataset}
        layout={layout}
        selectable
        rowKey={rowKey}
        onRowsChange={(rows) => {
          heard.rows.push(rows);
        }}
        {...(keys
          ? {
              onSelectionChange: (chosen: readonly string[]): void => {
                heard.keys.push(chosen);
              },
            }
          : {})}
      />
    </div>
  );
}

function page(props: ChoosingProps): ReactNode {
  return (
    <ParallaxProvider worker={startWorker}>
      <Choosing {...props} />
    </ParallaxProvider>
  );
}

const sorted = (keys: readonly string[] | undefined): string[] => (keys ?? []).toSorted();

describe("a choice of every row", () => {
  test("is heard again, keys and view, when a filter changes the rows it covers", async () => {
    const heard: Heard = { keys: [], rows: [] };
    const screen = await render(page({ heard }));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    await pressAt(grid, headerCheckbox);
    await expect.poll(() => sorted(heard.keys.at(-1))).toStrictEqual(sorted(allKeys));
    expect(heard.rows.at(-1)).toStrictEqual({
      all: true,
      keys: [],
      view: { filters: [], rows: 6, search: "" },
    });
    await screen.rerender(page({ heard, layout: atlas }));
    await expect.poll(() => sorted(heard.keys.at(-1))).toStrictEqual(sorted(atlasKeys));
    await expect.poll(() => heard.rows.at(-1)?.view).toStrictEqual(atlasView);
  });

  test("is heard again when a reload changes the rows", async () => {
    const heard: Heard = { keys: [], rows: [] };
    const screen = await render(page({ heard, rowKey: "value", source: () => countedBytes(4) }));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "4");
    await pressAt(grid, headerCheckbox);
    await expect.poll(() => heard.keys.at(-1)?.length).toBe(4);
    await screen.rerender(page({ heard, rowKey: "value", source: () => countedBytes(7) }));
    await expect.poll(() => heard.keys.at(-1)?.length).toBe(7);
    expect(heard.rows.at(-1)?.view?.rows).toBe(7);
  });
});

/** More rows than a fetch takes the keys of. */
function many(): ArrayBuffer {
  return countedBytes(1_200_000);
}

describe("a choice of every row past the keys a fetch takes", () => {
  test("is refused for an app that takes keys, saying so", async () => {
    const heard: Heard = { keys: [], rows: [] };
    const screen = await render(page({ heard, rowKey: "value", source: many }));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "1200000");
    await pressAt(grid, headerCheckbox);
    await expect.element(screen.getByText(/Up to 1,000,000 rows/u)).toBeVisible();
    expect([heard.keys, heard.rows]).toStrictEqual([[], []]);
  });

  test("is every row of the view for an app that takes the rows chosen", async () => {
    const heard: Heard = { keys: [], rows: [] };
    const screen = await render(page({ heard, keys: false, rowKey: "value", source: many }));
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "1200000");
    await pressAt(grid, headerCheckbox);
    await expect
      .poll(() => heard.rows.at(-1))
      .toStrictEqual({ all: true, keys: [], view: { filters: [], rows: 1_200_000, search: "" } });
  });
});
