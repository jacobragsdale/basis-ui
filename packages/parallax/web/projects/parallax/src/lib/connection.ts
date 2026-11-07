/**
 * The protocol client, independent of Angular.
 *
 * One connection carries every view over one transport, the messages to and from
 * the worker hosting the WebAssembly engine. These rules keep stale data off the
 * screen and the engine from being flooded:
 *
 * - A view drops any frame built from an older configuration than the one it last
 *   sent, or from an older table load than one it already showed.
 * - At most one viewport request per view is in flight, matched to its reply by
 *   request id. Scrolling faster than frames arrive replaces the pending request
 *   instead of queueing them.
 * - A grid's layout update carries the window to answer it with, which the engine
 *   always answers. At most one such update per view is in flight, and only the
 *   newest waits, so typing faster than the engine answers never queues a backlog.
 *   Viewports, chart windows and expansions asked for while an update waits are
 *   sent after it, so that they apply to its layout.
 *
 * A one-off window, such as the cells a user copies, is fetched without moving the
 * viewport; its reply is matched by request id and never drawn.
 */

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";

import { decodeChartFrame } from "./chart-frame";
import type { ChartFrameData } from "./chart-frame";
import { decodeDistinct, decodeFrame, FrameError } from "./frame";
import type { DistinctValue, FrameData } from "./frame";
import { ClientMessageSchema, ServerMessageSchema } from "./proto/parallax_pb";
import type { ChartFrame, ChartMeasure, DistinctValuesResult, Frame, TableStatus, ViewOpened } from "./proto/parallax_pb";

/** The body of a client message, as plain values. */
export type ClientBody = NonNullable<MessageInitShape<typeof ClientMessageSchema>["body"]>;

/** Moves encoded messages between the client and an engine. */
export interface Transport {
  readonly send: (bytes: Uint8Array) => void;
  readonly close: () => void;
}

/** What a view reports back. */
export interface ViewListener {
  readonly frame: (frame: FrameData) => void;
  /** A chart's reduction, for views whose layout has a chart the engine reduces. */
  readonly chart?: (frame: ChartFrameData) => void;
  readonly opened?: (opened: ViewOpened) => void;
  readonly status?: (status: TableStatus) => void;
  readonly error?: (message: string) => void;
}

/** A window of rows and data columns. */
export interface Viewport {
  readonly firstRow: number;
  readonly rowCount: number;
  readonly firstColumn: number;
  readonly columnCount: number;
}

/** The part of a chart to reduce and the plot it fills, in pixels. Without an x range, the whole data. */
export interface ChartWindow {
  readonly x?: readonly [number, number];
  /** The y range of a density; without it, the data's. */
  readonly y?: readonly [number, number];
  readonly width: number;
  readonly height: number;
}

function sameChartWindow(a: ChartWindow | null, b: ChartWindow): boolean {
  return a !== null && a.width === b.width && a.height === b.height && a.x?.[0] === b.x?.[0] && a.x?.[1] === b.x?.[1] && a.y?.[0] === b.y?.[0] && a.y?.[1] === b.y?.[1];
}

/** What changed between two rows of a chart's series, as the engine measured and wrote it; null when it had no row to measure. */
export type Measurement = Omit<ChartMeasure, "$typeName" | "$unknown" | "viewId" | "found" | "rows"> & { readonly rows: number };

/** A column's values for a filter pick-list. */
export interface DistinctValues {
  readonly values: readonly DistinctValue[];
  /** More values match than were sent. */
  readonly truncated: boolean;
}

interface Pending<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function sameViewport(a: Viewport | null, b: Viewport): boolean {
  return a !== null && a.firstRow === b.firstRow && a.rowCount === b.rowCount && a.firstColumn === b.firstColumn && a.columnCount === b.columnCount;
}

/** How many recent layouts a view remembers. */
const LAYOUTS_KEPT = 8n;

