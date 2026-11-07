/* A view's state as `useView` reports it, built up from what the engine sends. */

import type { ViewListener } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import type { LayoutCheck } from "#layout/layout.ts";
import type { TableStatus, ViewOpened } from "#proto/parallax_pb.ts";

import type { Dataset } from "./use-dataset.ts";

/** Where a view stands. `waiting` has no data to open on yet; `opening` waits for the engine. */
type ViewStatus = "waiting" | "opening" | "open" | "failed";

/** What a view has reported. */
interface ViewState {
  readonly status: ViewStatus;
  /** The latest window of rows the engine sent. */
  readonly frame: FrameData | null;
  /** The latest reduction of the view's chart, for a chart the engine reduces. */
  readonly chart: ChartFrameData | null;
  /** The table's status: when it was loaded and read, and what its load turned blank. */
  readonly table: TableStatus | null;
  /** What the engine said when it opened the view: its columns and fields. */
  readonly opened: ViewOpened | null;
  /** Why the view failed, or why the engine refused its latest change, which leaves it open on the layout before. */
  readonly error: string | null;
}

const blank: ViewState = {
  chart: null,
  error: null,
  frame: null,
  opened: null,
  status: "waiting",
  table: null,
};
const opening: ViewState = { ...blank, status: "opening" };

/** A change to a view's state. */
type Change = (state: ViewState) => ViewState;

/** What a view's listener reports to. */
interface ListenerParts {
  readonly change: (next: Change) => void;
  readonly isClosed: () => boolean;
  /** Takes a chart's reduction before the state does, returning whether it took it. */
  readonly takeChart: (chart: ChartFrameData) => boolean;
  /** Takes a frame before the state does, returning whether it took it. */
  readonly takeFrame: (frame: FrameData) => boolean;
}

/** The view open, as a frame says, and as it was otherwise; `accepted` says the frame is the first of a layout change,
 * which the engine took, so a refusal of an earlier change no longer stands. */
function shown(state: ViewState, accepted: boolean): ViewState {
  const error = accepted ? null : state.error;
  return state.status === "open" && state.error === error
    ? state
    : { ...state, error, status: "open" };
}

/** The listener that turns what the engine sends a view into changes of its state. An error fails a view that is
 * closed, or that never opened; one for a view already open is a refused change, and the view stays open until a
 * later change is accepted. A frame something takes leaves the state as it was once the view is open, so it renders
 * nothing. */
function listenerFor({ change, isClosed, takeChart, takeFrame }: ListenerParts): ViewListener {
  return {
    chart: (chart) => {
      if (!takeChart(chart)) {
        change((state) => ({ ...state, chart }));
      }
    },
    error: (error) => {
      change((state) => ({
        ...state,
        error,
        status: isClosed() || state.status !== "open" ? "failed" : "open",
      }));
    },
    frame: (frame) => {
      const accepted = frame.changedAtMs !== undefined;
      const taken = takeFrame(frame);
      change((state) => (taken ? shown(state, accepted) : { ...shown(state, accepted), frame }));
    },
    opened: (opened) => {
      change((state) => ({ ...state, opened, status: "open" }));
    },
    status: (table) => {
      change((state) => ({ ...state, table }));
    },
  };
}

/** A view's state from its layout, its dataset and what its open view has reported, if it is open on them. */
function viewStateOf(
  dataset: Dataset,
  checked: LayoutCheck,
  reported: ViewState | null,
): ViewState {
  if (!checked.ok) {
    return { ...blank, error: checked.error, status: "failed" };
  }
  if (dataset.status === "idle") {
    return blank;
  }
  if (dataset.status === "failed") {
    const error = `${dataset.name} did not load: ${dataset.error ?? "no reason was given"}`;
    return { ...blank, error, status: "failed" };
  }
  return reported ?? opening;
}

export { listenerFor, opening, viewStateOf };
export type { Change, ViewState, ViewStatus };
