/* `<Chart>` over a dataset: a view of it opened with `useView`, whose frames the chart's scene paints without a React
 * render, and the chrome React renders around the canvas. */

import { cn } from "cn";
import type { ReactNode } from "react";

import type { Layout, LayoutFilter, LayoutInput } from "#layout/layout.ts";
import { MaximizeContext, useMaximize } from "#react/maximize.ts";
import { MaximizeBefore, MaximizeButton } from "#react/maximize-parts.tsx";
import type { Dataset } from "#react/use-dataset.ts";
import { useErrorReport } from "#react/use-view.ts";

import { ChartLegend, ChartStatus, ChartTools, CompactLegend } from "./chart-chrome.tsx";
import { ChartPlot } from "./chart-plot.tsx";
import { describeChart } from "./describe.ts";
import type { CategoryData } from "./model-types.ts";
import { hasDrawingTools } from "./scene-inputs.ts";
import { groupsProblem } from "./source.ts";
import type { ChartSelection } from "./scene.ts";
import { useChart } from "./use-chart.ts";
import type { ChartState } from "./use-chart.ts";

/** What every form of `<Chart>` takes besides its data. */
interface ChartOptions {
  /** Called with the layout the chart changed: a series hidden or shown, a zoom, a drawing. Without it the chart keeps
   * its own changes until its `layout` changes. */
  readonly onLayoutChange?: (layout: Layout) => void;
  /** Takes the reason the chart shows in place of its data, or for a change the engine refused, whenever it changes, and
   * null once it clears: a layout the engine cannot open, such as a saved one that names a column the API dropped,
   * which the app may then reset. */
  readonly onError?: (error: string | null) => void;
  /** The filters a Shift-drag brush selects, for linked views; null once the brush is cleared. */
  readonly onBrush?: (filters: readonly LayoutFilter[] | null) => void;
  /** The group whose bar or slice was clicked, or the scatter's dot by its id, for linked views; null once the
   * selection is cleared. */
  readonly onSelect?: (selection: ChartSelection | null) => void;
  /** The group whose crosshairs move together: by default charts of the same dataset, x column and axis; null keeps
   * the crosshair to this chart. */
  readonly sync?: string | null;
  /** Whether the status line shows under the chart; a small tile can do without it. On by default. */
  readonly status?: boolean;
  /** The chart's name for a screen reader; by default the chart says what it draws, of what and from where. */
  readonly label?: string;
  /** Whether the chart has a Maximize button, and Alt+Enter, which make it fill the window until Escape or Restore.
   * On by default. */
  readonly maximize?: boolean;
  /** Placement classes, such as `flex-1` or `h-80`. */
  readonly className?: string;
}

/** `<Chart>` over a dataset that `useDataset` loads. */
interface ChartViewProps extends ChartOptions {
  /** The dataset to draw, from `useDataset`. */
  readonly dataset: Dataset;
  /** The view and its chart, as a layout: its `chart` section says what to draw. */
  readonly layout: LayoutInput;
  /** Puts the groups of a bar chart, heatmap or pie in another order than the engine's. */
  readonly order?: ((data: CategoryData) => CategoryData) | null;
  /** Where the chart says its data comes from, in its status line and text alternative: the dataset's name by
   * default. */
  readonly source?: string;
}

/** What the chart says is wrong, or null: its layout, what a grouped chart lacks, or the view's error. */
function problemOf({ checked, layout, view }: ChartState): string | null {
  if (!checked.ok) {
    return `Invalid layout: ${checked.error}`;
  }
  if (layout === null) {
    return "The layout has no chart section.";
  }
  return groupsProblem(layout) ?? view.error;
}

/** The chart's head: its legend, and the drawing tools on charts that take drawings and keep their tools on. With
 * Maximize in the corner it leaves room there: at its end in a row, at its top in a pie's column beside it. */