function gridWindow(viewport: Viewport): { readonly firstRow: bigint; readonly rowCount: bigint; readonly firstColumn: number; readonly columnCount: number } {
  return { firstRow: BigInt(viewport.firstRow), rowCount: BigInt(viewport.rowCount), firstColumn: viewport.firstColumn, columnCount: viewport.columnCount };
}

/** A layout update not yet sent: the layout, the window to answer it with when it goes, and when it was asked for. */
interface PendingUpdate {
  readonly layoutJson: string;
  readonly window: (() => Viewport | null) | null;
  readonly askedAtMs: number;
}

/** One open view. */
export class ViewHandle {
  private configVersion = 0n;
  private lastLoadVersion = 0n;
  /**
   * The window awaiting its frame, and when the grid asked for it: a viewport request, or the window an update
   * carried, which is not timed as a request because the update is.
   */
  private inFlight: { readonly viewport: Viewport; readonly requestId: bigint; readonly askedAtMs: number | null } | null = null;
  /** A viewport asked for while another was in flight, and when. */
  private pending: { readonly viewport: Viewport; readonly askedAtMs: number } | null = null;
  private closed = false;
  /** The chart window awaiting its frame, and one asked for meanwhile, as with viewports. */
  private chartInFlight: { readonly window: ChartWindow; readonly requestId: bigint; readonly askedAtMs: number } | null = null;
  private chartPending: { readonly window: ChartWindow; readonly askedAtMs: number } | null = null;
  /** The latest layout change still waiting for its first frame, and when it was asked for. */
  private change: { readonly configVersion: bigint; readonly sentAtMs: number } | null = null;
  /** The update with a window that the engine has not answered yet. */
  private updateInFlight: { readonly configVersion: bigint; readonly requestId: bigint } | null = null;
  /** The newest update asked for while another was in flight. */
  private updatePending: PendingUpdate | null = null;
  /** Expansions asked for while an update waits, sent after it. */
  private heldExpansions: readonly { readonly pathJson: string; readonly expanded: boolean }[] = [];
  /** The layouts recently sent, by configuration version, so a frame's own layout can be read. */
  private readonly layouts = new Map<bigint, string>();
  private readonly fetches = new Map<bigint, Pending<FrameData>>();
  private readonly lists = new Map<bigint, Pending<DistinctValues>>();
  private readonly measures = new Map<bigint, Pending<Measurement | null>>();

  constructor(
    public readonly id: number,
    private readonly connection: Connection,
    private readonly listener: ViewListener
  ) {}

  /** The most recent window asked for, whether answered yet or not. */
  public requested(): Viewport | null {
    return this.pending?.viewport ?? this.inFlight?.viewport ?? null;
  }

  /** Asks for a window of rows and data columns. */
  public setViewport(viewport: Viewport): void {
    if (this.closed || sameViewport(this.pending?.viewport ?? null, viewport)) {
      return;
    }
    // Back to the window in flight: whatever was waiting is no longer wanted.
    if (sameViewport(this.inFlight?.viewport ?? null, viewport)) {
      this.pending = null;
      return;
    }
    // The clock starts now, so time spent waiting behind the request in flight counts.
    const askedAtMs = performance.now();
    if (this.inFlight !== null || this.updatePending !== null) {
      this.pending = { viewport, askedAtMs };
      return;
    }
    this.sendViewport(viewport, askedAtMs);
  }

  /**
   * Asks for a chart's reduction. While one is in flight, a newer window replaces any waiting one, so zooming
   * and panning faster than frames arrive never queues them.
   */
  public setChartWindow(window: ChartWindow): void {
    if (this.closed || sameChartWindow(this.chartPending?.window ?? null, window)) {
      return;
    }
    // Back to the window in flight: whatever was waiting is no longer wanted.
    if (sameChartWindow(this.chartInFlight?.window ?? null, window)) {
      this.chartPending = null;
      return;
    }
    const askedAtMs = performance.now();
    if (this.chartInFlight !== null || this.updatePending !== null) {
      this.chartPending = { window, askedAtMs };
      return;
    }
    this.sendChartWindow(window, askedAtMs);
  }

