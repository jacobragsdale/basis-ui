/* The scale harness's page: one dataset of the size the address names, `?dataset=trades&rows=1000000`, filling the
 * window, as a grid of the trades or the reference pivot of the positions, on the package's build. It offers the bench
 * `window.parallaxBench`, which changes the layout and times each change to the canvas, and scrolls the grid. */

import { Grid, Pivot, useDataset } from "@basis/parallax";
import type { DatasetSource, DrawStats, GridHandle, LayoutInput } from "@basis/parallax";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { benchKeys, firstLayout } from "./protocol.ts";
import type { BenchDataset, BenchPage, BenchState, ScrollFigures } from "./protocol.ts";

const changeTimeoutMs = 600_000;
const pollMs = 10;
const longFrameMs = 50;
const ninetyFifth = 0.95;
/** How long the last frames of a scroll have to arrive. */
const settleMs = 200;

/** The dataset and its size, from the address. */
function chosen(): { readonly dataset: BenchDataset; readonly rows: string } {
  const search = new URLSearchParams(location.search);
  const rows = search.get("rows") ?? "150000";
  return { dataset: search.get("dataset") === "positions" ? "positions" : "trades", rows };
}

const { dataset, rows } = chosen();

/** The dataset's Arrow stream, as the bench wrote it beside the page: the response itself, whose body the engine reads
 * as it arrives, as an app's source streams. */
const source: DatasetSource = async () => {
  const url = `data/${dataset}-${rows}.arrows`;
  // oxlint-disable-next-line basis/no-fetch -- the harness reads files the bench wrote beside it; it calls no API, so there is no generated client to go through.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}; run vp run @basis/parallax#bench`);
  }
  return response;
};

async function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, ms, undefined);
  return promise;
}

async function nextFrame(): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  return promise;
}

function handleOf(grid: RefObject<GridHandle | null>): GridHandle {
  if (grid.current === null) {
    throw new Error("The grid is not drawn yet.");
  }
  return grid.current;
}

/** Resolves when the grid has drawn a change sent at or after `since`, with the milliseconds from `since`. */
async function drawnAfter(grid: RefObject<GridHandle | null>, since: number): Promise<number> {
  const deadline = since + changeTimeoutMs;
  for (;;) {
    const drawn = handleOf(grid)
      .drawStats()
      .changes.find((change) => change.sentAtMs >= since);
    if (drawn !== undefined) {
      return drawn.drawnAtMs - since;
    }
    if (performance.now() > deadline) {
      throw new Error(`The grid drew no change within ${String(changeTimeoutMs)} ms.`);
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling until the change is drawn is the point.
    await pause(pollMs);
  }
}

/** Counts long animation frames until the returned stop is called. */
function countLongFrames(): () => number {
  let count = 0;
  if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    return () => count;
  }
  const observer = new PerformanceObserver((list) => {
    count += list.getEntries().filter((entry) => entry.duration > longFrameMs).length;
  });
  observer.observe({ buffered: false, type: "long-animation-frame" });
  return () => {
    observer.disconnect();
    return count;
  };
}

/** Scrolls `scroller` by `px` a frame, `steps` times, and returns each frame's interval. */
async function frameIntervals(
  scroller: HTMLElement,
  { steps, px }: { readonly steps: number; readonly px: number },
): Promise<readonly number[]> {
  const intervals: number[] = [];
  let last = await nextFrame();
  for (let step = 0; step < steps; step += 1) {
    scroller.scrollTop += px;
    // oxlint-disable-next-line eslint/no-await-in-loop -- each step waits for its frame, which is what is measured.
    const now = await nextFrame();
    intervals.push(now - last);
    last = now;
  }
  return intervals;
}

