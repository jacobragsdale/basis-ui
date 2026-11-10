/* A grid's controller: everything the grid does between React's renders. It takes the view's frames as they arrive,
 * scrolls by asking the view's handle for rows, and draws the canvas once an animation frame (next-frame.ts), so a
 * scroll at 60 frames a second renders nothing in React and paints each frame once. React gives it the layout, the
 * dataset's columns, the tokens and the rows chosen (row-checks.ts), and renders again only when what it shows
 * changes: the row count, the totals, the menu or the status bar's note. */

import type { ViewHandle } from "#engine/view.ts";
import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";
import type { Layout } from "#layout/layout.ts";
import { sameTheme } from "#theme/read.ts";
import type { Theme } from "#theme/read.ts";

import type { GridParts } from "./dom.ts";
import { drillAt, toggleAt } from "./groups.ts";
import { hitAt } from "./hit.ts";
import type { Hit } from "./hit.ts";
import type { GridHost } from "./host.ts";
import { GridModel } from "./model.ts";
import { NextFrame } from "./next-frame.ts";
import type { Metrics } from "./paint/metrics.ts";
import { GridPainter } from "./paint/painter.ts";
import type { DrawStats } from "./paint/stats.ts";
import { Snapshots } from "./snapshot.ts";
import { RowChecks } from "./row-checks.ts";
import type { GridSnapshot } from "./snapshot.ts";
import { GridSurface } from "./surface.ts";
import type { RowSelectionInputs } from "./row-selection.ts";
import type { GridInputs } from "./types.ts";
import { keepsShown, missingWindow, windowFor } from "./window.ts";

