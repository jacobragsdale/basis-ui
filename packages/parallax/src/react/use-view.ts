/* `useView()`: a view of a dataset, as a layout describes it, and what the engine sends for it. */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

import type { ParallaxClient } from "#engine/client.ts";
import type { ViewHandle } from "#engine/view.ts";
import type { ChartWindow, Viewport } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import { checkLayout } from "#layout/layout.ts";
import type { Layout, LayoutInput } from "#layout/layout.ts";

import { ViewAttempt } from "./attempt.ts";
import type { ChartSink, FrameSink, Opened, Opening, Sinks } from "./attempt.ts";
import { useParallaxClient } from "./context.ts";
import { useLatest } from "./latest.ts";
import type { Dataset } from "./use-dataset.ts";
import { viewStateOf } from "./view-state.ts";
import type { ViewState } from "./view-state.ts";

/** What a view asks the engine for besides its layout. */
interface ViewOptions {
  /** The rows and data columns to fetch: by default the first 100 rows of up to 100 columns. Null asks for none, as
   * a chart the engine reduces, such as a line or a candlestick, must: it has no rows, and the engine refuses a
   * viewport for it. */
  readonly viewport?: Viewport | null;
  /** For a chart the engine reduces, such as a line or a candlestick: the part to reduce and the plot's size. */
  readonly chartWindow?: ChartWindow;
  /** Takes each reduction of the view's chart, with the view it is of, in place of the state's `chart`, which then
   * stays null, so a chart can paint its frames without a React render each. */
  readonly onChart?: (chart: ChartFrameData, handle: ViewHandle) => void;
  /**
   * Takes each frame in place of `frame`, which then stays null, so that a component that draws frames as they
   * arrive, such as a grid scrolling at 60 frames a second, renders only when it chooses to. The newest function given
   * takes each frame; a new one reopens nothing.
   */
  readonly onFrame?: (frame: FrameData) => void;
}

/** A view as `useView` returns it. */
interface View extends ViewState {
  /** The layout with every default filled in, or null when it is not a valid layout. */
  readonly layout: Layout | null;
  /** The open view, for what a component asks of it directly, such as scrolling, fetching rows to copy, or measuring;
   * null until it opens. */
  readonly handle: ViewHandle | null;
}

const defaultViewport: Viewport = { columnCount: 100, firstColumn: 0, firstRow: 0, rowCount: 100 };

/** What the view's effects need: the dataset and engine it opens on, whether it can, and the newest of what it
 * opens with. */
interface Target {
  readonly client: ParallaxClient;
  readonly name: string;
  readonly key: string;
  readonly ready: boolean;
  readonly latestRef: RefObject<Opening | null>;
  readonly sinks: Sinks;
}

/** Opens the view whenever its dataset, its engine or whether it can open changes, closing the one before. */
function useOpen(target: Target, report: (update: (was: Opened | null) => Opened) => void): void {
  const { client, name, key, ready, latestRef, sinks } = target;
  useEffect(() => {
    const first = latestRef.current;
    if (!ready || first === null) {
      return (): void => undefined;
    }
    const run = new ViewAttempt(key, report, sinks);
    run.open(client, name, first).catch(reportError);
    return (): void => {
      run.end();
    };
  }, [client, key, latestRef, name, ready, report, sinks]);
}

/** Updates the open view's layout in place, and asks for its window and its chart's, when they change. */
function useWindows(handle: ViewHandle | null, opening: Opening | null): void {
  const layoutJson = opening?.layoutJson ?? null;
  const rows = opening?.viewport !== null;
  const { firstRow, rowCount, firstColumn, columnCount } = opening?.viewport ?? defaultViewport;
  const { width = 0, height = 0, x, y } = opening?.chartWindow ?? {};
  const [xFrom, xTo] = x ?? [];
  const [yFrom, yTo] = y ?? [];
  useEffect(() => {
    if (handle !== null && layoutJson !== null && handle.layoutJson !== layoutJson) {
      /* A view without rows is answered with its chart; any other with the window last asked for, answered or not,
       * so that an update at rest is in flight until its answer comes, and those after it wait. */
      handle.update(layoutJson, rows ? (): Viewport | null => handle.latestViewport() : null);
    }
  }, [handle, layoutJson, rows]);
  useEffect(() => {
    if (rows) {
      handle?.setViewport({ columnCount, firstColumn, firstRow, rowCount });
    }
  }, [handle, columnCount, firstColumn, firstRow, rowCount, rows]);
  useEffect(() => {
    if (handle !== null && width > 0 && height > 0) {
      handle.setChartWindow({
        height,
        width,
        ...(xFrom === undefined || xTo === undefined ? {} : { x: [xFrom, xTo] }),
        ...(yFrom === undefined || yTo === undefined ? {} : { y: [yFrom, yTo] }),
      });
    }
  }, [handle, height, width, xFrom, xTo, yFrom, yTo]);
}

