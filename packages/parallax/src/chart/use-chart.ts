/* The hooks behind `<Chart>`: its layout, its view of the dataset, and its scene, kept up to date with both. */

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";

import { checkLayout } from "#layout/layout.ts";
import type { Layout, LayoutCheck, LayoutFilter, LayoutInput } from "#layout/layout.ts";
import { useLatest } from "#react/latest.ts";
import type { Dataset } from "#react/use-dataset.ts";
import { useParallaxTheme } from "#react/use-theme.ts";
import type { ParallaxThemeAttributes } from "#react/use-theme.ts";
import { useView } from "#react/use-view.ts";
import type { View } from "#react/use-view.ts";

import type { EditorState } from "./drawing-editor.ts";
import { engineLayout } from "./engine-layout.ts";
import type { CategoryData, LegendEntry } from "./model-types.ts";
import type { PlotSize } from "./scene-inputs.ts";
import { ChartScene } from "./scene.ts";
import type { ChartSelection } from "./scene.ts";
import { drawsGroups, groupsViewport, withGroupsFromXY } from "./source.ts";

/** Below this size a chart is compact: less padding, and no legend. */
const compactWidth = 260;
const compactHeight = 200;
/** A pie at least this wide lists its slices beside it, as Excel does, rather than above it. */
const besideWidth = 360;

/** What a chart tells the page. */
interface ChartCallbacks {
  readonly onLayoutChange?: ((layout: Layout) => void) | undefined;
  readonly onBrush?: ((filters: readonly LayoutFilter[] | null) => void) | undefined;
  readonly onSelect?: ((selection: ChartSelection | null) => void) | undefined;
}

/** What `useChart` is given. */
interface ChartInput extends ChartCallbacks {
  readonly dataset: Dataset;
  readonly layout: LayoutInput;
  readonly sync?: string | null | undefined;
  readonly order: ((data: CategoryData) => CategoryData) | null;
}

/** The plot's size and the chart's own. */
interface Sizes {
  readonly plot: PlotSize;
  readonly outer: PlotSize;
}

/** A chart's state, for its chrome. */
interface ChartState {
  readonly scene: ChartScene;
  readonly checked: LayoutCheck;
  /** The checked layout, if it is valid and has a chart section. */
  readonly layout: Layout | null;
  readonly view: View;
  readonly legend: readonly LegendEntry[];
  readonly editor: EditorState;
  readonly attributes: ParallaxThemeAttributes;
  readonly wordsId: string;
  /** A small tile's chart: less padding, and no legend. */
  readonly compact: boolean;
  /** Whether a pie's legend goes beside it. */
  readonly beside: boolean;
}

/** The chart's own change to its layout, and the layout it was given when it made it. */
interface Own {
  readonly from: string;
  readonly layout: Layout;
}

const noSizes: Sizes = { outer: { height: 0, width: 0 }, plot: { height: 0, width: 0 } };

/** Whether a chart of this size is compact: a small tile's, with less padding and no legend. */
function isCompact(outer: PlotSize): boolean {
  return outer.width > 0 && (outer.width < compactWidth || outer.height < compactHeight);
}

function sameSizes(first: Sizes, second: Sizes): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** The layout a chart draws: the one it was given, or its own change to it, until it is given another. */
function useOwnLayout(given: LayoutInput): {
  readonly current: LayoutInput;
  readonly keep: (next: Layout) => void;
} {
  const [own, setOwn] = useState<Own | null>(null);
  const givenJson = JSON.stringify(given);
  return {
    current: own?.from === givenJson ? own.layout : given,
    keep: (next) => {
      setOwn({ from: givenJson, layout: next });
    },
  };
}