/** A scroll's figures, from its frames' intervals and the grid's counters before and after it. */
function scrollFigures(
  intervals: readonly number[],
  {
    before,
    after,
    longFrames,
  }: { readonly before: DrawStats; readonly after: DrawStats; readonly longFrames: number },
): ScrollFigures {
  const frames = after.frames - before.frames;
  const sorted = intervals.toSorted((first, second) => first - second);
  return {
    drawMsPerFrame: frames === 0 ? 0 : (after.drawMs - before.drawMs) / frames,
    frames,
    longFrames,
    maxFrameMs: sorted.at(-1) ?? 0,
    meanFrameMs: intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length,
    p95FrameMs: sorted[Math.floor(ninetyFifth * (sorted.length - 1))] ?? 0,
  };
}

/** Scrolls the grid's scroller by `rows` rows a frame, `steps` times, and measures it. */
async function scrollGrid(
  grid: RefObject<GridHandle | null>,
  { steps, rows: rowsPerStep }: { readonly steps: number; readonly rows: number },
): Promise<ScrollFigures> {
  const scroller = document.querySelector<HTMLElement>("[role=grid]");
  if (scroller === null) {
    throw new Error("The page has no grid to scroll.");
  }
  const rowPx = scroller.scrollHeight / Math.max(1, Number(scroller.getAttribute("aria-rowcount")));
  const before = handleOf(grid).drawStats();
  const stopCounting = countLongFrames();
  const intervals = await frameIntervals(scroller, { px: rowPx * rowsPerStep, steps });
  // The last frames' rows arrive from the engine after the scroll.
  await pause(settleMs);
  return scrollFigures(intervals, {
    after: handleOf(grid).drawStats(),
    before,
    longFrames: stopCounting(),
  });
}

/** The load's state as the page last rendered it, and when it was first loaded, for the bench's handle. */
const progress: { load: Omit<BenchState, "firstRowsMs" | "loadedMs">; loadedAtMs: number | null } =
  {
    load: { error: null, rows: null, status: "idle" },
    loadedAtMs: null,
  };

/** The load's state, with when the grid drew its first rows and when the dataset was loaded and drawn. */
function stateOf(grid: RefObject<GridHandle | null>): BenchState {
  const first = grid.current?.drawStats().firstRows?.drawnAtMs ?? null;
  const loaded = progress.loadedAtMs;
  return {
    ...progress.load,
    firstRowsMs: first,
    loadedMs: loaded === null || first === null ? null : Math.max(loaded, first),
  };
}

/** Keeps when the dataset loaded, and offers the bench its handle. */
function useBenchHandle(
  grid: RefObject<GridHandle | null>,
  {
    load,
    setLayout,
  }: {
    readonly load: BenchState;
    readonly setLayout: (layout: LayoutInput) => void;
  },
): void {
  const { error, rows: held, status } = load;
  useEffect(() => {
    progress.load = { error, rows: held, status };
    if (status === "loaded" && progress.loadedAtMs === null) {
      progress.loadedAtMs = performance.now();
    }
  }, [error, held, status]);
  useEffect(() => {
    const page: BenchPage = {
      change: async (layout) => {
        const since = performance.now();
        setLayout(layout);
        return drawnAfter(grid, since);
      },
      scroll: async (steps, rowsPerStep) => scrollGrid(grid, { rows: rowsPerStep, steps }),
      state: () => stateOf(grid),
    };
    globalThis.parallaxBench = page;
  }, [grid, setLayout]);
}

/** The page: the dataset's grid or pivot, filling the window. */
function Bench(): ReactNode {
  const data = useDataset(dataset, source, { primaryKey: benchKeys[dataset] });
  const [layout, setLayout] = useState<LayoutInput>(firstLayout(dataset));
  const grid = useRef<GridHandle>(null);
  useBenchHandle(grid, {
    load: {
      error: data.error,
      firstRowsMs: null,
      loadedMs: null,
      rows: data.rows,
      status: data.status,
    },
    setLayout,
  });
  return (
    <main>
      {dataset === "trades" ? (
        <Grid ref={grid} dataset={data} layout={layout} onLayoutChange={setLayout} height="fill" />
      ) : (
        <Pivot
          ref={grid}
          dataset={data}
          layout={layout}
          onLayoutChange={setLayout}
          defaultSettingsOpen={false}
        />
      )}
    </main>
  );
}

export { Bench };