  private sendChartWindow(window: ChartWindow, askedAtMs: number): void {
    const requestId = this.connection.send({
      case: "setChartWindow",
      value: {
        viewId: this.id,
        ...(window.x === undefined ? {} : { xFrom: window.x[0], xTo: window.x[1] }),
        ...(window.y === undefined ? {} : { yFrom: window.y[0], yTo: window.y[1] }),
        width: Math.max(1, Math.round(window.width)),
        height: Math.max(1, Math.round(window.height))
      }
    });
    this.chartInFlight = { window, requestId, askedAtMs };
  }

  /** Releases the chart window in flight if `requestId` answers it, and sends any pending one unless an update waits. */
  private settleChart(requestId: bigint): number | undefined {
    if (this.chartInFlight?.requestId !== requestId) {
      return undefined;
    }
    const askedAtMs = this.chartInFlight.askedAtMs;
    this.chartInFlight = null;
    const next = this.chartPending;
    if (next !== null && this.updatePending === null) {
      this.chartPending = null;
      this.sendChartWindow(next.window, next.askedAtMs);
    }
    return askedAtMs;
  }

  /** @internal Called by the connection. */
  public receiveChartFrame(frame: ChartFrameData, requestId: bigint): void {
    const askedAtMs = this.settleChart(requestId);
    this.answered(frame.configVersion);
    if (frame.configVersion < this.configVersion || frame.loadVersion < this.lastLoadVersion) {
      return;
    }
    this.lastLoadVersion = frame.loadVersion;
    this.listener.chart?.(askedAtMs === undefined ? frame : { ...frame, requestedAtMs: askedAtMs });
  }

  /** Fetches one window without moving the viewport, for copying. At most 1,000,000 cells. */
  public fetch(viewport: Viewport): Promise<FrameData> {
    if (this.closed) {
      return Promise.reject(new Error("the view is closed"));
    }
    return new Promise((resolve, reject) => {
      const requestId = this.connection.send({
        case: "fetchWindow",
        value: { viewId: this.id, firstRow: BigInt(viewport.firstRow), rowCount: BigInt(viewport.rowCount), firstColumn: viewport.firstColumn, columnCount: viewport.columnCount }
      });
      this.fetches.set(requestId, { resolve, reject });
    });
  }

  /** Lists a column's values, with the view's other filters applied, for a filter pick-list. */
  public distinctValues(column: string, search: string, limit: number): Promise<DistinctValues> {
    if (this.closed) {
      return Promise.reject(new Error("the view is closed"));
    }
    return new Promise((resolve, reject) => {
      const requestId = this.connection.send({ case: "distinctValues", value: { viewId: this.id, column, search, limit } });
      this.lists.set(requestId, { resolve, reject });
    });
  }

  /**
   * Measures a chart between two axis positions: the rows nearest each with a price, the change between them and the
   * bars from one to the other, every value as the engine writes it. `series` picks a series by its value's text.
   */
  public measure(from: number, to: number, series = ""): Promise<Measurement | null> {
    if (this.closed) {
      return Promise.reject(new Error("the view is closed"));
    }
    return new Promise((resolve, reject) => {
      const requestId = this.connection.send({ case: "measureChart", value: { viewId: this.id, from, to, series } });
      this.measures.set(requestId, { resolve, reject });
    });
  }

  /** Fails every request still waiting for a reply. */
  private failPending(reason: string): void {
    for (const pending of [...this.fetches.values(), ...this.lists.values(), ...this.measures.values()]) {
      pending.reject(new Error(reason));
    }
    this.fetches.clear();
    this.lists.clear();
    this.measures.clear();
  }

  /**
   * Replaces the view's layout; frames of older layouts are dropped once it is sent. `window` gives a grid's window
   * to answer the update with, read when the update is sent so that it is the newest. The engine always answers an
   * update with a window, so one waits in flight until it does; an update asked for meanwhile waits, replacing any
   * already waiting, so only the newest layout goes next. An update without a window goes at once.
   */
  public update(layoutJson: string, window: (() => Viewport | null) | null = null): void {
    if (this.closed) {
      return;
    }
    const update: PendingUpdate = { layoutJson, window, askedAtMs: performance.now() };
    if (this.updateInFlight !== null) {
      this.updatePending = update;
      return;
    }
    this.sendUpdate(update);
  }