function ChartHead({
  chart,
  maximize,
}: {
  readonly chart: ChartState;
  readonly maximize: boolean;
}): ReactNode {
  const { scene, legend, editor, beside, compact } = chart;
  // A small chart names its marks too, where they need it: a pie's slices, or more than one series.
  const named = chart.layout?.chart?.kind === "pie" || legend.length > 1;
  const shown = legend.length > 0 && (!compact || named);
  const drawable = hasDrawingTools(chart.layout?.chart ?? null);
  if (!shown && !drawable) {
    return null;
  }
  return (
    <div
      data-slot="chart-head"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1.5",
        beside && "max-w-1/2 shrink-0 flex-col items-stretch overflow-auto py-1.5 pr-3",
        maximize && (beside ? "pt-9" : "pr-9"),
      )}
    >
      {shown && compact ? <CompactLegend entries={legend} /> : null}
      {shown && !compact ? (
        <ChartLegend
          entries={legend}
          beside={beside}
          onToggle={(label) => {
            scene.toggle(label);
          }}
        />
      ) : null}
      {drawable ? (
        <ChartTools
          tool={editor.tool}
          selected={editor.selected !== null}
          onPick={(tool) => {
            scene.editor.pick(tool);
          }}
          onRemove={() => {
            scene.removeDrawing();
          }}
        />
      ) : null}
    </div>
  );
}

/** Maximize, in the chart's top right corner: shown while the pointer is over the chart or the button has focus, so it
 * hides no data until it is wanted, and always while the chart fills the window. */
function CornerMaximize(): ReactNode {
  return (
    <div
      data-slot="chart-maximize"
      className="absolute top-1 right-1 z-20 opacity-0 transition-opacity group-hover/chart:opacity-100 group-data-maximized/chart:opacity-100 focus-within:opacity-100"
    >
      <MaximizeButton />
    </div>
  );
}

/** A chart of a view, drawn on a Canvas 2D surface. */
function ChartView(props: ChartViewProps): ReactNode {
  const chart = useChart({ ...props, order: props.order ?? null });
  const { layout, scene } = chart;
  const { root, summary, asOf, words } = scene.parts.mount;
  const source = props.source ?? props.dataset.name;
  // A chart with a problem says it in place of the plot, with no legend of what it cannot draw.
  const problem = problemOf(chart);
  useErrorReport(problem, props.onError);
  const description =
    props.label ?? (layout === null ? "Chart" : describeChart({ ...layout, dataset: source }));
  const maximizing = useMaximize(() => scene.parts.get("root"), description);
  const maximize = props.maximize ?? true;
  return (
    <MaximizeContext value={maximizing.state}>
      {maximize ? <MaximizeBefore maximizing={maximizing} /> : null}
      <div
        {...chart.attributes}
        {...(maximize ? maximizing.props : {})}
        ref={root}
        data-slot="chart"
        className={cn(
          // It fills a parent of a set height, a block's as well as a flex column's, and is at least 120 px tall.
          "group/chart relative flex h-full min-h-30 flex-col bg-card text-xs text-card-foreground",
          "data-maximized:fixed data-maximized:inset-4 data-maximized:z-50 data-maximized:h-auto data-maximized:rounded-xl data-maximized:border data-maximized:p-2 data-maximized:shadow-md",
          props.className,
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", chart.beside && "flex-row-reverse")}>
          {problem === null ? <ChartHead chart={chart} maximize={maximize} /> : null}
          <ChartPlot
            scene={scene}
            editor={chart.editor}
            description={description}
            wordsId={chart.wordsId}
            problem={problem}
          />
        </div>
        {(props.status ?? true) ? (
          <ChartStatus dataset={source} summaryRef={summary} asOfRef={asOf} />
        ) : null}
        <p ref={words} id={chart.wordsId} className="sr-only" />
        {maximize ? <CornerMaximize /> : null}
      </div>
    </MaximizeContext>
  );
}

export { ChartView };
export type { ChartOptions, ChartViewProps };
