/* What the pages make of a click, a link and a file: the filters a selection sets, the charts a breakdown narrows, the
 * view a shared link opens, and the load the "Data from the app" page shows. */

import { encodeLayout } from "@basis/parallax";
import type { Dataset, LayoutInput } from "@basis/parallax";
import { describe, expect, test } from "vite-plus/test";

import { breakdowns, narrowed } from "./breakdown-layouts.ts";
import { grouped, withSelection } from "./layouts.ts";
import { firstSlots, newestFirst, noteOf, shownOf, withFile } from "./source-loads.ts";
import type { Loaded } from "./source-loads.ts";
import { largestTrades, positionsPivot } from "./view-layouts.ts";
import { openView } from "./view-link.ts";

const equity = { column: "asset_class", label: "Equity", value: "Equity" };

/** A filter as a layout given to a view states it. */
type FilterInput = NonNullable<LayoutInput["filters"]>[number];

describe("a selection's filters", () => {
  test("replace the column's own filter and keep a search and the other columns'", () => {
    const search: FilterInput = {
      column: "ticker",
      columns: ["fund"],
      op: "contains",
      value: "A",
    };
    const side: FilterInput = { column: "side", op: "eq", value: "Buy" };
    const bond: FilterInput = { column: "asset_class", op: "eq", value: "Bond" };
    const was = { filters: [search, side, bond] };
    const picked = { column: "asset_class", columns: [], op: "eq", value: "Equity", values: [] };
    expect(withSelection(was, "asset_class", equity).filters).toStrictEqual([search, side, picked]);
    expect(withSelection(was, "asset_class", null).filters).toStrictEqual([search, side]);
  });

  test("a layout that groups opens as a pivot", () => {
    expect(grouped(positionsPivot)).toBe(true);
    expect(grouped(largestTrades)).toBe(false);
  });
});

describe("the breakdowns", () => {
  test("narrow every chart to the picked group but those grouped by its column", () => {
    const [byRegion, byFund] = breakdowns;
    const pick = { chart: "notional-by-region", selection: { ...equity, column: "region" } };
    expect(byRegion === undefined ? null : narrowed(byRegion, pick)).toBe(byRegion?.layout);
    expect(byFund === undefined ? null : narrowed(byFund, pick).filters).toStrictEqual([
      { column: "region", columns: [], op: "eq", value: "Equity", values: [] },
    ]);
  });
});

describe("a shared link", () => {
  test("opens the view it holds", async () => {
    const opened = await openView(positionsPivot, await encodeLayout(largestTrades));
    expect(opened.dataset).toBe("trades");
    expect(opened.layout.sort).toStrictEqual([{ column: "gross_amount_local", descending: true }]);
    expect(opened.note).toBe("A view opened from a shared link.");
  });

  test("that cannot be read opens the page's own view and says why", async () => {
    const opened = await openView(positionsPivot, "not a layout");
    expect(opened.layout).toBe(positionsPivot);
    expect(opened.note).toMatch(/^The link's layout could not be read, so the page's own view/u);
  });

  test("to a dataset the demo does not serve opens the page's own view", async () => {
    const opened = await openView(largestTrades, await encodeLayout({ dataset: "elsewhere" }));
    expect(opened.layout).toBe(largestTrades);
    expect(opened.note).toBe("The link's dataset, elsewhere, is not one the demo serves.");
  });
});

/** A load's dataset in a state. */
function dataset(status: Dataset["status"], rows: number | null = null): Dataset {
  return {
    engine: 0,
    error: null,
    name: "",
    progress: null,
    reload: () => {
      // A test's dataset never loads again.
    },
    rows,
    status,
  };
}

describe("the loads of the app's own data", () => {
  test("the grid shows the newest load that loaded, so a failed file leaves it as it was", () => {
    const [sample] = firstSlots();
    const file = new File([new Uint8Array(1)], "big file.arrows");
    const [, load] = withFile([sample, null], sample, file);
    expect(load?.name).toBe("big_file");
    const loaded: Loaded = { dataset: dataset("loaded", 2000), load: sample };
    const failed: Loaded | null =
      load === null || load === undefined
        ? null
        : { dataset: { ...dataset("failed"), error: "too big" }, load };
    const loads = newestFirst([loaded, failed]);
    expect(shownOf(loads)).toBe(loaded);
    expect(noteOf(loads[0])).toBe("big file.arrows did not load: too big");
  });
});
