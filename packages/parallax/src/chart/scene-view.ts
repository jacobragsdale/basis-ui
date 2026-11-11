/* What a scene shows of its model, once an animation frame: the canvas when the model or the drawings changed, the
 * crosshair and tooltip where the pointer is or another chart of the group points, the brush, a measurement, the
 * plot's cursor, and the words of its status line and text alternative. */

import { DevicePixels } from "#canvas/device-pixels.ts";

import { categoryAt } from "./interaction.ts";
import type { DrawingEditor } from "./drawing-editor.ts";
import type { ChartModel, LegendEntry, Point } from "./model-types.ts";
import type { ChartOverlay } from "./overlay.ts";
import type { Range } from "./range.ts";
import { placeReading, readingOf } from "./reading.ts";
import { isDrawable } from "./scene-inputs.ts";
import type { SceneModel } from "./scene-model.ts";
import { bandOf, flag, measuredOf, paintCanvas, writeText } from "./scene-paint.ts";
import type { SceneElements } from "./scene.ts";
import { asOfLine, chartSummary, chartWords } from "./summary.ts";
import { chartSync } from "./sync.ts";
import type { ChartZoom } from "./zoom.ts";
import { ZoomPreview } from "./zoom-preview.ts";

/** What a render reads besides the model. */
interface RenderParts {
  readonly brush: Range | null;
  readonly editor: DrawingEditor;
  readonly zoom: ChartZoom;
  /** The chart whose scene this is, which the shared pointer names when it is over it. */
  readonly source: object;
}

/** A scene's view of its model on the page. */
class SceneView {
  /** The pointer over the plot, or null. */
  public hover: Point | null = null;
  /** Whether a drag is panning, which hides the tooltip. */
  public panning = false;
  readonly #model: SceneModel;
  #elements: SceneElements | null = null;
  #overlay: ChartOverlay | null = null;
  #device: DevicePixels | null = null;
  #painted: ChartModel | null = null;
  #dirty = true;
  #legendText = "[]";
  #legend: readonly LegendEntry[] | null = null;
  /** The model and zoom the words and legend were last written for. */
  #described: { readonly model: ChartModel; readonly zoomed: boolean } | null = null;
  /** The drawings changed since the words were written: how many cannot be placed may have. */
  #redescribe = true;
  readonly #preview = new ZoomPreview();

  public constructor(model: SceneModel) {
    this.#model = model;
  }

  /** Shows the model in `elements`, calling `redraw` when the canvas must be painted again on new device pixels: its
   * box in device pixels changed, or the ratio did. */
  public attach(elements: SceneElements, overlay: ChartOverlay, redraw: () => void): void {
    [this.#elements, this.#overlay, this.#dirty, this.#described] = [elements, overlay, true, null];
    this.#device = new DevicePixels(elements.canvas, () => {
      this.repaint();
      redraw();
    });
  }

  public detach(): void {
    this.#device?.dispose();
    [this.#elements, this.#overlay, this.#painted, this.#device] = [null, null, null, null];
  }

  /** The drawings changed: the canvas is painted again even if the model did not. */
  public repaint(): void {
    [this.#dirty, this.#redescribe] = [true, true];
  }

  /** Shows the chart as last painted moved to `range` at once, until the engine's answer paints it. */
  public preview(range: Range | null): void {
    const canvas = this.#elements?.canvas;
    if (canvas !== undefined) {
      this.#preview.show(canvas, range, this.#model.theme.background);
    }
  }

  /** The legend's entries if they changed since last taken, else null. */
  public takeLegend(): readonly LegendEntry[] | null {
    const legend = this.#legend;
    this.#legend = null;
    return legend;
  }

  /** Shows the model and everything over it. */
  public render(parts: RenderParts): void {
    const [elements, overlay] = [this.#elements, this.#overlay];
    if (elements === null || overlay === null) {
      return;
    }
    const model = this.#model.model(this.hover);
    this.#paint(elements.canvas, model, parts.editor);
    this.#over(model, parts);
    this.#cursor(elements.plot, model);
    if (model !== null && this.#undescribed(model, parts.zoom.zoomed())) {
      this.#words(parts);
      this.#noteLegend(model);
    }
  }

  /** Whether the words and the legend were written for another model or zoom than these, or the drawings changed
   * since: the pointer alone changes neither, so a hover writes nothing. */
  #undescribed(model: ChartModel, zoomed: boolean): boolean {
    const described = this.#described;
    if (described?.model === model && described.zoomed === zoomed && !this.#redescribe) {
      return false;
    }
    [this.#described, this.#redescribe] = [{ model, zoomed }, false];
    return true;
  }

  /** Paints the canvas, if the model or the drawings changed since it was last painted. */
  #paint(canvas: HTMLCanvasElement, model: ChartModel | null, editor: DrawingEditor): void {
    const device = this.#device;
    if (model !== null && device !== null && (model !== this.#painted || this.#dirty)) {
      paintCanvas(canvas, model, { device, editor, theme: this.#model.theme });
      [this.#painted, this.#dirty] = [model, false];
      this.#preview.painted(model);
    }
  }

  /** The crosshair and tooltip, the brush and the measurement. */
  #over(model: ChartModel | null, parts: RenderParts): void {
    const overlay = this.#overlay;
    const scene = this.#model;
    if (overlay === null) {
      return;
    }
    const reading =
      model === null || this.panning
        ? null
        : readingOf({
            frame: scene.frame,
            hidden: scene.chart?.hidden ?? [],
            hover: this.hover,
            model,
            synced: this.#synced(parts.source),
          });
    overlay.reading(
      reading === null || model === null ? null : placeReading(reading, model, this.hover),
    );
    overlay.band(bandOf(parts.brush, model));
    const card = this.#elements?.plot.querySelector<HTMLElement>("[data-slot=chart-measure]");
    overlay.measure(measuredOf(parts.editor, model, scene.frame), card ?? null);
  }

  /** The x another chart of this one's group points at, or null. */
  #synced(source: object): number | null {
    const { group } = this.#model;
    const { pointer } = chartSync;
    return group === null ||
      pointer === null ||
      pointer.source === source ||
      pointer.group !== group
      ? null
      : pointer.x;
  }

  #words(parts: RenderParts): void {
    const scene = this.#model;
    const { chart } = scene;
    if (chart === null) {
      return;
    }
    const { editor } = parts;
    const input = {
      categories: scene.categories,
      chart,
      frame: scene.frame,
      unplaced: isDrawable(chart) ? editor.shown().length - editor.shapes().length : 0,
      zoomed: parts.zoom.zoomed(),
    };
    writeText(this.#elements?.summary ?? null, chartSummary(input));
    writeText(this.#elements?.words ?? null, chartWords(input));
    writeText(this.#elements?.asOf ?? null, asOfLine(scene.asOfMicros));
  }

  /** The plot's cursor: grabbing while panning, a pointer over a bar or slice that a click selects. */
  #cursor(plot: HTMLElement, model: ChartModel | null): void {
    const { hover } = this;
    const pickable =
      model !== null &&
      hover !== null &&
      model.x === null &&
      categoryAt(model, hover.x, hover.y) !== null;
    flag(plot, "panning", this.panning);
    flag(plot, "pick", pickable);
  }

  /** Notes the legend's entries if they changed: a compact chart has no room for a legend. */
  #noteLegend(model: ChartModel): void {
    const legend = this.#model.compact ? [] : model.legend;
    const text = JSON.stringify(legend);
    if (text !== this.#legendText) {
      [this.#legendText, this.#legend] = [text, legend];
    }
  }
}

export { SceneView };
export type { RenderParts };
