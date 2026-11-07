/* One run of `useView`'s effect: it opens a view once its dataset is loaded, reports what the engine sends while the
 * run lasts, and closes the view when the run ends; a run that ends before its dataset loads opens none. */

import type { ParallaxClient } from "#engine/client.ts";
import type { ViewHandle } from "#engine/view.ts";
import type { ChartWindow, ViewListener, Viewport } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";

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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One attempt to open a view, for one run of the hook's effect. */
class ViewAttempt {
  readonly #key: string;
  readonly #report: Report;
  readonly #chartSink: ChartSink;
  #live = true;
  #view: ViewHandle | null = null;

  /** `key` names the dataset and engine the view opens on; what it reports under another key is not its own.
   * `chartSink` may take each chart reduction, which then stays out of the state. */
  public constructor(key: string, report: Report, chartSink: ChartSink) {
    this.#key = key;
    this.#report = report;
    this.#chartSink = chartSink;
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
      takeChart: (chart) => this.#live && this.#view !== null && this.#chartSink(chart, this.#view),
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
    this.#report((was) => ({
      handle: view,
      key,
      state: next(was?.key === key ? was.state : opening),
    }));
  }
}

export { ViewAttempt };
export type { ChartSink, Opened, Opening };
