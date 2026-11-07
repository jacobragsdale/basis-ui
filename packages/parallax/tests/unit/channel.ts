/* A connection over a transport that records what it sends, and views that record what they receive, for the view
 * tests. */

import { fromBinary } from "@bufbuild/protobuf";
import { vi } from "vite-plus/test";

import { Connection } from "#engine/connection.ts";
import type { ViewHandle } from "#engine/view.ts";
import type { Viewport } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { FrameData } from "#frame/frame.ts";
import { ClientMessageSchema } from "#proto/parallax_pb.ts";
import type { ClientMessage } from "#proto/parallax_pb.ts";

/** A connection and every message it sent. */
interface Recorded {
  readonly connection: Connection;
  readonly sent: Uint8Array[];
}

/** An open view and what it sent and received. */
interface Opened extends Recorded {
  readonly view: ViewHandle;
  readonly frames: FrameData[];
  readonly charts: ChartFrameData[];
  readonly errors: string[];
}

const firstVersion = 0n;

/** Ignores what it is given. */
function ignore(): void {
  // Nothing to record.
}

function recorded(): Recorded {
  const sent: Uint8Array[] = [];
  const connection = new Connection({
    close: ignore,
    send: (bytes): void => {
      sent.push(bytes);
    },
  });
  return { connection, sent };
}

/** Opens a view of `dataset` that records its frames, chart frames and errors. */
function open(dataset = "positions"): Opened {
  const { connection, sent } = recorded();
  const frames: FrameData[] = [];
  const charts: ChartFrameData[] = [];
  const errors: string[] = [];
  const view = connection.open(dataset, "{}", {
    chart: (frame) => {
      charts.push(frame);
    },
    error: (message) => {
      errors.push(message);
    },
    frame: (frame) => {
      frames.push(frame);
    },
  });
  return { charts, connection, errors, frames, sent, view };
}

/** The messages sent, decoded. */
function decoded(sent: readonly Uint8Array[]): readonly ClientMessage[] {
  return sent.map((bytes) => fromBinary(ClientMessageSchema, bytes));
}

/** What a view sent after hello and opening, in short: each message's kind and what tells it apart. */
function summary(sent: readonly Uint8Array[]): readonly (readonly unknown[])[] {
  return decoded(sent.slice(2)).map(({ body }): readonly unknown[] => {
    if (body.case === "updateView") {
      const { configVersion, layoutJson, viewport } = body.value;
      return [
        "update",
        layoutJson,
        configVersion,
        viewport === undefined ? null : Number(viewport.firstRow),
      ];
    }
    if (body.case === "setViewport") {
      return ["viewport", Number(body.value.firstRow)];
    }
    if (body.case === "setExpanded") {
      return ["expand", body.value.pathJson, body.value.expanded];
    }
    if (body.case === "setChartWindow") {
      return ["chart", body.value.width];
    }
    return [body.case];
  });
}

/** An empty frame of a configuration version, as a view receives it. */
function emptyFrame(configVersion = firstVersion): FrameData {
  return {
    columns: [],
    configVersion,
    firstColumn: 0,
    firstRow: 0,
    groups: [],
    loadVersion: 1n,
    pushed: false,
    rowCount: 0,
    sourceAsOfMicros: 0n,
    totalColumns: 0,
    totalRows: 0,
    totals: null,
    tree: null,
    viewId: 1,
  };
}

/** A window of 50 rows and 5 columns from `firstRow`. */
function rows(firstRow: number): Viewport {
  return { columnCount: 5, firstColumn: 0, firstRow, rowCount: 50 };
}

/** Holds `performance.now()` at `start`, until the test moves it. */
function clock(start: number): { readonly set: (ms: number) => void } {
  let now = start;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    set: (ms): void => {
      now = ms;
    },
  };
}

export { clock, decoded, emptyFrame, ignore, open, recorded, rows, summary };
