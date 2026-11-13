/* The pointer, wheel and keys on a chart's plot: hovering reads, dragging pans, Shift and drag brushes, the wheel and
 * the keys zoom, a click selects a bar, a slice or a dot, and a press with a drawing tool draws. The listeners are the
 * DOM's own, not React's: the wheel must be able to stop the page scrolling, and nothing here renders. Presses and keys
 * in a note's text box are the box's, not the plot's. */

import type { DrawingEditor } from "./drawing-editor.ts";
import type { ChartModel, Point, Scale } from "./model-types.ts";
import { browsers, keyed, keys, wheelZoom } from "./pointer-keys.ts";
import type { KeyAction } from "./pointer-keys.ts";
import { panRange } from "./range.ts";
import type { Range } from "./range.ts";
import type { ChartZoom } from "./zoom.ts";

/** How far, in pixels, a press may move and still end in a click that selects. */
const clickSlack = 3;

/** The events the plot listens to. */
const listened = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "lostpointercapture",
  "pointerleave",
  "wheel",
  "click",
  "dblclick",
  "keydown",
] as const;

/** What the pointer acts on: the chart's scene. */
interface PointerScene {
  readonly zoom: ChartZoom;
  readonly editor: DrawingEditor;
  readonly model: () => ChartModel | null;
  readonly extent: () => Range | null;
  /** The pointer over the plot, or null once it leaves. */
  readonly hoverAt: (at: Point | null) => void;
  readonly setPanning: (panning: boolean) => void;
  /** Shows a brush being dragged, in axis positions, or none. */
  readonly brush: (range: Range | null) => void;
  /** The brush is let go: it snaps to what it selects, and says so. */
  readonly brushDone: () => void;
  /** Drops the brush; returns whether there was one. */
  readonly clearBrush: () => boolean;
  /** A click at a point, which selects a bar's or a slice's group. */
  readonly pick: (at: Point) => void;
}

/** A drag under way: where it started, whether it brushes, the range it started on, and axis units per pixel. */
interface Drag {
  readonly start: number;
  readonly brush: boolean;
  readonly range: Range;
  readonly perPixel: number;
}

