/* What a view asks the engine for and what it reports back. */

import type { MessageInitShape } from "@bufbuild/protobuf";

import type { ChartFrameData } from "#frame/chart-data.ts";
import type { DistinctValue } from "#frame/distinct.ts";
import type { FrameData } from "#frame/frame.ts";
import type {
  ChartMeasure,
  ClientMessageSchema,
  TableStatus,
  ViewOpened,
} from "#proto/parallax_pb.ts";

/** The body of a client message, as plain values. */
type ClientBody = NonNullable<MessageInitShape<typeof ClientMessageSchema>["body"]>;

/** What a view sends its messages through: the connection it was opened on. */
interface ViewChannel {
  /** Encodes and sends a message, returning its request id. */
  readonly send: (body: ClientBody) => bigint;
  /** Forgets a closed view. */
  readonly forget: (viewId: number) => void;
}

/** What a view reports back. */
interface ViewListener {
  readonly frame: (frame: FrameData) => void;
  /** A chart's reduction, for views whose layout has a chart the engine reduces. */
  readonly chart?: (frame: ChartFrameData) => void;
  readonly opened?: (opened: ViewOpened) => void;
  readonly status?: (status: TableStatus) => void;
  readonly error?: (message: string) => void;
}

/** A window of rows and data columns. */
interface Viewport {
  readonly firstRow: number;
  readonly rowCount: number;
  readonly firstColumn: number;
  readonly columnCount: number;
}

/** The part of a chart to reduce and the plot it fills, in pixels. Without an x range, the whole data. */
interface ChartWindow {
  readonly x?: readonly [number, number];
  /** The y range of a density; without it, the data's. */
  readonly y?: readonly [number, number];
  readonly width: number;
  readonly height: number;
}

/** What changed between two rows of a chart's series, as the engine measured and wrote it. */
type Measurement = Omit<ChartMeasure, "$typeName" | "$unknown" | "viewId" | "found" | "rows"> & {
  readonly rows: number;
};

/** A column's values for a filter pick-list. */
interface DistinctValues {
  readonly values: readonly DistinctValue[];
  /** More values match than were sent. */
  readonly truncated: boolean;
}

/** A viewport as the protocol's messages hold it. */
function gridWindow(viewport: Viewport): {
  readonly firstRow: bigint;
  readonly rowCount: bigint;
  readonly firstColumn: number;
  readonly columnCount: number;
} {
  return {
    columnCount: viewport.columnCount,
    firstColumn: viewport.firstColumn,
    firstRow: BigInt(viewport.firstRow),
    rowCount: BigInt(viewport.rowCount),
  };
}

/** A chart window as the protocol's message holds it, at least a pixel each way. */
function chartWindowMessage(
  viewId: number,
  window: ChartWindow,
): {
  readonly viewId: number;
  readonly width: number;
  readonly height: number;
  readonly xFrom?: number;
  readonly xTo?: number;
  readonly yFrom?: number;
  readonly yTo?: number;
} {
  return {
    height: Math.max(1, Math.round(window.height)),
    viewId,
    width: Math.max(1, Math.round(window.width)),
    ...(window.x === undefined ? {} : { xFrom: window.x[0], xTo: window.x[1] }),
    ...(window.y === undefined ? {} : { yFrom: window.y[0], yTo: window.y[1] }),
  };
}

function sameViewport(first: Viewport, second: Viewport): boolean {
  return (
    first.firstRow === second.firstRow &&
    first.rowCount === second.rowCount &&
    first.firstColumn === second.firstColumn &&
    first.columnCount === second.columnCount
  );
}

function sameRange(
  first: readonly [number, number] | undefined,
  second: readonly [number, number] | undefined,
): boolean {
  return first?.[0] === second?.[0] && first?.[1] === second?.[1];
}

function sameChartWindow(first: ChartWindow, second: ChartWindow): boolean {
  return (
    first.width === second.width &&
    first.height === second.height &&
    sameRange(first.x, second.x) &&
    sameRange(first.y, second.y)
  );
}

/** One open view, as an app's code reaches it through `useView`'s `handle`: what it may ask of the view. */
interface ViewHandle {
  readonly id: number;
  /** `true` once the view is closed. */
  readonly isClosed: boolean;
  /** The newest layout the view was opened or updated with, whether sent yet or waiting behind another update. */
  readonly layoutJson: string;
  /** The most recent window asked for, whether answered yet or not. */
  requested: () => Viewport | null;
  /** The newest window asked for, answered or not, which a layout update is answered with; null before the first. */
  latestViewport: () => Viewport | null;
  /** Asks for a window of rows and data columns. */
  setViewport: (viewport: Viewport) => void;
  /** Asks for a chart's reduction; a newer window replaces any waiting one. */
  setChartWindow: (window: ChartWindow) => void;
  /** Fetches one window without moving the viewport, for copying. At most 1,000,000 cells. */
  fetch: (viewport: Viewport) => Promise<FrameData>;
  /** Lists a column's values, with the view's other filters applied, for a filter pick-list. */
  distinctValues: (column: string, search: string, limit: number) => Promise<DistinctValues>;
  /** Measures a chart between two axis positions; null when the engine found no row to measure. */
  measure: (from: number, to: number, series?: string) => Promise<Measurement | null>;
  /** Replaces the view's layout, answered with the window `window` gives, if any. */
  update: (layoutJson: string, window?: (() => Viewport | null) | null) => void;
  /** The layout the view was opened or last updated with at `configVersion`, if it is still remembered. */
  layoutAt: (configVersion: bigint) => string | undefined;
  /** Expands or collapses the group at `path`. */
  setExpanded: (path: readonly (string | number | boolean | null)[], expanded: boolean) => void;
  /** Closes the view. Requests still waiting fail. */
  close: () => void;
}

export { chartWindowMessage, gridWindow, sameChartWindow, sameViewport };
export type {
  ChartWindow,
  ClientBody,
  DistinctValues,
  Measurement,
  ViewChannel,
  ViewHandle,
  ViewListener,
  Viewport,
};