/** A grid's controller. */
class GridController {
  readonly #model = new GridModel();
  readonly #painter = new GridPainter();
  readonly #snapshots = new Snapshots(() => this.#handle);
  #inputs: GridInputs | null = null;
  #layoutJson: string | null = null;
  #surface: GridSurface | null = null;
  #handle: ViewHandle | null = null;
  /** The next frame's drawing. */
  readonly #draw = new NextFrame(() => {
    this.#surface?.draw(this.#painter);
  });
  #focusSearch: (() => boolean) | null = null;
  readonly #rows = new RowChecks({
    handle: (): ViewHandle | null => this.#handle,
    inputs: (): RowSelectionInputs | null => this.#inputs?.rowSelection ?? null,
    model: this.#model,
    say: (message: string): void => {
      this.say(message);
    },
    update: (): void => {
      this.#update();
    },
  });

  /** For `useSyncExternalStore`: calls `listener` when what React shows changes. */
  public readonly subscribe = (listener: () => void): (() => void) =>
    this.#snapshots.subscribe(listener);

  /** For `useSyncExternalStore`: what React shows, the same object until it changes. */
  public readonly getSnapshot = (): GridSnapshot => this.#snapshots.current;

  /** Takes a frame from the view, as `useView`'s `onFrame`, unless it answers late for rows the user has left. */
  public readonly receiveFrame = (frame: FrameData): void => {
    const { metrics, frame: shown } = this.#model;
    const before = this.#model.totalRows;
    const wanted = metrics === null ? null : this.#model.visible(metrics);
    this.#model.frame = shown !== null && keepsShown(shown, frame, wanted) ? shown : frame;
    this.#fit();
    this.#surface?.rowsChanged(before);
    this.#update();
  };

  /** Drawing counters, for measurement. */
  public get drawStats(): DrawStats {
    return this.#painter.stats;
  }

  /** Starts driving the elements React rendered; returns a function that stops. */
  public attach(parts: GridParts, groupPanel: () => HTMLElement | null): () => void {
    const surface = new GridSurface(parts, { groupPanel, host: this.#host() });
    this.#surface = surface;
    const stop = surface.listen(() => {
      this.#update();
    });
    this.#painter.opening(performance.now());
    this.#update();
    return () => {
      stop();
      this.#surface = null;
      this.#draw.cancel();
    };
  }

  /** Takes React's newest inputs. */
  public setInputs(inputs: GridInputs): void {
    const { layout, fields, measureMenus } = inputs;
    // A layout is checked again on every render, so it is the same layout when its JSON is.
    const json = layout === null ? null : JSON.stringify(layout);
    const changed = json !== this.#layoutJson || fields !== this.#model.fields;
    this.#inputs = inputs;
    this.#layoutJson = json;
    Object.assign(this.#model, changed ? { fields, layout, measureMenus } : { measureMenus });
    this.#rows.take(inputs, changed);
    if (changed) {
      this.#fit();
    }
    this.#update();
  }

  /** Takes the tokens in effect, read again whenever they may have changed. Equal tokens change nothing. */
  public setTokens(theme: Theme): void {
    const was = this.#model.theme;
    if (was !== null && sameTheme(was, theme)) {
      return;
    }
    this.#model.theme = theme;
    if (was !== null && (was.font !== theme.font || was.fontLoaded !== theme.fontLoaded)) {
      // Text measured in the old font, or in a fallback before it loaded, is the wrong width now: fit it again.
      this.#painter.widths.clear();
      this.#model.fitter.reset();
      this.#fit();
    }
    this.#update();
  }

  /** Takes the open view, or null while it opens. A view that closes takes its frame and fitted widths with it. */
  public setHandle(handle: ViewHandle | null): void {
    if (handle === this.#handle) {
      return;
    }
    this.#handle = handle;
    if (handle === null) {
      Object.assign(this.#model, { frame: null });
      this.#model.fitter.reset();
      this.#painter.opening(performance.now());
    }
    this.#update();
  }

  /** Takes what puts the cursor in the toolbar's search, as Ctrl+F does, returning whether there is one. */
  public setSearch(focusSearch: () => boolean): void {
    this.#focusSearch = focusSearch;
  }

  /** Opens data column `column`'s menu, as Alt+Down or its funnel does. */
  public openMenu(column: number): void {
    this.#surface?.openMenu(column);
    this.#update();
  }

  /** Closes the header menu. */
  public closeMenu(): void {
    this.#model.interaction.menu = null;
    this.#update();
  }

  /** Shows a short note in the status bar. */
  public say(message: string): void {
    this.#snapshots.say(message);
  }

  /** Fits data column `column` to its header and values, as the menu's Fit width does. */
  public fitColumn(column: number): void {
    const width = this.#fitWidth(column);
    const key = this.#model.widthKey(column);
    this.#change((layout) => ({
      ...layout,
      column_widths: { ...layout.column_widths, [key]: width },
    }));
  }

  /** The grid as its input handlers see it. */
  #host(): GridHost {
    const model = this.#model;
    const surface = (): GridSurface | null => this.#surface;
    return {
      change: (update) => {
        this.#change(update);
      },
      get dom(): GridHost["dom"] {
        const attached = surface();
        if (attached === null) {
          throw new Error("The grid's elements are not attached.");
        }
        return attached.dom;
      },
      drill: (row, column) => {
        this.#drill(row, column);
      },
      fitWidth: (column) => this.#fitWidth(column),
      focusSearch: () => this.#focusSearch?.() ?? false,
      handle: () => this.#handle,
      hit: (x, y) => this.#hit(x, y),
      metrics: () => model.metrics,
      model,
      note: (key) => this.#painter.note(key),
      openMenu: (column) => {
        this.openMenu(column);
      },
      publish: () => {
        this.#publish(null);
      },
      redraw: () => {
        this.#redraw();
      },
      ...this.#rows.hostPart,
      reveal: (cell) => surface()?.reveal(cell),
      say: (message) => {
        this.say(message);
      },
      select: (selection) => {
        surface()?.select(selection);
        this.#rows.followFocus();
      },
      toggleRow: (row) => {
        const toggle = toggleAt(model.frame, row);
        if (toggle !== null) {
          this.#change(toggle);
        }
      },
    };
  }

  #hit(x: number, y: number): Hit | null {
    const { metrics } = this.#model;
    return metrics === null ? null : hitAt(this.#model.surface(metrics), x, y);
  }

  #drill(row: number, column: number): void {
    const request = drillAt(this.#model, row, column);
    if (request !== null) {
      this.#inputs?.drill?.(request);
    }
  }

  #change(update: (layout: Layout) => Layout): void {
    const { layout } = this.#model;
    if (layout !== null && this.#inputs !== null) {
      this.#inputs.change(update(layout));
    }
  }

  #fit(): void {
    this.#model.fit(this.#surface?.context ?? null, this.#painter.widths);
  }

  #fitWidth(column: number): number {
    return this.#model.widthToFit(this.#surface?.context ?? null, this.#painter.widths, column);
  }

  /** Asks the view for the rows and columns in view that it does not hold or already ask for. */
  #request(metrics: Metrics): void {
    const handle = this.#handle;
    const wanted = this.#model.visible(metrics);
    const missing =
      handle === null ? null : missingWindow(wanted, this.#model.frame, handle.requested());
    if (missing !== null) {
      handle?.setViewport(missing);
    }
  }

  /** The window the view opens with: what is in view at the top, once the grid knows its size and tokens. */
  #opening(metrics: Metrics | null): Viewport | null {
    if (this.#snapshots.current.opening !== null) {
      return null;
    }
    if (metrics === null || this.#surface === null || this.#model.area.height === 0) {
      return null;
    }
    return windowFor(this.#model.visible(metrics), null);
  }

  /** After any change: asks for what is missing, sizes the elements, draws, and tells React what changed. */
  #update(): void {
    const { metrics } = this.#model;
    if (metrics !== null) {
      this.#request(metrics);
      this.#surface?.layoutElements(metrics, this.#inputs?.maxHeight ?? null);
    }
    this.#rows.followFocus();
    this.#redraw();
    this.#publish(this.#opening(metrics));
  }

  #publish(opening: Viewport | null): void {
    const id = this.#surface?.dom.parts.scroll.id ?? "";
    this.#snapshots.publish(this.#model, { fill: this.#inputs?.maxHeight === null, id, opening });
  }

  /** Draws in the next animation frame, as the model is then, so that everything that changes before it draws once. */
  #redraw(): void {
    this.#draw.ask();
  }
}

export { GridController };