/** The view of the dataset: a reduced chart's window at the plot's size, a grouped chart's first groups. */
function useChartView(
  scene: ChartScene,
  data: {
    readonly dataset: Dataset;
    readonly current: LayoutInput;
    readonly layout: Layout | null;
  },
  plot: PlotSize,
): View {
  const { layout } = data;
  const reduced = layout !== null && !drawsGroups(layout);
  const range = layout?.chart?.range ?? null;
  const window =
    reduced && plot.width > 0 && plot.height > 0
      ? {
          chartWindow: {
            ...plot,
            ...(range === null ? {} : { x: [range.from, range.to] as const }),
          },
        }
      : {};
  return useView(data.dataset, layout === null ? data.current : engineLayout(layout), {
    ...window,
    onChart: (frame, handle) => {
      scene.setFrame(frame, handle);
    },
    viewport: reduced ? null : groupsViewport,
  });
}

/** Tells the scene what to call back, through the newest callbacks. */
function useSceneHost(
  scene: ChartScene,
  callbacks: ChartCallbacks & {
    readonly keep: (next: Layout) => void;
    readonly setLegend: (entries: readonly LegendEntry[]) => void;
    readonly setSizes: (update: (before: Sizes) => Sizes) => void;
  },
): void {
  const latestRef = useLatest(callbacks);
  useEffect(() => {
    scene.setHost({
      brushed: (filters) => latestRef.current.onBrush?.(filters),
      layoutChange: (next) => {
        latestRef.current.keep(next);
        latestRef.current.onLayoutChange?.(next);
      },
      legend: (entries) => {
        latestRef.current.setLegend(entries);
      },
      resized: (plot, outer) => {
        const next = { outer, plot };
        latestRef.current.setSizes((before) => (sameSizes(before, next) ? before : next));
      },
      selected: (selection) => latestRef.current.onSelect?.(selection),
    });
  }, [scene, latestRef]);
}

/** Hands the scene the layout, the view's handle and groups, the plot's size and the theme as they change. */
function useSceneInputs(
  scene: ChartScene,
  inputs: Pick<ChartInput, "sync" | "order"> & {
    readonly layout: Layout | null;
    readonly view: View;
    readonly plot: PlotSize;
    readonly compact: boolean;
  },
): ParallaxThemeAttributes {
  const { layout, sync, view, order, plot, compact } = inputs;
  const { attributes, read } = useParallaxTheme();
  useEffect(() => {
    scene.setLayout(layout, sync);
  }, [scene, layout, sync]);
  useEffect(() => {
    scene.setHandle(view.handle);
    scene.setGroups(view.frame, order);
  }, [scene, view.handle, view.frame, order]);
  useEffect(() => {
    scene.setSize(plot, compact);
  }, [scene, plot, compact]);
  useEffect(() => {
    scene.setThemeReader(read);
  }, [scene, read]);
  return attributes;
}

/** A chart of a dataset: its layout, its view, and the scene that draws it. */
function useChart(input: ChartInput): ChartState {
  const { current, keep } = useOwnLayout(input.layout);
  const checked = checkLayout({ ...current, dataset: input.dataset.name });
  // A grouped chart given as x and y draws the grouped view they make, as the small-data form's does.
  const layout =
    checked.ok && checked.layout.chart !== null ? withGroupsFromXY(checked.layout) : null;
  const scene = useMemo(() => new ChartScene(), []);
  const [sizes, setSizes] = useState(noSizes);
  const compact = isCompact(sizes.outer);
  const [legend, setLegend] = useState<readonly LegendEntry[]>([]);
  useSceneHost(scene, { ...input, keep, setLegend, setSizes });
  const view = useChartView(scene, { current, dataset: input.dataset, layout }, sizes.plot);
  return {
    attributes: useSceneInputs(scene, { ...input, compact, layout, plot: sizes.plot, view }),
    beside: layout?.chart?.kind === "pie" && !compact && sizes.outer.width >= besideWidth,
    checked,
    compact,
    editor: useSyncExternalStore(scene.subscribeEditor, scene.editorState),
    layout,
    legend,
    scene,
    view,
    wordsId: useId(),
  };
}

export { useChart };
export type { ChartCallbacks, ChartInput, ChartState };
