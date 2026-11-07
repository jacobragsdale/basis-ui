/* A chart's scene: what `<Chart>` draws, kept outside React. React hands it the layout, the frames and the theme, and
 * its elements through callback refs; it builds the draw model, paints the canvas once an animation frame at most,
 * moves the crosshair, the tooltip and the brush over it, and writes the status line, so that the pointer, the wheel
 * and the engine's frames redraw the chart without a React render. It calls React back only for what the chrome shows:
 * the legend, the drawing tools' state, the plot's size, and the layout's changes. */

import type { ViewHandle } from "#engine/view.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import type { Layout, LayoutFilter, LayoutScalar } from "#layout/layout.ts";
import type { ParallaxTokens } from "#react/use-theme.ts";

import { DrawingEditor } from "./drawing-editor.ts";
import type { EditorState } from "./drawing-editor.ts";
import { TextMeasurer } from "./measurer.ts";
import type { CategoryData, ChartModel, LegendEntry } from "./model-types.ts";
import { ChartOverlay } from "./overlay.ts";
import type { OverlayElements } from "./overlay.ts";
import type { Range } from "./range.ts";
import { HostRelay } from "./host-relay.ts";
import { editorHostOf } from "./scene-editor-host.ts";
import { SceneGestures } from "./scene-gestures.ts";
import type { PlotSize } from "./scene-inputs.ts";
import { SceneModel } from "./scene-model.ts";
import { SceneParts } from "./scene-parts.ts";
import type { AttachedElements } from "./scene-parts.ts";
import { ChartPointer } from "./scene-pointer.ts";
import { SceneView } from "./scene-view.ts";
import { chartSync } from "./sync.ts";
import { ChartZoom } from "./zoom.ts";

/** A group selected by clicking its bar or slice, the outermost group column and the group's exact key; or a scatter's
 * dot, its id column and the id's exact value. */
interface ChartSelection {
  readonly column: string;
  readonly value: LayoutScalar;
  /** The group's label, as the chart shows it. */
  readonly label: string;
}

/** What a scene tells React. */
interface SceneHost {
  /** The chart changed its layout: a series hidden or shown, a zoom recorded, a drawing made or moved. */
  readonly layoutChange: (layout: Layout) => void;
  /** The filters a Shift-drag brush selects, or null once it is cleared. */
  readonly brushed: (filters: readonly LayoutFilter[] | null) => void;
  /** The group a click selected, or null once the selection is cleared. */
  readonly selected: (selection: ChartSelection | null) => void;
  /** The legend's entries changed. */
  readonly legend: (entries: readonly LegendEntry[]) => void;
  /** The plot's size and the chart's own, as they resize. */
  readonly resized: (plot: PlotSize, outer: PlotSize) => void;
}

/** The elements a scene draws in. */
interface SceneElements extends OverlayElements {
  readonly canvas: HTMLCanvasElement;
  readonly plot: HTMLElement;
  /** The status line's summary, if the chart shows one. */
  readonly summary: HTMLElement | null;
  /** The status line's time the data's source was read, if the chart shows one. */
  readonly asOf: HTMLElement | null;
  /** The text alternative, which a screen reader reads in place of the canvas. */
  readonly words: HTMLElement;
}

function sizeOf(element: HTMLElement): PlotSize {
  return { height: element.clientHeight, width: element.clientWidth };
}

