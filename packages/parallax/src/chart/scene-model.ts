/* What a scene's draw model is built from, and the model itself, built again only when one of its inputs changes, and
 * the layout changes the scene makes: a series hidden, a zoom recorded, a drawing saved. */

import type { ViewHandle } from "#engine/view.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import type { LayoutChart, LayoutDrawing } from "#layout/chart.ts";
import type { Layout, LayoutFormat } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";
import type { ChartColors } from "#theme/charts.ts";
import { defaultTheme, sameChartColors, sameTheme } from "#theme/read.ts";
import type { Theme } from "#theme/read.ts";

import { axisFormats } from "./axis-styles.ts";
import { categoryAt } from "./interaction.ts";
import { dotPicked } from "./marks-at.ts";
import { chartModel } from "./model.ts";
import type { CategoryData, ChartModel, LegendEntry, ModelInput, Point } from "./model-types.ts";
import type { Range } from "./range.ts";
import { FrameShapes, fitsShape, groupOf } from "./scene-inputs.ts";
import type { PlotSize } from "./scene-inputs.ts";
import type { ChartSelection } from "./scene.ts";
import { toggledHidden } from "./series-keys.ts";
import { categoriesOf, rowsPart, shapeOf } from "./source.ts";

/** How a scene's model tells it to draw again, and measures labels: null until it can. */
interface ModelHost {
  readonly changed: () => void;
  readonly measure: (text: string, font: string) => number | null;
}

/** A model built from the inputs of one version, and the slice under the pointer it was built with. */
interface Built {
  readonly version: number;
  readonly hovered: number | null;
  readonly model: ChartModel;
}

/** The scene's inputs and its model. */
class SceneModel {
  public frame: ChartFrameData | null = null;
  public categories: CategoryData | null = null;
  /** When the data's source was read, in microseconds since the epoch, as the latest frame says. */
  public asOfMicros: bigint | null = null;
  public size: PlotSize = { height: 0, width: 0 };
  public theme: Theme = defaultTheme("light");
  public group: string | null = null;
  public sync: string | null | undefined = undefined;
  /** The display formats the view's API declares, by column, which the layout's own override. */
  public declared: Readonly<Record<string, LayoutFormat>> = {};
  #layout: Layout | null = null;
  #layoutJson = "";
  #shape: string | null = null;
  #rows: string | null = null;
  #compact = false;
  #colors: ChartColors = chartColors.light;
  /** The selected group, by its label. */
  #selected: string | null = null;
  #version = 0;
  #resting: Built | null = null;
  #hovered: Built | null = null;
  readonly #shapes = new FrameShapes();
  readonly #host: ModelHost;

  public constructor(host: ModelHost) {
    this.#host = host;
  }

  /** Whether the chart is compact: a small tile's, with less padding and no legend. */
  public get compact(): boolean {
    return this.#compact;
  }

  /** The layout's chart section, or null. */
  public get chart(): LayoutChart | null {
    return this.#layout?.chart ?? null;
  }

  /** The inputs changed: the model is built again, and drawn. */
  public changed(): void {
    this.#version += 1;
    this.#host.changed();
  }

  /** Takes a new layout, returning whether it draws other rows than the one before, which a brush cannot outlive. */
  public setLayout(layout: Layout | null, sync: string | null | undefined): boolean {
    [this.sync, this.group] = [sync, groupOf(layout, sync)];
    const json = JSON.stringify(layout);
    if (json === this.#layoutJson) {
      return false;
    }
    const shape = layout?.chart === null || layout === null ? null : shapeOf(layout);
    this.#dropUnfit(shape, layout);
    const rows = layout === null ? null : rowsPart(layout);
    const rowsChanged = this.#rows !== null && rows !== this.#rows;
    [this.#layout, this.#layoutJson, this.#shape, this.#rows] = [layout, json, shape, rows];
    return this.#changedRows(rowsChanged);
  }

  /** The inputs changed; returns whether the rows drawn did. */
  #changedRows(rowsChanged: boolean): boolean {
    this.changed();
    return rowsChanged;
  }

