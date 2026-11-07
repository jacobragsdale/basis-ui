/* One run of `useView`'s effect: it opens a view once its dataset is loaded, reports what the engine sends while the
 * run lasts, and closes the view when the run ends; a run that ends before its dataset loads opens none. */

import type { ParallaxClient } from "#engine/client.ts";
import type { ViewHandle } from "#engine/view.ts";
import type { ChartWindow, ViewListener, Viewport } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";

import { listenerFor, opening } from "./view-state.ts";
import type { Change, ViewState } from "./view-state.ts";

/** What an open view reported, under the dataset and engine it was opened on. */
interface Opened {
  readonly key: string;
  readonly handle: ViewHandle | null;
  readonly state: ViewState;
}

/** What a view opens with. */
interface Opening {
  readonly layoutJson: string;
  /** Null for a chart the engine reduces, which has no rows to ask for. */
  readonly viewport: Viewport | null;
  readonly chartWindow: ChartWindow | null;
}

/** Hands the hook a change to what it holds. */
type Report = (update: (was: Opened | null) => Opened) => void;

/** Takes a chart's reduction, and the view it is of, out of the view's state, returning whether it did. */
type ChartSink = (chart: ChartFrameData, view: ViewHandle) => boolean;

/** Takes a frame out of the view's state, returning whether it did. */
type FrameSink = (frame: FrameData) => boolean;

/** What may take a view's reports out of its state: its chart's reductions, and its frames. */
interface Sinks {
  readonly chart: ChartSink;
  readonly frame: FrameSink;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One attempt to open a view, for one run of the hook's effect. */
class ViewAttempt {
  readonly #key: string;
  readonly #report: Report;
  readonly #sinks: Sinks;
  #live = true;
  #view: ViewHandle | null = null;

  /** `key` names the dataset and engine the view opens on; what it reports under another key is not its own.
   * `sinks` may take each chart reduction and each frame, which then stay out of the state. */
  public constructor(key: string, report: Report, sinks: Sinks) {
    this.#key = key;
    this.#report = report;
    this.#sinks = sinks;
  }

  /** Opens the view once its dataset is loaded, and asks for its first window. */
  public async open(client: ParallaxClient, dataset: string, first: Opening): Promise<void> {
    try {
      /* A view's effect runs before the effects of the components above it, so a dataset that a page loads for the
       * chart or grid below it starts loading only after this. The rest of the effects run first. */
      await Promise.resolve();
      if (!this.#live) {
        return;
      }
      const connection = await client.connectionFor(dataset);
      // A run that ended while the dataset loaded opens nothing.
      if (this.#live) {
        this.#opened(connection.open(dataset, first.layoutJson, this.#listener()), first);
      }
    } catch (error: unknown) {
      this.#change((state) => ({ ...state, error: describe(error), status: "failed" }));
    }
  }

  /** Ends the run: nothing more is reported, and the view closes. */
  public end(): void {
    this.#live = false;
    this.#view?.close();
  }

  #listener(): ViewListener {
    return listenerFor({
      change: (next) => {
        this.#change(next);
      },
      isClosed: () => this.#view?.isClosed ?? false,
      takeChart: (chart) =>
        this.#live && this.#view !== null && this.#sinks.chart(chart, this.#view),
      takeFrame: (frame) => this.#live && this.#sinks.frame(frame),
    });
  }

  /** Keeps the view that opened, and asks for its first windows. */
  #opened(view: ViewHandle, first: Opening): void {
    this.#view = view;
    if (first.viewport !== null) {
      view.setViewport(first.viewport);
    }
    if (first.chartWindow !== null) {
      view.setChartWindow(first.chartWindow);
    }
    this.#change((state) => state);
  }

  #change(next: Change): void {
    if (!this.#live) {
      return;
    }
    const key = this.#key;
    const view = this.#view;
    // A change that changes nothing hands back what the hook holds, so it renders nothing.
    this.#report((was) => {
      const mine = was?.key === key ? was : null;
      const state = next(mine?.state ?? opening);
      return mine?.handle === view && mine.state === state ? mine : { handle: view, key, state };
    });
  }
}

export { ViewAttempt };
export type { ChartSink, FrameSink, Opened, Opening, Sinks };