/** The plot's listeners, and the drag they track. */
class ChartPointer implements EventListenerObject {
  readonly #scene: PointerScene;
  readonly #plot: HTMLElement;
  #drag: Drag | null = null;
  /** Whether the last press moved far enough to pan or brush, so that the click it ends in selects nothing. */
  #dragged = false;
  /** What each pointer event does. */
  readonly #pointerHandlers: Readonly<Partial<Record<string, (event: PointerEvent) => void>>> = {
    // Capture lost mid-drag, as to a remote desktop's change of focus, ends the drag as a cancel does.
    lostpointercapture: (event) => {
      if (this.#drag !== null) {
        this.#cancel(event);
      }
    },
    pointercancel: (event) => {
      this.#cancel(event);
    },
    pointerdown: (event) => {
      this.#down(event);
    },
    pointerleave: () => {
      this.#scene.hoverAt(null);
    },
    pointermove: (event) => {
      this.#move(event);
    },
    pointerup: (event) => {
      this.#up(event);
    },
  };

  public constructor(scene: PointerScene, plot: HTMLElement) {
    this.#scene = scene;
    this.#plot = plot;
  }

  /** Listens to the plot, until the returned function is called. */
  public attach(): () => void {
    const controller = new AbortController();
    for (const type of listened) {
      this.#plot.addEventListener(type, this, { passive: false, signal: controller.signal });
    }
    return (): void => {
      controller.abort();
    };
  }

  /** Hands each event the plot listens to to its handler. */
  public handleEvent(event: Event): void {
    if (event instanceof PointerEvent) {
      this.#pointer(event);
    } else if (event instanceof WheelEvent) {
      this.#wheel(event);
    } else if (event instanceof KeyboardEvent) {
      this.#key(event);
    } else if (event instanceof MouseEvent) {
      this.#mouse(event);
    }
  }

  #pointer(event: PointerEvent): void {
    const handle = this.#pointerHandlers[event.type];
    if (handle === undefined) {
      // A click is a pointer event in Chrome.
      this.#mouse(event);
    } else {
      handle(event);
    }
  }

  /** A click selects a bar's or slice's group; a double-click shows everything again. */
  #mouse(event: MouseEvent): void {
    if (!this.#onPlot(event)) {
      return;
    }
    if (event.type === "dblclick") {
      this.#scene.zoom.reset();
    } else if (event.type === "click" && !this.#dragged) {
      this.#scene.pick(this.#local(event));
    }
  }

  /** Whether an event happened on the plot itself, or its canvas, rather than in a note's box over it. */
  #onPlot(event: Event): boolean {
    return event.target === this.#plot || event.target instanceof HTMLCanvasElement;
  }

  #local(event: MouseEvent): Point {
    const rect = this.#plot.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** The model and range a press on the plot drags over, or null where it cannot drag. */
  #draggable(event: PointerEvent): { readonly model: ChartModel; readonly range: Range } | null {
    const model = this.#scene.model();
    const range = this.#scene.zoom.shown();
    return !this.#onPlot(event) ||
      event.button !== 0 ||
      model?.x === null ||
      model === null ||
      range === null
      ? null
      : { model, range };
  }

  /** Starts panning, or with Shift a brush; a press that makes, picks or grabs a drawing is neither. */
  #down(event: PointerEvent): void {
    this.#dragged = false;
    const target = this.#draggable(event);
    if (target === null) {
      return;
    }
    this.#plot.setPointerCapture(event.pointerId);
    const at = this.#local(event);
    if (!event.shiftKey && this.#scene.editor.down(at)) {
      this.#tookPress(event);
      return;
    }
    this.#began(target, { brush: event.shiftKey, start: at.x });
  }

  /** A press the drawing editor took: the plot takes the keyboard, so Delete and Escape reach the drawing, and the
   * press's own default, which would focus the plot after a note's box has taken the focus, is stopped. */
  #tookPress(event: PointerEvent): void {
    event.preventDefault();
    this.#plot.focus();
  }

  /** A pan or a brush begins at `start`, over the range shown. */
  #began(
    { model, range }: { readonly model: ChartModel; readonly range: Range },
    { brush, start }: { readonly brush: boolean; readonly start: number },
  ): void {
    const perPixel = (range[1] - range[0]) / model.plot.width;
    this.#drag = { brush, perPixel, range, start };
    if (brush) {
      this.#scene.brush(null);
    } else {
      this.#scene.setPanning(true);
    }
  }

  #move(event: PointerEvent): void {
    // A drag whose button is no longer down missed its pointerup: it ends here, as the pointerup would have.
    if (this.#drag !== null && event.buttons % 2 === 0) {
      this.#up(event);
    }
    const scene = this.#scene;
    const at = this.#local(event);
    scene.hoverAt(at);
    const drag = this.#drag;
    const x = scene.model()?.x ?? null;
    if (scene.editor.move(at) || drag === null || x === null) {
      return;
    }
    this.#dragTo(drag, at.x, x);
  }

  /** A drag moved to `px`: it brushes or pans, and once past a few pixels it is a drag, not a click. */
  #dragTo(drag: Drag, px: number, x: Scale): void {
    const scene = this.#scene;
    this.#dragged ||= Math.abs(px - drag.start) > clickSlack;
    if (drag.brush) {
      scene.brush([x.invert(drag.start), x.invert(px)]);
    } else {
      scene.zoom.schedule(panRange(drag.range, (drag.start - px) * drag.perPixel, scene.extent()));
    }
  }

  /** Ends a drag, returning it. */
  #endDrag(event: PointerEvent): Drag | null {
    const drag = this.#drag;
    this.#drag = null;
    this.#scene.setPanning(false);
    this.#scene.zoom.flush();
    if (this.#plot.hasPointerCapture(event.pointerId)) {
      this.#plot.releasePointerCapture(event.pointerId);
    }
    return drag;
  }

  /** Ends a pan, which the layout then records, or a brush, which snaps to what it selects. */
  #up(event: PointerEvent): void {
    const drag = this.#endDrag(event);
    const drew = this.#scene.editor.up();
    if (drew || drag === null) {
      return;
    }
    if (drag.brush) {
      this.#scene.brushDone();
    } else {
      this.#scene.zoom.settle("now");
    }
  }

  /** A drag the browser took over or the system interrupted ends without a pointerup; a brush it made is dropped. */
  #cancel(event: PointerEvent): void {
    this.#scene.editor.abandon();
    const drag = this.#endDrag(event);
    if (drag?.brush === true) {
      this.#scene.clearBrush();
    } else if (drag !== null) {
      this.#scene.zoom.settle("now");
    }
  }

  #wheel(event: WheelEvent): void {
    const [x, full] = [this.#scene.model()?.x ?? null, this.#scene.extent()];
    wheelZoom(event, { at: this.#local(event).x, full, x, zoom: this.#scene.zoom });
  }

  /** Plus and minus zoom, the arrows pan, 0 shows everything, Delete removes the selected drawing, Escape drops a
   * drawing in progress, the selection, then the brush, or is left to the page; with Ctrl, Cmd or Alt, the browser's. */
  #key(event: KeyboardEvent): void {
    const action = browsers(event) ? undefined : keys[event.key];
    const range = this.#scene.zoom.shown();
    const mine = action !== undefined && range !== null && event.target === this.#plot;
    if (mine && this.#act(action, range)) {
      event.preventDefault();
    }
  }

  /** Does what a key asks; returns whether it did anything. */
  #act(action: KeyAction, range: Range): boolean {
    const scene = this.#scene;
    if (action === "clear") {
      return scene.editor.cancel() || scene.clearBrush();
    }
    if (action === "all") {
      scene.zoom.reset();
    } else if (action === "remove") {
      scene.editor.remove();
    } else {
      scene.zoom.schedule(keyed(action, range, scene.extent()));
      scene.zoom.settle("now");
    }
    return true;
  }
}

export { ChartPointer };
export type { PointerScene };
