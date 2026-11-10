/* One open view of a dataset. These rules keep stale data off the screen and the engine from being flooded:
 *
 * - A view drops any frame built from an older configuration than the one it last sent, or from an older table load
 *   than one it already showed.
 * - At most one viewport request is in flight, matched to its reply by request id, and only the newest waits; chart
 *   windows work the same way (`slot.ts`).
 * - Layout updates, and what waits behind them, follow `updates.ts`.
 *
 * A one-off window, such as the cells a user copies, is fetched without moving the viewport; its reply is matched by
 * request id and never drawn (`requests.ts`). */

import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import type {
  ChartMeasure,
  DistinctValuesResult,
  TableStatus,
  ViewOpened,
} from "#proto/parallax_pb.ts";

import { ViewRequests } from "./requests.ts";
import { WindowSlot } from "./slot.ts";
import { LayoutUpdates } from "./updates.ts";
import type { PendingUpdate } from "./updates.ts";
import { chartWindowMessage, gridWindow, sameChartWindow, sameViewport } from "./view-types.ts";
import type {
  ChartWindow,
  DistinctValues,
  Measurement,
  ViewChannel,
  ViewListener,
  Viewport,
} from "./view-types.ts";

const closedReason = "The view is closed.";
const firstLoad = 0n;

/** One open view. */
class ViewHandle {
  public readonly id: number;
  readonly #channel: ViewChannel;
  readonly #listener: ViewListener;
  readonly #updates = new LayoutUpdates();
  readonly #requests: ViewRequests;
  readonly #rows: WindowSlot<Viewport>;
  readonly #chart: WindowSlot<ChartWindow>;
  #lastLoadVersion = firstLoad;
  #closed = false;