/** What a valid layout's view opens with, or null for a layout that is not valid. */
function openingOf(checked: ReturnType<typeof checkLayout>, options: ViewOptions): Opening | null {
  if (!checked.ok) {
    return null;
  }
  return {
    chartWindow: options.chartWindow ?? null,
    layoutJson: JSON.stringify(checked.layout),
    viewport: options.viewport === undefined ? defaultViewport : options.viewport,
  };
}

/** Hands each chart reduction to the newest `onChart`, if the view has one; one function for the hook's life, so it
 * never reopens the view. */
function useChartSink(onChart: ViewOptions["onChart"]): ChartSink {
  const onChartRef = useLatest(onChart);
  return useCallback(
    (chart: ChartFrameData, handle: ViewHandle): boolean => {
      const newest = onChartRef.current;
      if (newest === undefined) {
        return false;
      }
      newest(chart, handle);
      return true;
    },
    [onChartRef],
  );
}

/** Hands each frame to the newest `onFrame`, if the view has one; one function for the hook's life, so it never
 * reopens the view. */
function useFrameSink(onFrame: ViewOptions["onFrame"]): FrameSink {
  const onFrameRef = useLatest(onFrame);
  return useCallback(
    (frame: FrameData): boolean => {
      const newest = onFrameRef.current;
      newest?.(frame);
      return newest !== undefined;
    },
    [onFrameRef],
  );
}

/** What takes the view's reports out of its state, the same object for the hook's life. */
function useSinks(options: ViewOptions): Sinks {
  const chart = useChartSink(options.onChart);
  const frame = useFrameSink(options.onFrame);
  return useMemo(() => ({ chart, frame }), [chart, frame]);
}

/** Whether a view of the dataset can open: once it is loading, since a view waits for its load. */
function canOpen(dataset: Dataset): boolean {
  return dataset.status === "loading" || dataset.status === "loaded";
}

/**
 * Opens a view of `dataset`, which `useDataset` loads, as `layout` describes it, and reports what the engine sends:
 * its frames, its chart's reduction, its table's status, and why it failed. The layout's dataset is `dataset`'s.
 *
 * The view opens while its dataset loads, and waits for it. A changed layout updates the open view in place, and a
 * changed viewport or chart window asks for that window, without reopening. When the engine restarts, the view fails
 * with the reason, and opens again once the dataset has loaded again. With `onChart`, the chart's reductions go to it
 * rather than into the state, and with `onFrame`, the frames do, so a scroll that asks `handle` for rows renders
 * nothing.
 */
function useView(dataset: Dataset, layout: LayoutInput, options: ViewOptions = {}): View {
  const client = useParallaxClient();
  const checked = checkLayout({ ...layout, dataset: dataset.name });
  const opening = openingOf(checked, options);
  const key = `${String(dataset.engine)}:${dataset.name}`;
  const [opened, setOpened] = useState<Opened | null>(null);
  const latestRef = useLatest(opening);
  useOpen(
    {
      client,
      key,
      latestRef,
      name: dataset.name,
      ready: opening !== null && canOpen(dataset),
      sinks: useSinks(options),
    },
    setOpened,
  );
  const current = opened?.key === key ? opened : null;
  useWindows(current?.handle ?? null, opening);
  return {
    ...viewStateOf(dataset, checked, current?.state ?? null),
    handle: current?.handle ?? null,
    layout: checked.ok ? checked.layout : null,
  };
}

export { useView };
export type { View, ViewOptions };