  /** The layout the view was opened or last updated with at `configVersion`, if it is still remembered. */
  public layoutAt(configVersion: bigint): string | undefined {
    return this.layouts.get(configVersion);
  }

  /** @internal Called by the connection with the layout the view opens with. */
  public opened(layoutJson: string): void {
    this.layouts.set(0n, layoutJson);
  }

  private sendUpdate(update: PendingUpdate): void {
    this.configVersion += 1n;
    this.layouts.set(this.configVersion, update.layoutJson);
    // Frames older than the last few layouts are dropped anyway.
    for (const version of this.layouts.keys()) {
      if (version + LAYOUTS_KEPT <= this.configVersion) {
        this.layouts.delete(version);
      }
    }
    // Timed from when it was asked for, so that time spent waiting behind the update in flight counts.
    this.change = { configVersion: this.configVersion, sentAtMs: update.askedAtMs };
    const viewport = update.window?.() ?? null;
    const requestId = this.connection.send({
      case: "updateView",
      value: { viewId: this.id, layoutJson: update.layoutJson, configVersion: this.configVersion, ...(viewport === null ? {} : { viewport: gridWindow(viewport) }) }
    });
    if (viewport !== null) {
      this.updateInFlight = { configVersion: this.configVersion, requestId };
      // The update's answer holds the newest window, so a viewport still waiting is no longer wanted.
      this.pending = null;
      this.inFlight = { viewport, requestId, askedAtMs: null };
    }
    // What waited behind the update follows it, in the order it was asked for.
    for (const held of this.heldExpansions) {
      this.connection.send({ case: "setExpanded", value: { viewId: this.id, ...held } });
    }
    this.heldExpansions = [];
    const viewportNext = this.pending;
    if (viewportNext !== null && this.inFlight === null) {
      this.pending = null;
      this.sendViewport(viewportNext.viewport, viewportNext.askedAtMs);
    }
    const chartNext = this.chartPending;
    if (chartNext !== null && this.chartInFlight === null) {
      this.chartPending = null;
      this.sendChartWindow(chartNext.window, chartNext.askedAtMs);
    }
  }

  /** Releases the update in flight once a frame of its layout or a newer one arrives, and sends the one waiting. */
  private answered(configVersion: bigint): void {
    if (this.updateInFlight !== null && configVersion >= this.updateInFlight.configVersion) {
      this.releaseUpdate();
    }
  }

  private releaseUpdate(): void {
    this.updateInFlight = null;
    const next = this.updatePending;
    this.updatePending = null;
    if (next !== null) {
      this.sendUpdate(next);
    }
  }

  /** Expands or collapses the group at `path`. */
  public setExpanded(path: readonly (string | number | boolean | null)[], expanded: boolean): void {
    if (this.closed) {
      return;
    }
    const held = { pathJson: JSON.stringify(path), expanded };
    if (this.updatePending !== null) {
      this.heldExpansions = [...this.heldExpansions, held];
      return;
    }
    this.connection.send({ case: "setExpanded", value: { viewId: this.id, ...held } });
  }

  /** `true` once the view is closed. */
  public get isClosed(): boolean {
    return this.closed;
  }

  /** Closes the view. Fetches still waiting fail. */
  public close(): void {
    if (!this.closed) {
      this.closed = true;
      this.updatePending = null;
      this.heldExpansions = [];
      this.failPending("the view is closed");
      this.connection.send({ case: "closeView", value: { viewId: this.id } });
      this.connection.forget(this.id);
    }
  }

  private sendViewport(viewport: Viewport, askedAtMs: number): void {
    const requestId = this.connection.send({ case: "setViewport", value: { viewId: this.id, ...gridWindow(viewport) } });
    this.inFlight = { viewport, requestId, askedAtMs };
  }