  /** Data of another shape, or of another dataset, must not be drawn as the new chart while its answer is on the way. */
  #dropUnfit(shape: string | null, layout: Layout | null): void {
    if (shape !== this.#shape || layout?.dataset !== this.#layout?.dataset) {
      this.frame = null;
      this.categories = null;
    }
  }

  /** Whether a frame was built for a layout of the chart's shape now. */
  public fits(frame: { readonly configVersion: bigint }, handle: ViewHandle | null): boolean {
    return fitsShape(this.#shapes, { configVersion: frame.configVersion, handle }, this.#shape);
  }

  /** A reduction from the engine, kept if it fits the chart's shape. */
  public setFrame(frame: ChartFrameData, handle: ViewHandle | null): void {
    if (this.fits(frame, handle)) {
      this.frame = frame;
      this.asOfMicros = frame.sourceAsOfMicros;
      this.changed();
    }
  }

  /** A grouped view's frame, kept if it fits the chart's shape; `order` may put its groups in another order. */
  public setGroups(
    frame: FrameData,
    {
      handle,
      order,
    }: {
      readonly handle: ViewHandle | null;
      readonly order: ((data: CategoryData) => CategoryData) | null;
    },
  ): void {
    if (this.fits(frame, handle)) {
      this.asOfMicros = frame.sourceAsOfMicros;
      const data = categoriesOf(frame);
      this.setCategories(order === null ? data : order(data));
    }
  }

  public setCategories(data: CategoryData): void {
    this.categories = data;
    this.changed();
  }

  public setSize(size: PlotSize, compact: boolean): void {
    if (
      size.width !== this.size.width ||
      size.height !== this.size.height ||
      compact !== this.#compact
    ) {
      [this.size, this.#compact] = [size, compact];
      this.changed();
    }
  }

  public setTheme(theme: Theme, colors: ChartColors): void {
    if (!sameTheme(theme, this.theme) || !sameChartColors(colors, this.#colors)) {
      [this.theme, this.#colors] = [theme, colors];
      this.changed();
    }
  }

  /** The range the layout records, or null for everything. */
  public recordedRange(): Range | null {
    const range = this.chart?.range ?? null;
    return range === null ? null : [range.from, range.to];
  }

  /** The layout with `range` recorded, or everything for null, handed to `apply` if it changed. */
  public record(range: Range | null, apply: (next: Layout) => void): void {
    this.#withChart(apply, (chart) => ({
      ...chart,
      range: range === null ? null : { from: range[0], to: range[1] },
    }));
  }

  /** The layout with a legend entry's series hidden, or shown again. */
  public toggled(entry: LegendEntry, apply: (next: Layout) => void): void {
    this.#withChart(apply, (chart) => ({ ...chart, hidden: toggledHidden(chart.hidden, entry) }));
  }

  /** The layout with the drawings `drawings`. */
  public drawn(drawings: readonly LayoutDrawing[], apply: (next: Layout) => void): void {
    this.#withChart(apply, (chart) => ({ ...chart, drawings: [...drawings] }));
  }

  /** Selects the group of the bar or slice at `at`, or a scatter's dot by its id, returning the selection, null when a
   * click cleared it, or undefined when nothing changed. Other charts along an x axis pan and brush instead. */
  public pick(model: ChartModel | null, at: Point): ChartSelection | null | undefined {
    const id = this.#layout?.chart?.id;
    if (model === null || id === undefined || !model.marks.some((mark) => mark.kind === "dots")) {
      return this.#pickGroup(model, at);
    }
    const dot = dotPicked(model, at.x, at.y);
    const picked = dot?.label === this.#selected ? null : dot;
    const changed = this.#select(picked?.label ?? null);
    return picked === null ? changed : { column: id, ...picked };
  }

  #pickGroup(model: ChartModel | null, at: Point): ChartSelection | null | undefined {
    const [layout, data] = [this.#layout, this.categories];
    if (model === null || layout === null || data === null || model.x !== null) {
      return undefined;
    }
    const index = categoryAt(model, at.x, at.y);
    const label = index === null ? null : (data.categories[index] ?? null);
    const [column] = layout.group_by;
    if (index === null || label === null || column === undefined || label === this.#selected) {
      return this.#select(null);
    }
    this.#select(label);
    return { column, label, value: data.keys[index] ?? null };
  }

  /** The model as drawn with the pointer at `hover`: a pie's slice under it moves out. */
  public model(hover: Point | null): ChartModel | null {
    const resting = this.#restingModel();
    const hovered =
      resting === null || hover === null || !resting.marks.some((mark) => mark.kind === "slice")
        ? null
        : categoryAt(resting, hover.x, hover.y);
    return hovered === null ? resting : (this.#hoveredModel(hovered) ?? resting);
  }

  /** The model with the slice of group `hovered` moved out. */
  #hoveredModel(hovered: number): ChartModel | null {
    const input = this.#input();
    const built = this.#hovered;
    if (input === null) {
      return null;
    }
    if (built?.version !== this.#version || built.hovered !== hovered) {
      this.#hovered = { hovered, model: chartModel({ ...input, hovered }), version: this.#version };
    }
    return this.#hovered?.model ?? null;
  }

  #select(label: string | null): ChartSelection | null | undefined {
    if (label === this.#selected) {
      return undefined;
    }
    this.#selected = label;
    this.changed();
    return null;
  }

  #withChart(apply: (next: Layout) => void, change: (chart: LayoutChart) => LayoutChart): void {
    const layout = this.#layout;
    const chart = layout?.chart ?? null;
    if (layout !== null && chart !== null) {
      const next = { ...layout, chart: change(chart) };
      if (JSON.stringify(next) !== this.#layoutJson) {
        apply(next);
      }
    }
  }

  #restingModel(): ChartModel | null {
    if (this.#resting?.version !== this.#version) {
      const input = this.#input();
      this.#resting =
        input === null ? null : { hovered: null, model: chartModel(input), version: this.#version };
    }
    return this.#resting?.model ?? null;
  }

  /** What the model is made from: the latest data at the plot's size, measured in the axes' font. */
  #input(): ModelInput | null {
    const { chart } = this;
    const small = `${this.theme.fontSizeSmall} ${this.theme.fontFamily}`;
    if (chart === null || this.#host.measure("", small) === null) {
      return null;
    }
    return {
      categories: this.categories,
      chart,
      colors: this.#colors,
      compact: this.#compact,
      frame: this.frame,
      height: this.size.height,
      measure: (text) => this.#host.measure(text, small) ?? 0,
      muted: this.theme.muted,
      selected: this.#selected,
      width: this.size.width,
      ...axisFormats(this.#layout, this.declared),
    };
  }
}

export { SceneModel };