/** One chart's scene. */
class ChartScene {
  public readonly zoom: ChartZoom;
  public readonly editor: DrawingEditor;
  /** The callback refs of the elements the scene draws in. */
  public readonly parts = new SceneParts((elements) => this.#attach(elements));
  readonly #model: SceneModel;
  readonly #view: SceneView;
  readonly #gestures: SceneGestures;
  readonly #editorListeners = new Set<() => void>();
  readonly #host = new HostRelay();
  #handle: ViewHandle | null = null;
  #measurer: TextMeasurer | null = null;
  #readTokens: ((element: Element) => ParallaxTokens) | null = null;
  #frameRequest: number | null = null;

  public constructor() {
    this.#model = new SceneModel({
      changed: (): void => {
        this.schedule();
      },
      measure: (text, font): number | null => this.#measurer?.measure(text, font) ?? null,
    });
    this.#view = new SceneView(this.#model);
    this.zoom = new ChartZoom({
      ask: (range): void => {
        this.#ask(range);
      },
      extent: (): Range | null => this.#gestures.extent(),
      record: (range): void => {
        this.#model.record(range, this.#changeLayout);
      },
      recorded: (): Range | null => this.#model.recordedRange(),
    });
    this.editor = new DrawingEditor(
      editorHostOf({
        changeLayout: this.#changeLayout,
        changed: (what): void => {
          this.#editorChanged(what);
        },
        drawn: (): ChartModel | null => this.#gestures.model(),
        handle: (): ViewHandle | null => this.#handle,
        measurer: (): TextMeasurer | null => this.#measurer,
        model: this.#model,
      }),
    );
    this.#gestures = new SceneGestures({
      editor: this.editor,
      host: (): SceneHost | null => this.#host.host,
      model: this.#model,
      schedule: (): void => {
        this.schedule();
      },
      source: this,
      view: this.#view,
      zoom: this.zoom,
    });
  }

  /** The editor's state, for `useSyncExternalStore`. */
  public readonly editorState = (): EditorState => this.editor.state;

  /** Calls `listener` whenever the editor's state changes, for `useSyncExternalStore`. */
  public readonly subscribeEditor = (listener: () => void): (() => void) => {
    this.#editorListeners.add(listener);
    return (): void => {
      this.#editorListeners.delete(listener);
    };
  };

  /** A measurement's card's callback ref: the scene places the card once it shows. */
  public readonly measureCardRef = (card: HTMLElement | null): void => {
    if (card !== null) {
      this.schedule();
    }
  };

  /** What the scene tells React. */
  public setHost(host: SceneHost): void {
    this.#host.set(host);
  }

  /** The chart's layout, with its chart section, and the group its crosshair moves with. */
  public setLayout(layout: Layout | null, sync: string | null | undefined): void {
    const before = this.#model.recordedRange();
    const rowsChanged = this.#model.setLayout(layout, sync);
    if (rowsChanged && this.#gestures.brushed !== null) {
      this.#gestures.clearBrush();
    }
    this.zoom.adopt(before);
    this.editor.refresh();
  }

  /** The open view, which zooming asks for windows of, and grouped frames are checked against. */
  public setHandle(handle: ViewHandle | null): void {
    this.#handle = handle;
  }

  /** A chart reduction from the engine, of the view `handle`; a frame of another shape than the chart's now is
   * dropped. */
  public setFrame(frame: ChartFrameData, handle: ViewHandle): void {
    this.#handle = handle;
    this.#model.setFrame(frame, handle);
  }

  /** A grouped view's frame, which bar charts, heatmaps and pies draw; `order` may put its groups in another order. */
  public setGroups(
    frame: FrameData | null,
    order: ((data: CategoryData) => CategoryData) | null,
  ): void {
    if (frame !== null) {
      this.#model.setGroups(frame, { handle: this.#handle, order });
    }
  }

  /** The plot's size, and whether the chart is compact. */
  public setSize(size: PlotSize, compact: boolean): void {
    this.#model.setSize(size, compact);
  }

  /** How to read the theme's tokens for an element: a new reader whenever they may have changed. */
  public setThemeReader(read: (element: Element) => ParallaxTokens): void {
    this.#readTokens = read;
    this.#readTheme();
  }

  /** Hides a series, or shows it again. */
  public toggle(label: string): void {
    this.#model.toggled(label, this.#changeLayout);
  }

  /** Deletes the selected drawing, and gives the plot the keyboard back. */
  public removeDrawing(): void {
    this.editor.remove();
    this.parts.get("plot")?.focus();
  }

  /** A note's text, or null when it was dropped; the plot has the keyboard back. */
  public noteDone(text: string | null): void {
    this.editor.noteDone(text);
    this.parts.get("plot")?.focus();
  }

  /** Draws everything again at the next animation frame. */
  public schedule(): void {
    this.#frameRequest ??= requestAnimationFrame(() => {
      this.#frameRequest = null;
      const { brushed: brush, editor, zoom } = this.#gestures;
      this.#view.render({ brush, editor, source: this, zoom });
      const legend = this.#view.takeLegend();
      if (legend !== null) {
        this.#host.legend(legend);
      }
    });
  }

  readonly #changeLayout = (next: Layout): void => {
    this.setLayout(next, this.#model.sync);
    this.#host.host?.layoutChange(next);
  };

  /** Draws in `elements`, follows their sizes and the shared pointer, and listens to the plot, until the returned
   * function is called. */
  #attach(elements: AttachedElements): () => void {
    this.#measurer = new TextMeasurer(elements.canvas.ownerDocument);
    this.#view.attach(elements, new ChartOverlay(elements));
    const detachPointer = new ChartPointer(this.#gestures, elements.plot).attach();
    const unsubscribe = chartSync.subscribe(() => {
      this.schedule();
    });
    const observer = new ResizeObserver(() => {
      this.#host.resized(sizeOf(elements.plot), sizeOf(elements.root));
    });
    observer.observe(elements.root);
    observer.observe(elements.plot);
    this.#readTheme();
    this.#model.changed();
    return (): void => {
      detachPointer();
      unsubscribe();
      observer.disconnect();
      chartSync.release(this);
      this.#view.detach();
      if (this.#frameRequest !== null) {
        cancelAnimationFrame(this.#frameRequest);
        this.#frameRequest = null;
      }
    };
  }

  /** Reads the theme's tokens on the canvas, once both are there. */
  #readTheme(): void {
    const canvas = this.parts.get("canvas");
    if (canvas !== null && this.#readTokens !== null) {
      const tokens = this.#readTokens(canvas);
      this.#model.setTheme(tokens.theme, tokens.colors);
    }
  }

  #editorChanged(what: "state" | "paint"): void {
    this.#view.repaint();
    this.schedule();
    if (what === "state") {
      for (const listener of this.#editorListeners) {
        listener();
      }
    }
  }

  #ask(range: Range | null): void {
    const { width, height } = this.#model.size;
    if (width > 0 && height > 0) {
      this.#handle?.setChartWindow({ height, width, ...(range === null ? {} : { x: range }) });
    }
  }
}

export { ChartScene };
export type { ChartSelection, SceneElements, SceneHost };
