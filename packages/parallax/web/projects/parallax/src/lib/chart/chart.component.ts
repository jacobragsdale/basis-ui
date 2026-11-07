/**
 * `<px-chart>`: a chart of a parallax view, drawn on a Canvas 2D surface.
 *
 * The layout's `chart` section says what to draw. The engine reduces line, area,
 * scatter, histogram, candlestick and OHLC charts to the plot's pixels; bar
 * charts, heatmaps and pies draw the layout's grouped view. The legend's buttons
 * hide and show series, which the layout records. Clicking a bar or slice
 * selects its group, for a linked view to filter by. Under the chart, the status
 * bar says where the numbers come from and how old they are. A chart in a tile
 * smaller than 260 by 200 pixels is compact: less padding, and no legend.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild
} from "@angular/core";

import { StatusBarComponent } from "../grid/status-bar.component";
import { DRAWABLE_KINDS, checkLayout } from "../layout";
import type { Layout, LayoutFilter, LayoutInput, LayoutScalar } from "../layout";
import { CHART_COLORS, defaultTheme, readChartColors, readTheme, sameChartColors, sameTheme } from "../theme";
import type { ChartColors, ParallaxTheme, Scheme, Theme } from "../theme";
import { themed } from "../theming";
import { ChartHeadComponent, ChartMeasureComponent, ChartNoteComponent, ChartTipComponent } from "./chart-parts.component";
import { DrawingEditor, measureView } from "./drawing-editor";
import type { PlacedReading } from "./chart-parts.component";
import { chartSource, rowsPart, withPieLimit } from "./chart-source";
import type { PlotSize } from "./chart-source";
import { brushFilters, categoryAt, eventRows, indicatorRows, markAt, panRange, readSeries, zoomRange } from "./interaction";
import type { Range, Reading } from "./interaction";
import { chartModel, describeChart, plotBottom } from "./model";
import type { ChartModel, ModelInput } from "./model";
import { paintChart } from "./paint";
import { ChartSync } from "./sync";

const CHART_STYLES = `
  px-chart {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 120px;
    background: var(--_px-background);
    color: var(--_px-foreground);
    font: var(--_px-font-size) var(--_px-font-family);
  }
  px-chart .px-chart-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--_px-spacing) calc(var(--_px-spacing) * 3);
  }
  px-chart .px-chart-head:empty {
    display: none;
  }
  px-chart .px-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--_px-spacing) * 0.5) calc(var(--_px-spacing) * 3);
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2) 0;
  }
  px-chart .px-chart-tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--_px-spacing);
    margin-left: auto;
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2) 0;
  }
  px-chart .px-tool {
    padding: 1px calc(var(--_px-spacing) * 1.5);
    border: 1px solid var(--_px-border-color);
    border-radius: var(--_px-radius);
    background: transparent;
    color: var(--_px-foreground);
    font: inherit;
    font-size: var(--_px-font-size-small);
    cursor: pointer;
  }
  px-chart .px-tool[aria-pressed="true"] {
    border-color: var(--_px-selection-border);
    background: var(--_px-selection-background);
  }
  px-chart .px-tool:disabled {
    color: var(--_px-muted);
    cursor: default;
  }
  px-chart .px-chart-measure-band {
    position: absolute;
    border: 1px dashed var(--_px-selection-border);
    background: var(--_px-selection-background);
    opacity: 0.6;
    pointer-events: none;
  }
  px-chart .px-chart-note-input {
    position: absolute;
    width: 220px;
    padding: calc(var(--_px-spacing) * 0.5) calc(var(--_px-spacing) * 1.5);
    border: 1px solid var(--_px-selection-border);
    border-radius: var(--_px-radius);
    background: var(--_px-background);
    color: var(--_px-foreground);
    font: inherit;
    font-size: var(--_px-font-size-small);
  }
  px-chart .px-legend-entry {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--_px-spacing) * 1.5);
    padding: calc(var(--_px-spacing) * 0.5) var(--_px-spacing);
    border: 0;
    border-radius: var(--_px-radius);
    background: transparent;
    color: var(--_px-foreground);
    font: inherit;
    font-size: var(--_px-font-size-small);
    cursor: pointer;
  }
  px-chart .px-legend-entry[aria-pressed="false"] {
    color: var(--_px-muted);
    text-decoration: line-through;
  }
  px-chart .px-legend-entry:hover {
    background: var(--_px-stripe);
  }
  px-chart .px-legend-key {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  px-chart .px-legend-key.px-legend-line {
    height: 2px;
    width: 14px;
    border-radius: 1px;
  }
  px-chart .px-legend-entry[aria-pressed="false"] .px-legend-key {
    opacity: 0.35;
  }
  px-chart .px-chart-plot {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  px-chart .px-chart-plot {
    cursor: crosshair;
    outline: none;
    touch-action: none;
  }
  px-chart .px-chart-plot:focus-visible {
    box-shadow: inset 0 0 0 2px var(--_px-selection-border);
  }
  px-chart .px-chart-plot.px-chart-panning {
    cursor: grabbing;
  }
  px-chart px-status-bar[hidden] {
    display: none;
  }
  px-chart .px-chart-plot.px-chart-pick {
    cursor: pointer;
  }
  px-chart .px-legend-note {
    color: var(--_px-muted);
    font-variant-numeric: tabular-nums;
  }
  px-chart.px-chart-side {
    display: grid;
    grid-template: "plot head" minmax(0, 1fr) "status status" auto / minmax(0, 1fr) fit-content(45%);
  }
  px-chart.px-chart-side .px-chart-head {
    grid-area: head;
    align-self: center;
    max-height: 100%;
    overflow: auto;
  }
  /* Beside a big pie, the legend is a table: key, label, and the share right-aligned in its own column. */
  px-chart.px-chart-side .px-chart-legend {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 3) calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2);
  }
  px-chart.px-chart-side .px-legend-entry {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    white-space: nowrap;
    text-align: left;
  }
  px-chart.px-chart-side .px-legend-note {
    text-align: right;
  }
  px-chart.px-chart-side .px-chart-plot {
    grid-area: plot;
  }
  px-chart.px-chart-side px-status-bar {
    grid-area: status;
  }
  px-chart.px-chart-compact {
    min-height: 80px;
  }
  px-chart .px-chart-crosshair {
    position: absolute;
    width: 1px;
    background: var(--_px-muted);
    pointer-events: none;
  }
  px-chart .px-chart-brush {
    position: absolute;
    background: var(--_px-selection-background);
    border-left: 1px solid var(--_px-selection-border);
    border-right: 1px solid var(--_px-selection-border);
    pointer-events: none;
  }
  px-chart .px-chart-tip {
    position: absolute;
    z-index: 2;
    max-width: 280px;
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2);
    border: 1px solid var(--_px-border-color);
    border-radius: var(--_px-radius);
    background: var(--_px-header-background);
    color: var(--_px-header-foreground);
    font-size: var(--_px-font-size-small);
    box-shadow: var(--_px-shadow);
    pointer-events: none;
    white-space: nowrap;
  }
  px-chart .px-tip-title {
    margin-bottom: calc(var(--_px-spacing) * 0.5);
    color: var(--_px-muted);
  }
  px-chart .px-tip-row {
    display: flex;
    align-items: center;
    gap: calc(var(--_px-spacing) * 1.5);
    font-variant-numeric: tabular-nums;
  }
  px-chart .px-tip-key {
    display: inline-block;
    width: 10px;
    height: 2px;
  }
  px-chart .px-tip-row span:last-child {
    color: var(--_px-muted);
  }
  px-chart .px-chart-canvas {
    position: absolute;
    inset: 0;
    display: block;
  }
  px-chart .px-error {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    padding: calc(var(--_px-spacing) * 1.5) calc(var(--_px-spacing) * 2);
    border-radius: var(--_px-radius);
    background: var(--_px-danger);
    color: var(--_px-on-accent);
    font-size: var(--_px-font-size-small);
  }