  /**
   * Releases the window in flight if `requestId` answers it, and sends any pending one unless an update waits.
   * Returns when the grid asked for the window, if it was a viewport request.
   */
  private settle(requestId: bigint): number | undefined {
    if (this.inFlight?.requestId !== requestId) {
      return undefined;
    }
    const askedAtMs = this.inFlight.askedAtMs ?? undefined;
    this.inFlight = null;
    const next = this.pending;
    if (next !== null && this.updatePending === null) {
      this.pending = null;
      this.sendViewport(next.viewport, next.askedAtMs);
    }
    return askedAtMs;
  }

  /** @internal Called by the connection. */
  public receiveFrame(frame: FrameData, requestId: bigint): void {
    const fetch = this.fetches.get(requestId);
    if (fetch !== undefined) {
      this.fetches.delete(requestId);
      this.answered(frame.configVersion);
      fetch.resolve(frame);
      return;
    }
    const askedAtMs = this.settle(requestId);
    this.answered(frame.configVersion);
    if (frame.configVersion < this.configVersion || frame.loadVersion < this.lastLoadVersion) {
      return;
    }
    this.lastLoadVersion = frame.loadVersion;
    // The first frame of the latest layout answers the change, whichever request it came back on.
    let changedAtMs: number | undefined;
    if (this.change !== null && frame.configVersion >= this.change.configVersion) {
      changedAtMs = this.change.sentAtMs;
      this.change = null;
    }
    if (askedAtMs === undefined && changedAtMs === undefined) {
      this.listener.frame(frame);
      return;
    }
    this.listener.frame({ ...frame, ...(askedAtMs === undefined ? {} : { requestedAtMs: askedAtMs }), ...(changedAtMs === undefined ? {} : { changedAtMs }) });
  }

  /** @internal Called by the connection when the transport closes: fetches fail and the view reports why. */
  public receiveDisconnect(reason: string): void {
    this.failPending(reason);
    this.inFlight = null;
    this.pending = null;
    this.updateInFlight = null;
    this.updatePending = null;
    this.heldExpansions = [];
    this.closed = true;
    this.listener.error?.(reason);
  }

  /** @internal Called by the connection. */
  public receiveDistinct(result: DistinctValuesResult, requestId: bigint): void {
    const pending = this.lists.get(requestId);
    if (pending === undefined) {
      return;
    }
    this.lists.delete(requestId);
    try {
      pending.resolve({ values: decodeDistinct(result.values), truncated: result.truncated });
    } catch (error: unknown) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** @internal Called by the connection. */
  public receiveMeasure(result: ChartMeasure, requestId: bigint): void {
    const pending = this.measures.get(requestId);
    if (pending === undefined) {
      return;
    }
    this.measures.delete(requestId);
    const { fromX, toX, fromPosition, toPosition, fromValue, toValue, change, percent } = result;
    pending.resolve(result.found ? { fromX, toX, fromPosition, toPosition, fromValue, toValue, change, percent, rows: Number(result.rows) } : null);
  }

  /** @internal Called by the connection. */
  public receiveOpened(opened: ViewOpened): void {
    this.listener.opened?.(opened);
  }

  /** @internal Called by the connection. */
  public receiveStatus(status: TableStatus): void {
    this.listener.status?.(status);
  }

  /** @internal Called by the connection. */
  public receiveError(message: string, requestId: bigint): void {
    const pending = this.fetches.get(requestId) ?? this.lists.get(requestId) ?? this.measures.get(requestId);
    if (pending !== undefined) {
      this.fetches.delete(requestId);
      this.lists.delete(requestId);
      this.measures.delete(requestId);
      pending.reject(new Error(message));
      return;
    }
    this.settle(requestId);
    this.settleChart(requestId);
    // An update the engine refused is answered all the same: the next one may go.
    if (this.updateInFlight?.requestId === requestId) {
      this.releaseUpdate();
    }
    this.listener.error?.(message);
  }
}

/** A protocol connection over one transport. */
export class Connection {
  private nextRequest = 1n;
  private nextView = 1;
  private readonly views = new Map<number, ViewHandle>();
  private readonly errors: ((message: string) => void)[] = [];