  public constructor(id: number, channel: ViewChannel, listener: ViewListener) {
    this.id = id;
    this.#channel = channel;
    this.#listener = listener;
    this.#requests = new ViewRequests(id, channel);
    this.#rows = new WindowSlot({
      same: sameViewport,
      send: (viewport): bigint =>
        channel.send({ case: "setViewport", value: { viewId: id, ...gridWindow(viewport) } }),
    });
    this.#chart = new WindowSlot({
      same: sameChartWindow,
      send: (window): bigint =>
        channel.send({ case: "setChartWindow", value: chartWindowMessage(id, window) }),
    });
  }

  /** `true` once the view is closed. */
  public get isClosed(): boolean {
    return this.#closed;
  }

  /** The newest layout the view was opened or updated with, whether sent yet or waiting behind another update. */
  public get layoutJson(): string {
    return this.#updates.latest;
  }

  /** The most recent window asked for, whether answered yet or not. */
  public requested(): Viewport | null {
    return this.#rows.requested();
  }

  /** The newest window asked for, answered or not, which a layout update is answered with; null before the first. */
  public latestViewport(): Viewport | null {
    return this.#rows.latest();
  }

  /** Asks for a window of rows and data columns. */
  public setViewport(viewport: Viewport): void {
    if (!this.#closed) {
      this.#rows.ask(viewport, this.#updates.waiting);
    }
  }

  /** Asks for a chart's reduction. While one is in flight, a newer window replaces any waiting one, so zooming and
   * panning faster than frames arrive never queues them. */
  public setChartWindow(window: ChartWindow): void {
    if (!this.#closed) {
      this.#chart.ask(window, this.#updates.waiting);
    }
  }

  /** Fetches one window without moving the viewport, for copying. At most 1,000,000 cells. */
  public async fetch(viewport: Viewport): Promise<FrameData> {
    this.#checkOpen();
    return this.#requests.fetch(viewport);
  }

  /** Lists a column's values, with the view's other filters applied, for a filter pick-list. */
  public async distinctValues(
    column: string,
    search: string,
    limit: number,
  ): Promise<DistinctValues> {
    this.#checkOpen();
    return this.#requests.distinctValues(column, search, limit);
  }

  /**
   * Measures a chart between two axis positions: the rows nearest each with a price, the change between them and the
   * bars from one to the other, every value as the engine writes it. `series` picks a series by its value's text.
   * Null when the engine found no row to measure.
   */
  public async measure(from: number, to: number, series = ""): Promise<Measurement | null> {
    this.#checkOpen();
    return this.#requests.measure(from, to, series);
  }

  /**
   * Replaces the view's layout; frames of older layouts are dropped once it is sent. `window` gives a grid's window to
   * answer the update with, read when the update is sent so that it is the newest. The engine always answers an update
   * with a window, so one waits in flight until it does; an update asked for meanwhile waits, replacing any already
   * waiting, so only the newest layout goes next. An update without a window goes at once.
   */
  public update(layoutJson: string, window: (() => Viewport | null) | null = null): void {
    if (!this.#closed) {
      this.#sendNext(this.#updates.ask(layoutJson, window));
    }
  }

  /** The layout the view was opened or last updated with at `configVersion`, if it is still remembered. */
  public layoutAt(configVersion: bigint): string | undefined {
    return this.#updates.layoutAt(configVersion);
  }

  /** Expands or collapses the group at `path`. */
  public setExpanded(path: readonly (string | number | boolean | null)[], expanded: boolean): void {
    if (this.#closed) {
      return;
    }
    const expansion = { expanded, pathJson: JSON.stringify(path) };
    if (!this.#updates.hold(expansion)) {
      this.#channel.send({ case: "setExpanded", value: { viewId: this.id, ...expansion } });
    }
  }

  /** Closes the view. Requests still waiting fail. */
  public close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#updates.clear();
    this.#requests.failAll(closedReason);
    this.#channel.send({ case: "closeView", value: { viewId: this.id } });
    this.#channel.forget(this.id);
  }

  /** @internal Called by the connection with the layout the view opens with. */
  public opened(layoutJson: string): void {
    this.#updates.opened(layoutJson);
  }

  /** @internal Called by the connection. */
  public receiveFrame(frame: FrameData, requestId: bigint): void {
    if (this.#requests.fetching(requestId)) {
      this.#answered(frame.configVersion);
      this.#requests.fetched(requestId, frame);
      return;
    }
    const askedAtMs = this.#rows.settle(requestId, this.#updates.waiting);
    this.#answered(frame.configVersion);
    if (this.#stale(frame)) {
      return;
    }
    const changedAtMs = this.#updates.changedAt(frame.configVersion);
    this.#listener.frame({
      ...frame,
      ...(askedAtMs === undefined ? {} : { requestedAtMs: askedAtMs }),
      ...(changedAtMs === undefined ? {} : { changedAtMs }),
    });
  }

  /** @internal Called by the connection. */
  public receiveChartFrame(frame: ChartFrameData, requestId: bigint): void {
    const askedAtMs = this.#chart.settle(requestId, this.#updates.waiting);
    this.#answered(frame.configVersion);
    if (!this.#stale(frame)) {
      this.#listener.chart?.(
        askedAtMs === undefined ? frame : { ...frame, requestedAtMs: askedAtMs },
      );
    }
  }

  /** @internal Called by the connection when the transport closes: requests fail and the view reports why. */
  public receiveDisconnect(reason: string): void {
    this.#requests.failAll(reason);
    this.#rows.clear();
    this.#chart.clear();
    this.#updates.clear();
    this.#closed = true;
    this.#listener.error?.(reason);
  }

  /** @internal Called by the connection. */
  public receiveDistinct(result: DistinctValuesResult, requestId: bigint): void {
    this.#requests.listed(requestId, result);
  }

  /** @internal Called by the connection. */
  public receiveMeasure(result: ChartMeasure, requestId: bigint): void {
    this.#requests.measured(requestId, result);
  }

  /** @internal Called by the connection. */
  public receiveOpened(opened: ViewOpened): void {
    this.#listener.opened?.(opened);
  }

  /** @internal Called by the connection. */
  public receiveStatus(status: TableStatus): void {
    this.#listener.status?.(status);
  }

  /** @internal Called by the connection: the engine refused request `requestId`. */
  public receiveError(message: string, requestId: bigint): void {
    if (this.#requests.refused(requestId, message)) {
      return;
    }
    const held = this.#updates.waiting;
    this.#rows.settle(requestId, held);
    this.#chart.settle(requestId, held);
    // An update the engine refused is answered all the same: the next one may go.
    this.#sendNext(this.#updates.refused(requestId));
    this.#listener.error?.(message);
  }

  #checkOpen(): void {
    if (this.#closed) {
      throw new Error(closedReason);
    }
  }

  /** Whether a frame is older than what the view has shown, by its layout or its table's load, which it then drops. */
  #stale(frame: { readonly configVersion: bigint; readonly loadVersion: bigint }): boolean {
    if (
      frame.configVersion < this.#updates.configVersion ||
      frame.loadVersion < this.#lastLoadVersion
    ) {
      return true;
    }
    this.#lastLoadVersion = frame.loadVersion;
    return false;
  }

  /** Releases the update in flight once a frame of its layout or a newer one arrives, and sends the one waiting. */
  #answered(configVersion: bigint): void {
    this.#sendNext(this.#updates.answered(configVersion));
  }

  #sendNext(update: PendingUpdate | null): void {
    if (update !== null) {
      this.#sendUpdate(update);
    }
  }

  #sendUpdate(update: PendingUpdate): void {
    const { configVersion, layoutJson, viewport } = this.#updates.begin(update);
    const requestId = this.#channel.send({
      case: "updateView",
      value: {
        configVersion,
        layoutJson,
        viewId: this.id,
        ...(viewport === null ? {} : { viewport: gridWindow(viewport) }),
      },
    });
    if (viewport !== null) {
      this.#updates.sent(configVersion, requestId);
      this.#rows.carried(viewport, requestId);
    }
    // What waited behind the update follows it, in the order it was asked for.
    for (const expansion of this.#updates.release()) {
      this.#channel.send({ case: "setExpanded", value: { viewId: this.id, ...expansion } });
    }
    this.#rows.flush();
    this.#chart.flush();
  }
}

export { ViewHandle };
