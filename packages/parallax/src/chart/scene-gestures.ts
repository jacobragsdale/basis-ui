/* What a scene does with the pointer: the hover it reads and shares with its group, panning, the Shift-drag brush and
 * the filters it selects, and the bar or slice a click selects. It is the `PointerScene` the plot's listeners act on. */

import type { DrawingEditor } from "./drawing-editor.ts";
import type { ChartModel, Point } from "./model-types.ts";
import { brushFilters } from "./range.ts";
import type { Range } from "./range.ts";
import type { SceneModel } from "./scene-model.ts";
import { hiddenLabels } from "./series-keys.ts";
import type { PointerScene } from "./scene-pointer.ts";
import type { SceneView } from "./scene-view.ts";
import type { SceneHost } from "./scene.ts";
import { chartSync } from "./sync.ts";
import type { ChartZoom } from "./zoom.ts";

/** The scene's parts the gestures act on. */
interface GestureParts {
  readonly model: SceneModel;
  readonly view: SceneView;
  readonly zoom: ChartZoom;
  readonly editor: DrawingEditor;
  /** The scene, which the shared pointer names while it is over this chart. */
  readonly source: object;
  readonly schedule: () => void;
  readonly host: () => SceneHost | null;
}

/** A scene's gestures, and the brush they make. */
class SceneGestures implements PointerScene {
  public readonly zoom: ChartZoom;
  public readonly editor: DrawingEditor;
  /** The brushed x range in axis positions, while dragging and after. */
  public brushed: Range | null = null;
  readonly #parts: GestureParts;

  public constructor(parts: GestureParts) {
    this.#parts = parts;
    this.zoom = parts.zoom;
    this.editor = parts.editor;
  }

  /** The model as drawn now. */
  public model(): ChartModel | null {
    return this.#parts.model.model(this.#parts.view.hover);
  }

  /** The data's whole x range, which zooming and panning stay within. */
  public extent(): Range | null {
    const { frame } = this.#parts.model;
    return frame === null ? null : [frame.extentFrom, frame.extentTo];
  }

  /** The pointer over the plot, shared with the charts of the group, or null once it leaves. */
  public hoverAt(at: Point | null): void {
    const { view, model, source } = this.#parts;
    view.hover = at;
    const x = this.model()?.x ?? null;
    if (at === null) {
      chartSync.release(source);
    } else if (x !== null && model.group !== null) {
      chartSync.set({ group: model.group, source, x: x.invert(at.x) });
    }
    this.#parts.schedule();
  }

  public setPanning(panning: boolean): void {
    this.#parts.view.panning = panning;
    this.#parts.schedule();
  }

  public brush(range: Range | null): void {
    this.brushed = range;
    this.#parts.schedule();
  }

  /** The brush let go: it snaps to what it selects, and names the filters selecting it. */
  public brushDone(): void {
    const { frame, chart } = this.#parts.model;
    const brush = this.brushed;
    const result =
      brush === null || frame === null || chart === null
        ? null
        : brushFilters(frame, {
            column: chart.x,
            hidden: hiddenLabels(chart, frame),
            range: brush,
          });
    this.brushed = result?.range ?? null;
    this.#parts.schedule();
    this.#parts.host()?.brushed(result?.filters ?? null);
  }

  /** Drops the brush, and says so. Returns whether there was one. */
  public clearBrush(): boolean {
    const had = this.brushed !== null;
    this.brushed = null;
    this.#parts.schedule();
    this.#parts.host()?.brushed(null);
    return had;
  }

  /** Selects the group of the bar or slice clicked, or clears the selection on a second click or a click elsewhere. */
  public pick(at: Point): void {
    const selection = this.#parts.model.pick(this.model(), at);
    if (selection !== undefined) {
      this.#parts.host()?.selected(selection);
    }
  }
}

export { SceneGestures };
