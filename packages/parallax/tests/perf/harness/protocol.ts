/* What the scale harness's page offers the bench that drives it, on `window.parallaxBench`, and the layouts it is
 * measured with. The page and `tests/perf/bench.ts` share this module. */

import type { LayoutInput } from "@basis/parallax";

/** The datasets the bench measures, with their primary keys, as the demo loads them. */
const benchKeys = { positions: "position_id", trades: "trade_id" } as const;

type BenchDataset = keyof typeof benchKeys;

/** Where the page's load stands, on `performance.now()`'s clock, which starts at navigation. */
interface BenchState {
  readonly status: "idle" | "loading" | "loaded" | "failed";
  /** The rows the engine holds once loaded. */
  readonly rows: number | null;
  readonly error: string | null;
  /** When the grid drew its first rows. */
  readonly firstRowsMs: number | null;
  /** When the dataset was loaded and its rows drawn. */
  readonly loadedMs: number | null;
}

/** What a scroll of the grid measured. */
interface ScrollFigures {
  readonly frames: number;
  /** The grid's drawing time, by its own counters, per frame it drew. */
  readonly drawMsPerFrame: number;
  /** The interval between animation frames. */
  readonly meanFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxFrameMs: number;
  /** Animation frames longer than 50 ms, by the Long Animation Frames API. */
  readonly longFrames: number;
}

/** The page's handle for the bench. */
interface BenchPage {
  readonly state: () => BenchState;
  /** Shows `layout` and resolves, once the grid has drawn the change, with the milliseconds from the call. */
  readonly change: (layout: LayoutInput) => Promise<number>;
  /** Scrolls the grid `steps` steps of `rows` rows, one animation frame each. */
  readonly scroll: (steps: number, rows: number) => Promise<ScrollFigures>;
}

declare global {
  /** The harness page's handle, once it has rendered. */
  var parallaxBench: BenchPage | undefined;
}

/** The trades as the demo's page of all trades opens them. */
const tradesLayout: LayoutInput = { dataset: "trades" };

/** The demo's reference pivot: fund, strategy, sector and ticker by asset class, three levels open. */
const referencePivot: LayoutInput = {
  dataset: "positions",
  expand_depth: 3,
  group_by: ["fund", "strategy", "sector", "ticker"],
  measures: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
    { aggregate: "count_all" },
  ],
  split_by: ["asset_class"],
};

/** A measured step: its name in the figures, and the layout it shows. */
interface Step {
  readonly name: string;
  readonly layout: LayoutInput;
}

/** One round of the trades' changes, which ends where it began. `ticker` is text, `quantity` a decimal and
 * `trade_date` a date. */
function tradeSteps(): readonly Step[] {
  const sorted = (column: string, descending: boolean): LayoutInput => ({
    ...tradesLayout,
    sort: [{ column, descending }],
  });
  const buys = { column: "side", op: "eq", value: "Buy" } as const;
  return [
    { layout: sorted("ticker", false), name: "sortText" },
    { layout: sorted("ticker", true), name: "toggleText" },
    { layout: sorted("quantity", false), name: "sortNumber" },
    { layout: sorted("quantity", true), name: "toggleNumber" },
    { layout: sorted("trade_date", false), name: "sortDate" },
    { layout: sorted("trade_date", true), name: "toggleDate" },
    { layout: { ...sorted("trade_date", true), filters: [buys] }, name: "filterUnderSort" },
    { layout: tradesLayout, name: "reset" },
    { layout: { ...tradesLayout, filters: [buys] }, name: "filter" },
    { layout: tradesLayout, name: "clearFilter" },
    { layout: { ...tradesLayout, search: "Bank" }, name: "search" },
    { layout: tradesLayout, name: "clearSearch" },
  ];
}

/** One round of the positions' changes, which ends where it began: two other pivots, the reference pivot again from
 * scratch, then expand all and collapse all on it, as the toolbar's buttons do. */
function positionSteps(): readonly Step[] {
  const byRegion: LayoutInput = {
    dataset: "positions",
    expand_depth: 2,
    group_by: ["asset_class", "region", "currency"],
    measures: [
      { aggregate: "sum", column: "market_value_usd" },
      { aggregate: "sum", column: "unrealized_pnl_usd" },
    ],
  };
  const byBook: LayoutInput = {
    dataset: "positions",
    expand_depth: 1,
    group_by: ["portfolio_manager", "book"],
    group_sort: { by: { measure: 0 }, descending: true },
    measures: [{ aggregate: "sum", column: "notional_usd" }, { aggregate: "count_all" }],
    split_by: ["long_short"],
  };
  const levels = referencePivot.group_by?.length ?? 0;
  return [
    { layout: byRegion, name: "pivotByRegion" },
    { layout: byBook, name: "pivotByBook" },
    { layout: referencePivot, name: "referencePivot" },
    { layout: { ...referencePivot, expand_depth: levels, expanded: [] }, name: "expandAll" },
    { layout: { ...referencePivot, expand_depth: 0, expanded: [] }, name: "collapseAll" },
    { layout: referencePivot, name: "reopen" },
  ];
}

/** The layout a page of `dataset` opens with. */
function firstLayout(dataset: BenchDataset): LayoutInput {
  return dataset === "trades" ? tradesLayout : referencePivot;
}

/** The steps of one round over `dataset`. */
function stepsOf(dataset: BenchDataset): readonly Step[] {
  return dataset === "trades" ? tradeSteps() : positionSteps();
}

export { benchKeys, firstLayout, stepsOf };
export type { BenchDataset, BenchPage, BenchState, ScrollFigures, Step };