  constructor(private readonly transport: Transport) {
    this.send({ case: "hello", value: { protocolVersion: 1 } });
  }

  /** Reports errors not tied to a view. */
  public onError(listener: (message: string) => void): void {
    this.errors.push(listener);
  }

  /** Opens a view of `dataset` with a layout document. */
  public open(dataset: string, layoutJson: string, listener: ViewListener, parameters: Readonly<Record<string, string>> = {}): ViewHandle {
    const id = this.nextView;
    this.nextView += 1;
    const view = new ViewHandle(id, this, listener);
    view.opened(layoutJson);
    this.views.set(id, view);
    this.send({ case: "openView", value: { viewId: id, dataset, layoutJson, parameters: { ...parameters } } });
    return view;
  }

  /** Closes the transport. */
  public close(): void {
    this.transport.close();
  }

  /** @internal Encodes and sends a message, returning its request id. */
  public send(body: ClientBody): bigint {
    const requestId = this.nextRequest;
    this.nextRequest += 1n;
    this.transport.send(toBinary(ClientMessageSchema, create(ClientMessageSchema, { requestId, body })));
    return requestId;
  }

  /** Marks every view disconnected: pending fetches fail and each view reports `reason`. */
  public disconnect(reason: string): void {
    for (const view of [...this.views.values()]) {
      view.receiveDisconnect(reason);
    }
    this.views.clear();
    for (const listener of this.errors) {
      listener(reason);
    }
  }

  /** @internal Forgets a closed view. */
  public forget(id: number): void {
    this.views.delete(id);
  }

  /** Decodes a frame for its view, reporting a frame that fails its checks as that view's error. */
  private receiveFrame(encoded: Frame, requestId: bigint): void {
    const view = this.views.get(encoded.viewId);
    if (view === undefined) {
      return;
    }
    let frame: FrameData;
    try {
      frame = decodeFrame(encoded);
    } catch (error: unknown) {
      view.receiveError(error instanceof FrameError ? error.message : String(error), requestId);
      return;
    }
    view.receiveFrame(frame, requestId);
  }

  /** Decodes a chart frame for its view, reporting one that fails its checks as that view's error. */
  private receiveChartFrame(encoded: ChartFrame, requestId: bigint): void {
    const view = this.views.get(encoded.viewId);
    if (view === undefined) {
      return;
    }
    let frame: ChartFrameData;
    try {
      frame = decodeChartFrame(encoded);
    } catch (error: unknown) {
      view.receiveError(error instanceof FrameError ? error.message : String(error), requestId);
      return;
    }
    view.receiveChartFrame(frame, requestId);
  }

  /** An error for a view goes to it; one for no open view, to every error listener. */
  private receiveError(viewId: number, message: string, requestId: bigint): void {
    const view = this.views.get(viewId);
    if (view === undefined) {
      for (const listener of this.errors) {
        listener(message);
      }
    } else {
      view.receiveError(message, requestId);
    }
  }

  /** Handles one encoded message from the engine. */
  public receive(bytes: Uint8Array): void {
    const message = fromBinary(ServerMessageSchema, bytes);
    const requestId = message.requestId;
    const body = message.body;
    switch (body.case) {
      case "welcome":
        return;
      case "viewOpened":
        this.views.get(body.value.viewId)?.receiveOpened(body.value);
        return;
      case "frame":
        this.receiveFrame(body.value, requestId);
        return;
      case "tableStatus":
        this.views.get(body.value.viewId)?.receiveStatus(body.value);
        return;
      case "error":
        this.receiveError(body.value.viewId, body.value.message, requestId);
        return;
      case "distinctValues":
        this.views.get(body.value.viewId)?.receiveDistinct(body.value, requestId);
        return;
      case "chartFrame":
        this.receiveChartFrame(body.value, requestId);
        return;
      case "chartMeasure":
        this.views.get(body.value.viewId)?.receiveMeasure(body.value, requestId);
        return;
      case undefined:
        return;
    }
  }
}
