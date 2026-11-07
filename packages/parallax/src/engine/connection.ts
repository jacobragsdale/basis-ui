/* The protocol client, independent of any framework. One connection carries every view over one transport, the
 * messages to and from the worker that hosts the WebAssembly engine; `view.ts` keeps each view's rules. */

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { decodeChartFrame } from "#frame/chart-frame.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import { decodeFrame } from "#frame/frame.ts";
import type { FrameData } from "#frame/frame.ts";
import { FrameError } from "#frame/readers.ts";
import { ClientMessageSchema, ServerMessageSchema } from "#proto/parallax_pb.ts";
import type { ChartFrame, Frame, ServerMessage } from "#proto/parallax_pb.ts";

import { ViewHandle } from "./view.ts";
import type { ClientBody, ViewChannel, ViewListener } from "./view-types.ts";

/** What the engine sends a view besides its frames and errors. */
type ViewBody = Extract<
  ServerMessage["body"],
  { readonly case: "viewOpened" | "tableStatus" | "distinctValues" | "chartMeasure" }
>;

const protocolVersion = 1;
const firstRequest = 1n;

/** Moves encoded messages between the client and an engine. */
interface Transport {
  readonly send: (bytes: Uint8Array) => void;
  readonly close: () => void;
}

/** A frame decoded, or the reason it was refused. */
type Decoded<TFrame> =
  | { readonly ok: true; readonly frame: TFrame }
  | { readonly ok: false; readonly reason: string };

/** Decodes a frame, turning a frame that fails its checks into the reason. */
function decoded<TEncoded, TFrame>(
  decode: (encoded: TEncoded) => TFrame,
  encoded: TEncoded,
): Decoded<TFrame> {
  try {
    return { frame: decode(encoded), ok: true };
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof FrameError ? error.message : String(error) };
  }
}

/** A protocol connection over one transport. */
class Connection implements ViewChannel {
  readonly #transport: Transport;
  readonly #views = new Map<number, ViewHandle>();
  readonly #errors: ((message: string) => void)[] = [];
  #nextRequest = firstRequest;
  #nextView = 1;

  public constructor(transport: Transport) {
    this.#transport = transport;
    this.send({ case: "hello", value: { protocolVersion } });
  }

  /** Reports errors not tied to a view. */
  public onError(listener: (message: string) => void): void {
    this.#errors.push(listener);
  }

  /** Opens a view of `dataset` with a layout document. */
  public open(dataset: string, layoutJson: string, listener: ViewListener): ViewHandle {
    const id = this.#nextView;
    this.#nextView += 1;
    const view = new ViewHandle(id, this, listener);
    view.opened(layoutJson);
    this.#views.set(id, view);
    this.send({ case: "openView", value: { dataset, layoutJson, viewId: id } });
    return view;
  }

  /** Closes the transport. */
  public close(): void {
    this.#transport.close();
  }

  /** @internal Encodes and sends a message, returning its request id. */
  public readonly send = (body: ClientBody): bigint => {
    const requestId = this.#nextRequest;
    this.#nextRequest += 1n;
    this.#transport.send(
      toBinary(ClientMessageSchema, create(ClientMessageSchema, { body, requestId })),
    );
    return requestId;
  };

  /** @internal Forgets a closed view. */
  public readonly forget = (viewId: number): void => {
    this.#views.delete(viewId);
  };

  /** Marks every view disconnected: their requests fail and each view reports `reason`. */
  public disconnect(reason: string): void {
    const views = [...this.#views.values()];
    this.#views.clear();
    for (const view of views) {
      view.receiveDisconnect(reason);
    }
    for (const listener of this.#errors) {
      listener(reason);
    }
  }

  /** Handles one encoded message from the engine. */
  public receive(bytes: Uint8Array): void {
    const { requestId, body } = fromBinary(ServerMessageSchema, bytes);
    if (body.case === "frame") {
      this.#receiveFrame(body.value, requestId);
    } else if (body.case === "chartFrame") {
      this.#receiveChartFrame(body.value, requestId);
    } else if (body.case === "error") {
      this.#receiveError(body.value.viewId, body.value.message, requestId);
    } else if (body.case !== undefined && body.case !== "welcome") {
      this.#receiveForView(body, requestId);
    }
  }

  /** Hands a view what the engine answered for it. */
  #receiveForView(body: ViewBody, requestId: bigint): void {
    const view = this.#views.get(body.value.viewId);
    if (body.case === "viewOpened") {
      view?.receiveOpened(body.value);
    } else if (body.case === "tableStatus") {
      view?.receiveStatus(body.value);
    } else if (body.case === "distinctValues") {
      view?.receiveDistinct(body.value, requestId);
    } else {
      view?.receiveMeasure(body.value, requestId);
    }
  }

  /** Decodes a frame for its view, reporting a frame that fails its checks as that view's error. */
  #receiveFrame(encoded: Frame, requestId: bigint): void {
    const view = this.#views.get(encoded.viewId);
    if (view === undefined) {
      return;
    }
    const result = decoded<Frame, FrameData>(decodeFrame, encoded);
    if (result.ok) {
      view.receiveFrame(result.frame, requestId);
    } else {
      view.receiveError(result.reason, requestId);
    }
  }

  /** Decodes a chart frame for its view, reporting one that fails its checks as that view's error. */
  #receiveChartFrame(encoded: ChartFrame, requestId: bigint): void {
    const view = this.#views.get(encoded.viewId);
    if (view === undefined) {
      return;
    }
    const result = decoded<ChartFrame, ChartFrameData>(decodeChartFrame, encoded);
    if (result.ok) {
      view.receiveChartFrame(result.frame, requestId);
    } else {
      view.receiveError(result.reason, requestId);
    }
  }

  /** An error for a view goes to it; one for no open view, to every error listener. */
  #receiveError(viewId: number, message: string, requestId: bigint): void {
    const view = this.#views.get(viewId);
    if (view !== undefined) {
      view.receiveError(message, requestId);
      return;
    }
    for (const listener of this.#errors) {
      listener(message);
    }
  }
}

export { Connection };
export type { Transport };
