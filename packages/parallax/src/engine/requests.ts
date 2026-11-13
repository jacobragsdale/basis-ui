/* A view's one-off requests, each answered once by its request id: a window fetched for copying, a filter's values,
 * and a chart's measurement. */

import { decodeDistinct } from "#frame/distinct.ts";
import type { FrameData } from "#frame/frame.ts";
import type { ChartMeasure, DistinctValuesResult } from "#proto/parallax_pb.ts";

import { Requests } from "./pending.ts";
import { gridWindow } from "./view-types.ts";
import type { DistinctValues, Measurement, ViewChannel, Viewport } from "./view-types.ts";

function measurement(result: ChartMeasure): Measurement | null {
  if (!result.found) {
    return null;
  }
  const { fromX, toX, fromPosition, toPosition, fromValue, toValue, change, percent } = result;
  const rows = Number(result.rows);
  return { change, fromPosition, fromValue, fromX, percent, rows, toPosition, toValue, toX };
}

/** One view's one-off requests. */
class ViewRequests {
  readonly #viewId: number;
  readonly #channel: ViewChannel;
  readonly #fetches = new Requests<FrameData>();
  readonly #lists = new Requests<DistinctValues>();
  readonly #measures = new Requests<Measurement | null>();

  public constructor(viewId: number, channel: ViewChannel) {
    this.#viewId = viewId;
    this.#channel = channel;
  }

  public async fetch(viewport: Viewport): Promise<FrameData> {
    const value = { viewId: this.#viewId, ...gridWindow(viewport) };
    return this.#fetches.ask(() => this.#channel.send({ case: "fetchWindow", value }));
  }

  public async distinctValues(
    column: string,
    search: string,
    limit: number,
  ): Promise<DistinctValues> {
    const value = { column, limit, search, viewId: this.#viewId };
    return this.#lists.ask(() => this.#channel.send({ case: "distinctValues", value }));
  }

  public async measure(
    from: number,
    to: number,
    { series, y }: { readonly series: string; readonly y: string },
  ): Promise<Measurement | null> {
    const value = { from, series, to, viewId: this.#viewId, y };
    return this.#measures.ask(() => this.#channel.send({ case: "measureChart", value }));
  }

  /** Whether `requestId` is a fetch, whose frame answers it rather than being drawn. */
  public fetching(requestId: bigint): boolean {
    return this.#fetches.has(requestId);
  }

  public fetched(requestId: bigint, frame: FrameData): void {
    this.#fetches.resolve(requestId, frame);
  }

  public listed(requestId: bigint, result: DistinctValuesResult): void {
    if (!this.#lists.has(requestId)) {
      return;
    }
    try {
      this.#lists.resolve(requestId, {
        truncated: result.truncated,
        values: decodeDistinct(result.values),
      });
    } catch (error: unknown) {
      this.#lists.reject(requestId, error instanceof Error ? error : new Error(String(error)));
    }
  }

  public measured(requestId: bigint, result: ChartMeasure): void {
    this.#measures.resolve(requestId, measurement(result));
  }

  /** Fails request `requestId` with the engine's refusal, and says whether it was one of these. */
  public refused(requestId: bigint, message: string): boolean {
    const error = new Error(message);
    return (
      this.#fetches.reject(requestId, error) ||
      this.#lists.reject(requestId, error) ||
      this.#measures.reject(requestId, error)
    );
  }

  /** Fails every request still waiting. */
  public failAll(reason: string): void {
    this.#fetches.failAll(reason);
    this.#lists.failAll(reason);
    this.#measures.failAll(reason);
  }
}

export { ViewRequests };