`;

const COUNT = new Intl.NumberFormat("en-US");

/** A group selected by clicking its bar or slice: the outermost group column, and the group's exact key. */
export interface ChartSelection {
  readonly column: string;
  readonly value: LayoutScalar;
  /** The group's label, as the chart shows it. */
  readonly label: string;
}

/** Below this size a chart is compact: less padding, and no legend. */
const COMPACT_WIDTH = 260;
const COMPACT_HEIGHT = 200;
/** A pie at least this wide lists its slices beside it, as Excel does, rather than above it. */
const SIDE_LEGEND_WIDTH = 360;

/** About how wide a tooltip is, to keep it on the plot's right edge. */
const TIP_WIDTH = 200;

/** How far a step of the wheel or a key zooms. */
const ZOOM_IN = 0.8;
const ZOOM_OUT = 1.25;

/** What each key does to the plot. */
const KEYS: Readonly<Partial<Record<string, "in" | "out" | "left" | "right" | "all" | "clear" | "remove">>> = {
  "+": "in",
  "=": "in",
  "-": "out",
  ArrowLeft: "left",
  ArrowRight: "right",
  "0": "all",
  Delete: "remove",
  Backspace: "remove",
  Escape: "clear"
};

/** Words for what a chart shows, for its accessible name. */

@Component({
  selector: "px-chart",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ChartHeadComponent, ChartMeasureComponent, ChartNoteComponent, ChartTipComponent, StatusBarComponent],
  host: { "[attr.data-px-theme]": "theming.theme().name", "[attr.data-px-scheme]": "theming.resolved()", "[class.px-chart-compact]": "compact()", "[class.px-chart-side]": "sideLegend()" },
  template: `
    <px-chart-head
      [entries]="legend()"
      [drawable]="drawable()"
      [tool]="editor.tool()"
      [selected]="editor.selected() !== null"
      (toggled)="toggle($event)"
      (picked)="editor.pick($event)"
      (removed)="removeDrawing()"
    />
    <div
      class="px-chart-plot"
      #plot
      tabindex="0"
      [class.px-chart-panning]="panning()"
      [class.px-chart-pick]="pickable()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerCancel($event)"
      (pointerleave)="onPointerLeave()"
      (wheel)="onWheel($event)"
      (click)="onClick($event)"
      (dblclick)="reset()"
      (keydown)="onKeydown($event)"
    >
      <canvas class="px-chart-canvas" #canvas role="img" [attr.aria-label]="description()"></canvas>
      @if (band(); as b) {
        <div class="px-chart-brush" [style.left.px]="b.left" [style.top.px]="b.top" [style.width.px]="b.width" [style.height.px]="b.height"></div>
      }
      @if (reading(); as r) {
        <px-chart-tip [reading]="r" />
      }
      @if (problem(); as message) {
        <div class="px-error" role="alert">{{ message }}</div>
      }
      @if (editor.note(); as note) {
        <px-chart-note [at]="note.point" (done)="noteDone($event)" />
      }
      @if (measured(); as m) {
        <px-chart-measure [view]="m" />
      }
    </div>
    <px-status-bar
      [hidden]="!statusBar()"
      [dataset]="current()?.dataset ?? ''"
      [parameters]="current()?.parameters ?? {}"
      [summary]="summary()"
      [sourceAsOf]="source.frame()?.sourceAsOfMicros ?? null"
      [status]="source.status()"
    />
  `,
  styles: CHART_STYLES
})
export class ChartComponent {
  /** The view and its chart. Bind it two ways with `[(layout)]`. */
  public readonly layout = model.required<LayoutInput>();
  /** The theme, from `defineTheme`; by default the one given to `provideParallax`, else the standard theme. A token set in CSS wins over it. */
  public readonly theme = input<ParallaxTheme | undefined>(undefined);
  /** The light or dark scheme, or `auto` to follow the system; by default the one given to `provideParallax`, else light. */
  public readonly scheme = input<Scheme | undefined>(undefined);
  /** The theme and scheme in effect. */
  protected readonly theming = themed(this.theme, this.scheme);
  /**
   * The group whose crosshairs move together. By default, charts of the same dataset, x column and axis; `null`
   * keeps the crosshair to this chart.
   */
  public readonly sync = input<string | null | undefined>(undefined);
  /** The filters selecting a range brushed with Shift and drag, for linked views; null when the brush is cleared. */
  public readonly brushed = output<readonly LayoutFilter[] | null>();
  /** The group whose bar or slice was clicked, for linked views; null when the selection is cleared. */
  public readonly selectionChange = output<ChartSelection | null>();
  /** Whether the status bar shows under the chart; a small tile can do without it. */
  public readonly statusBar = input(true);

  private readonly checked = computed(() => checkLayout(this.layout()));
  protected readonly current = computed((): Layout | null => {
    const checked = this.checked();
    return checked.ok && checked.layout.chart !== null ? checked.layout : null;
  });
  protected readonly source = chartSource(computed(() => withPieLimit(this.current())));
  private readonly size = signal<PlotSize>({ width: 0, height: 0 });
  /** The whole chart's size, which decides whether it is compact: the plot's own changes with the legend. */
  private readonly outer = signal<PlotSize>({ width: 0, height: 0 });
  protected readonly compact = computed(() => {
    const { width, height } = this.outer();
    return width > 0 && (width < COMPACT_WIDTH || height < COMPACT_HEIGHT);
  });
  protected readonly sideLegend = computed(() => this.current()?.chart?.kind === "pie" && !this.compact() && this.outer().width >= SIDE_LEGEND_WIDTH);
  /** The selected group, by its label. */
  private readonly selected = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly colors = signal<ChartColors>(CHART_COLORS.light, { equal: sameChartColors });
  private readonly tokens = signal<Theme>(defaultTheme("light"), { equal: sameTheme });
  private readonly plot = viewChild.required<ElementRef<HTMLDivElement>>("plot");
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");
  private readonly document = inject(DOCUMENT);
  private readonly measurer = this.document.createElement("canvas").getContext("2d");
  private readonly widths = new Map<string, number>();

  /** What the draw model is made from: the latest data at the plot's size, measured in the axes' font. */
  private readonly modelInput = computed((): ModelInput | null => {
    const layout = this.current();
    const chart = layout?.chart ?? null;
    if (chart === null) {
      return null;
    }
    const { width, height } = this.size();
    const tokens = this.tokens();
    const small = `${tokens.fontSizeSmall} ${tokens.fontFamily}`;
    return {
      chart,
      width,
      height,
      colors: this.colors(),
      muted: tokens.muted,
      measure: (text) => this.measure(text, small),
      frame: this.source.frame(),
      categories: this.source.categories(),
      compact: this.compact(),
      selected: this.selected()
    };
  });
  /** The draw model with no slice moved out, which finds the slice under the pointer. */
  private readonly restingModel = computed((): ChartModel | null => {
    const input = this.modelInput();
    return input === null ? null : chartModel(input);
  });
  /** A pie's group under the pointer, whose slice moves out and whose value a donut's hole shows; null otherwise. */
  private readonly hoveredSlice = computed(() => {
    const [model, hover] = [this.restingModel(), this.hover()];
    return model === null || hover === null || !model.marks.some((m) => m.kind === "slice") ? null : categoryAt(model, hover.x, hover.y);
  });
  /** The draw model: the resting one, or for a pie, the one with the slice under the pointer moved out. */
  protected readonly model = computed((): ChartModel | null => {
    const [input, hovered] = [this.modelInput(), this.hoveredSlice()];
    return input === null || hovered === null ? this.restingModel() : chartModel({ ...input, hovered });
  });

  /** A compact chart has no room for a legend; its tooltip names what is under the pointer. */
  protected readonly legend = computed(() => (this.compact() ? [] : (this.model()?.legend ?? [])));

  /** Whether the pointer is over a bar or slice that clicking selects. */
  protected readonly pickable = computed(() => {
    const [model, hover] = [this.model(), this.hover()];
    return model !== null && hover !== null && model.x === null && categoryAt(model, hover.x, hover.y) !== null;
  });

  protected readonly problem = computed(() => {
    const checked = this.checked();
    if (!checked.ok) {
      return `Invalid layout: ${checked.error}`;
    }
    if (checked.layout.chart === null) {
      return "The layout has no chart section.";
    }
    return this.source.error();
  });

  protected readonly description = computed(() => {
    const layout = this.current();
    return layout === null ? "Chart" : describeChart(layout);
  });

  /** What the chart draws, and whether it is zoomed. */
  protected readonly summary = computed(() => {
    const drawn = this.drawn();
    if (drawn === "loading…") {
      return drawn;
    }
    const zoomed = (this.current()?.chart?.range ?? null) === null ? "" : ", zoomed in";
    // Drawings whose anchors this axis cannot place, as after the x column changed, are said, not silently dropped.
    const unplaced = this.drawable() ? this.editor.shown().length - this.editor.shapes().length : 0;
    const note = unplaced === 0 ? "" : `, ${String(unplaced)} ${unplaced === 1 ? "drawing" : "drawings"} not placed`;
    // More events than are marked: say how many there are.
    const frame = this.source.frame();
    const events = frame === null || frame.eventsTotal <= frame.events.length ? "" : `, ${COUNT.format(frame.events.length)} of ${COUNT.format(frame.eventsTotal)} events marked`;
    return `${drawn}${zoomed}${note}${events}`;
  });

  private readonly drawn = computed(() => {
    const frame = this.source.frame();
    const categories = this.source.categories();
    const kind = this.current()?.chart?.kind;
    if (categories !== null && (kind === "bar" || kind === "heatmap" || kind === "pie")) {
      return `${COUNT.format(categories.categories.length)} groups`;
    }
    if (frame === null) {
      return "loading…";
    }
    const content = frame.content;
    const count = COUNT;
    switch (content.kind) {
      case "series":
        return `${count.format(content.series.reduce((n, s) => n + s.x.length, 0))} points drawn`;
      case "histogram":
        return `${count.format(content.series[0]?.counts.length ?? 0)} bins`;
      case "density":
        return `${count.format(content.counts.reduce((n, c) => n + c, 0))} points`;
      case "candles":
        return `${count.format(content.candles.from.length)} ${content.candles.interval} candles`;
    }
  });

  private readonly syncing = inject(ChartSync);

  /** Charts the engine reduces along an x axis take drawings. */
  protected readonly drawable = computed(() => {
    const kind = this.current()?.chart?.kind;
    return kind !== undefined && DRAWABLE_KINDS.includes(kind);
  });

  /** Makes and edits drawings, which it saves in the layout. */
  protected readonly editor = new DrawingEditor({
    model: computed(() => this.model()),
    frame: this.source.frame,
    drawings: computed(() => this.current()?.chart?.drawings ?? []),
    save: (drawings) => {
      const layout = this.current();
      const chart = layout?.chart;
      if (layout !== null && chart !== undefined && chart !== null) {
        this.layout.set({ ...layout, chart: { ...chart, drawings: [...drawings] } });
      }
    },
    measure: (text) => this.measure(text, this.tokens().font),
    hidden: computed(() => this.current()?.chart?.hidden ?? []),
    measureChart: (from, to, series) => this.source.measure(from, to, series)
  });

  /** The measurement shown, where its ends are on the chart now; none once the data has been loaded again. */
  protected readonly measured = computed(() => {
    const [m, model, frame] = [this.editor.measuring(), this.model(), this.source.frame()];
    return m === null || model === null || frame?.loadVersion !== m.load ? null : measureView(m, model);
  });

  protected removeDrawing(): void {
    this.editor.remove();
    this.plot().nativeElement.focus();
  }

  protected noteDone(text: string | null): void {
    this.editor.noteDone(text);
    this.plot().nativeElement.focus();
  }
  /** The pointer over the plot, in pixels. */
  private readonly hover = signal<{ readonly x: number; readonly y: number } | null>(null);
  protected readonly panning = signal(false);
  private drag: { readonly start: number; readonly brush: boolean; readonly range: Range; readonly perPixel: number } | null = null;
  /** The brushed x range in axis positions, while dragging and after. */
  private readonly brush = signal<Range | null>(null);
  /** A zoom or pan waiting for the next animation frame, so that a drag or a burst of wheel events moves the chart once a frame. */
  private pending: { readonly range: Range | null } | null = null;
  private frameRequest: number | null = null;

  /** The group whose crosshairs move with this one's, or null. */
  private readonly group = computed((): string | null => {
    const sync = this.sync();
    if (sync !== undefined) {
      return sync;
    }
    const layout = this.current();
    const chart = layout?.chart;
    if (layout === null || chart === undefined || chart === null || chart.x === "" || !DRAWABLE_KINDS.includes(chart.kind)) {
      return null;
    }
    return JSON.stringify([layout.dataset, chart.x, chart.axis]);
  });

  /** The x in axis positions the pointer over this chart is at, or another chart of its group points at. */
  private pointedX(model: ChartModel): number | null {
    if (model.x === null) {
      return null;
    }
    const hover = this.hover();
    if (hover !== null) {
      return model.x.invert(hover.x);
    }
    // A chart in no group never reads the shared pointer, so other charts' pointers never recompute it.
    const group = this.group();
    if (group === null) {
      return null;
    }
    const pointer = this.syncing.pointer();
    return pointer === null || pointer.source === this || pointer.group !== group ? null : pointer.x;
  }

  /** What the pointer over this chart reads, or another chart of its group points at. */
  private readingNow(model: ChartModel): Reading | null {
    const x = this.pointedX(model);
    if (x === null) {
      const hover = this.hover();
      return hover === null ? null : markAt(model, hover.x, hover.y);
    }
    const frame = this.source.frame();
    const hidden = this.current()?.chart?.hidden ?? [];
    const reading = frame?.content.kind === "series" ? readSeries(frame, model, hidden, x) : this.markReading(model, x);
    // Indicators read at the crosshair too, under the price's rows.
    return reading === null || frame === null ? reading : { ...reading, rows: [...reading.rows, ...indicatorRows(frame, model, hidden, x), ...eventRows(frame, model, x)] };
  }

  /** The candle or other mark at axis position `x`, at the pointer's height or the plot's middle. */
  private markReading(model: ChartModel, x: number): Reading | null {
    return model.x === null ? null : markAt(model, model.x.map(x), this.hover()?.y ?? model.plot.y + model.plot.h / 2);
  }

  /** What the crosshair or the pointer reads, and where its tooltip goes. */
  protected readonly reading = computed((): PlacedReading | null => {
    const model = this.model();
    if (model === null || this.panning()) {
      return null;
    }
    const reading = this.readingNow(model);
    if (reading === null) {
      return null;
    }
    // Beside the crosshair or pointer, flipped near the right edge.
    const anchor = reading.crosshair ?? this.hover()?.x ?? 0;
    const left = anchor + 12 + TIP_WIDTH > model.width ? Math.max(0, anchor - 12 - TIP_WIDTH) : anchor + 12;
    return { ...reading, top: model.plot.y, height: plotBottom(model) - model.plot.y, left, tipTop: model.plot.y + 4 };
  });

  /** The brushed range on screen. */
  protected readonly band = computed(() => {
    const brush = this.brush();
    const model = this.model();
    const x = model?.x ?? null;
    if (brush === null || model === null || x === null) {
      return null;
    }
    const [a, b] = [x.map(brush[0]), x.map(brush[1])];
    const left = Math.max(model.plot.x, Math.min(a, b));
    const right = Math.min(model.plot.x + model.plot.w, Math.max(a, b));
    return { left, width: Math.max(0, right - left), top: model.plot.y, height: plotBottom(model) - model.plot.y };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.plot().nativeElement;
      const observer = new ResizeObserver(() => {
        this.size.set({ width: element.clientWidth, height: element.clientHeight });
        this.outer.set({ width: this.host.clientWidth, height: this.host.clientHeight });
      });
      observer.observe(element);
      observer.observe(this.host);
      this.outer.set({ width: this.host.clientWidth, height: this.host.clientHeight });
      destroyRef.onDestroy(() => {
        observer.disconnect();
      });
      this.size.set({ width: element.clientWidth, height: element.clientHeight });
    });
    destroyRef.onDestroy(() => {
      if (this.frameRequest !== null) {
        cancelAnimationFrame(this.frameRequest);
      }
      // Other charts of the group must not keep following a pointer over a chart that is gone.
      if (this.syncing.pointer()?.source === this) {
        this.syncing.pointer.set(null);
      }
    });
    // The theme's tokens come from the page's styles, so they are read once rendered.
    afterRenderEffect(() => {
      this.theming.theme();
      this.theming.resolved();
      this.theming.changes();
      const element = this.canvas().nativeElement;
      this.colors.set(readChartColors(element));
      this.tokens.set(readTheme(element));
    });
    // A brush selects rows: once the chart draws other rows, it selects nothing shown, and is cleared.
    let rows: string | null = null;
    effect(() => {
      const layout = this.current();
      const next = layout === null ? null : rowsPart(layout);
      untracked(() => {
        if (rows !== null && next !== rows && this.brush() !== null) {
          this.clearBrush();
        }
        rows = next;
      });
    });
    // Ask for the chart at the plot's size, over the zoomed range if any.
    effect(() => {
      const size = this.size();
      const range = this.current()?.chart?.range ?? null;
      if (size.width > 0 && size.height > 0) {
        this.source.show(size, range === null ? null : [range.from, range.to]);
      }
    });
    afterRenderEffect(() => {
      const model = this.model();
      if (model !== null) {
        this.draw(model);
      }
    });
  }

  /**
   * Reads the theme's tokens again and redraws if they changed. The chart notices its inputs, the system's colour
   * scheme, fonts loading and changes to the attributes of `<html>` and `<body>` by itself; call this after changing
   * a token any other way, such as a class on a wrapper.
   */
  public refreshTheme(): void {
    this.theming.refresh();
  }

  /** The data's whole x range, which the engine sends with each frame, and zooming and panning stay within. */
  private extent(): Range | null {
    const frame = this.source.frame();
    return frame === null ? null : [frame.extentFrom, frame.extentTo];
  }

  /** The x range shown, or about to be: a pending zoom or pan, the zoom in the layout, or everything. */
  private shownRange(): Range | null {
    if (this.pending !== null) {
      return this.pending.range ?? this.extent();
    }
    const range = this.current()?.chart?.range;
    return range === null || range === undefined ? this.extent() : [range.from, range.to];
  }

  /** Zooms or pans to `range`, or shows everything for null, at the next animation frame. */
  private schedule(range: Range | null): void {
    this.pending = { range };
    this.frameRequest ??= requestAnimationFrame(() => {
      this.frameRequest = null;
      this.flush();
    });
  }

  private flush(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending !== null) {
      this.setRange(pending.range);
    }
  }

  /** Records a zoomed range in the layout, or none for everything. */
  private setRange(range: Range | null): void {
    const layout = this.current();
    const chart = layout?.chart;
    if (layout === null || chart === undefined || chart === null) {
      return;
    }
    const next = range === null ? null : { from: range[0], to: range[1] };
    if (next?.from !== chart.range?.from || next?.to !== chart.range?.to) {
      this.layout.set({ ...layout, chart: { ...chart, range: next } });
    }
  }

  private local(event: PointerEvent | WheelEvent): { readonly x: number; readonly y: number } {
    const rect = this.plot().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Starts panning, or with Shift a brush. */
  protected onPointerDown(event: PointerEvent): void {
    const model = this.model();
    const range = this.shownRange();
    if (event.button !== 0 || model?.x === null || model === null || range === null) {
      return;
    }
    this.plot().nativeElement.setPointerCapture(event.pointerId);
    const at = this.local(event);
    // A press that makes, picks or grabs a drawing is neither a pan nor a brush.
    if (!event.shiftKey && this.editor.down(at)) {
      return;
    }
    this.drag = { start: at.x, brush: event.shiftKey, range, perPixel: (range[1] - range[0]) / model.plot.w };
    if (event.shiftKey) {
      this.brush.set(null);
    } else {
      this.panning.set(true);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const at = this.local(event);
    this.hover.set(at);
    const x = this.model()?.x ?? null;
    const group = this.group();
    if (x !== null && group !== null) {
      this.syncing.pointer.set({ group, x: x.invert(at.x), source: this });
    }
    const drag = this.drag;
    if (this.editor.move(at) || drag === null || x === null) {
      return;
    }
    if (drag.brush) {
      this.brush.set([x.invert(drag.start), x.invert(at.x)]);
      return;
    }
    this.schedule(panRange(drag.range, (drag.start - at.x) * drag.perPixel, this.extent()));
  }

  /** Ends a drag, returning it. */
  private endDrag(event: PointerEvent): { readonly brush: boolean } | null {
    const drag = this.drag;
    this.drag = null;
    this.panning.set(false);
    this.flush();
    if (this.plot().nativeElement.hasPointerCapture(event.pointerId)) {
      this.plot().nativeElement.releasePointerCapture(event.pointerId);
    }
    return drag;
  }

  /** Ends a pan, or a brush, which then snaps to what it selects and names the filters selecting it. */
  protected onPointerUp(event: PointerEvent): void {
    const drag = this.endDrag(event);
    if (this.editor.up() || drag?.brush !== true) {
      return;
    }
    const brush = this.brush();
    const frame = this.source.frame();
    const chart = this.current()?.chart;
    const brushed = brush === null || frame === null || chart === undefined || chart === null ? null : brushFilters(frame, chart.x, chart.hidden, brush);
    this.brush.set(brushed?.range ?? null);
    this.brushed.emit(brushed?.filters ?? null);
  }

  /**
   * Selects the group of the bar or slice clicked, or clears the selection on a second click or a click elsewhere. Only
   * charts of the grouped view select: the others pan and brush.
   */
  protected onClick(event: MouseEvent): void {
    const model = this.model();
    const layout = this.current();
    const categories = this.source.categories();
    if (model === null || layout === null || categories === null || model.x !== null) {
      return;
    }
    const rect = this.plot().nativeElement.getBoundingClientRect();
    const index = categoryAt(model, event.clientX - rect.left, event.clientY - rect.top);
    const label = index === null ? null : (categories.categories[index] ?? null);
    const column = layout.group_by[0];
    if (index === null || label === null || column === undefined || label === this.selected()) {
      if (this.selected() !== null) {
        this.selected.set(null);
        this.selectionChange.emit(null);
      }
      return;
    }
    this.selected.set(label);
    this.selectionChange.emit({ column, value: categories.keys[index] ?? null, label });
  }

  /** A drag the browser took over or the system interrupted ends without a pointerup; a brush it was making is dropped. */
  protected onPointerCancel(event: PointerEvent): void {
    this.editor.abandon();
    if (this.endDrag(event)?.brush === true) {
      this.clearBrush();
    }
  }

  private clearBrush(): void {
    this.brush.set(null);
    this.brushed.emit(null);
  }

  protected onPointerLeave(): void {
    this.hover.set(null);
    if (this.syncing.pointer()?.source === this) {
      this.syncing.pointer.set(null);
    }
  }

  /** Zooms around the pointer: up to zoom in, down to zoom out. */
  protected onWheel(event: WheelEvent): void {
    const x = this.model()?.x ?? null;
    const range = this.shownRange();
    if (x === null || range === null || event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    this.schedule(zoomRange(range, x.invert(this.local(event).x), event.deltaY < 0 ? ZOOM_IN : ZOOM_OUT, this.extent()));
  }

  /** Shows everything again. */
  protected reset(): void {
    this.pending = { range: null };
    this.flush();
  }

  /** Plus and minus zoom, the arrows pan, 0 shows everything and Escape clears the brush. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = KEYS[event.key];
    const range = this.shownRange();
    if (key === undefined || range === null) {
      return;
    }
    event.preventDefault();
    const [middle, step, extent] = [(range[0] + range[1]) / 2, (range[1] - range[0]) / 10, this.extent()];
    switch (key) {
      case "in":
      case "out":
        this.schedule(zoomRange(range, middle, key === "in" ? ZOOM_IN : ZOOM_OUT, extent));
        return;
      case "left":
      case "right":
        this.schedule(panRange(range, key === "left" ? -step : step, extent));
        return;
      case "all":
        this.reset();
        return;
      case "clear":
        // Escape first drops a drawing in progress or the selection, then the brush.
        if (!this.editor.cancel()) {
          this.clearBrush();
        }
        return;
      case "remove":
        this.editor.remove();
        return;
    }
  }

  /** Hides a series, or shows it again. */
  protected toggle(label: string): void {
    const layout = this.current();
    const chart = layout?.chart;
    if (layout === null || chart === undefined || chart === null) {
      return;
    }
    const hidden = chart.hidden.includes(label) ? chart.hidden.filter((h) => h !== label) : [...chart.hidden, label];
    this.layout.set({ ...layout, chart: { ...chart, hidden } });
  }

  private measure(text: string, font: string): number {
    const key = `${font}\u0000${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      if (this.measurer === null) {
        return text.length * 7;
      }
      this.measurer.font = font;
      width = this.measurer.measureText(text).width;
      if (this.widths.size > 10_000) {
        this.widths.clear();
      }
      this.widths.set(key, width);
    }
    return width;
  }

  private draw(model: ChartModel): void {
    const element = this.canvas().nativeElement;
    const context = element.getContext("2d", { alpha: false });
    if (context === null) {
      return;
    }
    const ratio = window.devicePixelRatio;
    const [width, height] = [Math.max(1, Math.round(model.width * ratio)), Math.max(1, Math.round(model.height * ratio))];
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
      element.style.width = `${String(model.width)}px`;
      element.style.height = `${String(model.height)}px`;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintChart(context, model, this.tokens(), { shapes: this.editor.shapes(), selected: this.editor.selected() });
  }
}
