import { create, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { decodeChartFrame } from "#frame/chart-frame.ts";
import { ServerMessageSchema } from "#proto/parallax_pb.ts";

import { clock, decoded, emptyFrame, ignore, open, recorded, rows, summary } from "./channel.ts";
import { chartFrame } from "./chart-arrow.ts";

/** The engine's message, encoded. */
function reply(init: MessageInitShape<typeof ServerMessageSchema>): Uint8Array {
  return toBinary(ServerMessageSchema, create(ServerMessageSchema, init));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a connection", () => {
  test("fails pending fetches and tells each view when the transport closes", async () => {
    const { connection, view, errors } = open();
    const fetching = view.fetch(rows(0));
    connection.disconnect("gone");
    await expect(fetching).rejects.toThrow("gone");
    expect([errors, view.isClosed]).toStrictEqual([["gone"], true]);
    await expect(view.fetch(rows(0))).rejects.toThrow("closed");
  });

  test("fails pending fetches when a view closes", async () => {
    const { view } = open();
    const fetching = view.fetch(rows(0));
    view.close();
    await expect(fetching).rejects.toThrow("closed");
  });

  test("opens a view of a dataset alone, with no dataset parameters", () => {
    const { sent } = open();
    const [, opening] = decoded(sent);
    expect(opening?.body.case === "openView" && opening.body.value).toMatchObject({
      dataset: "positions",
      layoutJson: "{}",
      parameters: {},
    });
  });

  test("tells its error listeners of an error for no open view", () => {
    const { connection } = recorded();
    const errors: string[] = [];
    connection.onError((message) => {
      errors.push(message);
    });
    connection.receive(
      reply({
        body: { case: "error", value: { message: "unknown view", viewId: 9 } },
        requestId: 5n,
      }),
    );
    expect(errors).toStrictEqual(["unknown view"]);
  });
});

describe("a view's measurements", () => {
  test("are what the engine wrote", async () => {
    const { connection, sent } = recorded();
    const view = connection.open("prices", "{}", { frame: ignore });
    const asked = view.measure(10, 20);
    const [request] = decoded(sent.slice(-1));
    expect(request?.body.case === "measureChart" && request.body.value).toMatchObject({
      from: 10,
      to: 20,
    });
    const value = {
      change: "10.00",
      found: true,
      fromValue: "100.00",
      percent: "10.00%",
      rows: 10n,
      toValue: "110.00",
      viewId: view.id,
    };
    connection.receive(
      reply({ body: { case: "chartMeasure", value }, requestId: request?.requestId ?? 0n }),
    );
    await expect(asked).resolves.toMatchObject({ change: "10.00", percent: "10.00%", rows: 10 });
  });

  test("are null when the engine found nothing, and fail when the view closes first", async () => {
    const { connection, sent } = recorded();
    const view = connection.open("prices", "{}", { frame: ignore });
    const nothing = view.measure(1, 2);
    const [request] = decoded(sent.slice(-1));
    const value = { found: false, viewId: view.id };
    connection.receive(
      reply({ body: { case: "chartMeasure", value }, requestId: request?.requestId ?? 0n }),
    );
    await expect(nothing).resolves.toBeNull();
    const waiting = view.measure(1, 2);
    view.close();
    await expect(waiting).rejects.toThrow("closed");
  });
});

describe("a view's request timing", () => {
  test("stamps each answered frame with when the grid asked, including time queued behind another", () => {
    const time = clock(1000);
    const { view, frames } = open();
    view.setViewport(rows(0));
    time.set(1010);
    // Asked while the first is in flight: queued, and timed from now.
    view.setViewport(rows(100));
    time.set(1200);
    // Hello was request 1 and opening the view 2, so the viewports are 3 and then 4.
    view.receiveFrame(emptyFrame(), 3n);
    view.receiveFrame(emptyFrame(), 4n);
    // A frame nobody asked for, such as a pushed refresh, has no time.
    view.receiveFrame(emptyFrame(), 99n);
    expect(frames.map((frame) => frame.requestedAtMs)).toStrictEqual([1000, 1010, undefined]);
  });

  test("stamps the first frame of the latest layout with when that change was sent, and drops older ones", () => {
    const time = clock(2000);
    const { view, frames } = open();
    view.update("{}");
    time.set(2005);
    // A second change before the first is answered: only the newer one is timed.
    view.update("{}");
    view.receiveFrame(emptyFrame(1n), 50n);
    view.receiveFrame(emptyFrame(2n), 51n);
    // Later frames of the same layout, such as scrolls, answer no change.
    view.receiveFrame(emptyFrame(2n), 52n);
    expect(frames.map((frame) => [frame.configVersion, frame.changedAtMs])).toStrictEqual([
      [2n, 2005],
      [2n, undefined],
    ]);
  });
});

/** An empty chart frame for a view. */
function answer(viewId: number): ReturnType<typeof decodeChartFrame> {
  return decodeChartFrame(
    chartFrame({ count: new Uint32Array([0]) }, { columns: 1, rows: 1, viewId }),
  );
}

describe("a view's chart windows", () => {
  test("keep one request in flight and send the newest waiting one when it is answered", () => {
    const { view, sent } = open("prices");
    view.setChartWindow({ height: 400, width: 800 });
    view.setChartWindow({ height: 400, width: 800, x: [0, 5] });
    view.setChartWindow({ height: 400, width: 800, x: [0, 6] });
    expect(summary(sent).filter(([kind]) => kind === "chart")).toHaveLength(1);
    // Hello was request 1, opening the view 2, the first window 3.
    view.receiveChartFrame(answer(view.id), 3n);
    expect(decoded(sent).at(-1)?.body.value).toMatchObject({ width: 800, xFrom: 0, xTo: 6 });
  });

  test("stamp each answer with when its window was asked for", () => {
    const time = clock(100);
    const { view, charts } = open("prices");
    view.setChartWindow({ height: 400, width: 800 });
    time.set(120);
    view.setChartWindow({ height: 400, width: 800, x: [0, 6] });
    view.receiveChartFrame(answer(view.id), 3n);
    view.receiveChartFrame(answer(view.id), 4n);
    expect(charts.map((frame) => frame.requestedAtMs)).toStrictEqual([100, 120]);
  });

  test("end where the user ends: back to the window in flight drops the one waiting", () => {
    const { view, sent } = open("prices");
    // Zoom to A, pan to B, pan back to A while A is in flight: the chart ends on A.
    view.setChartWindow({ height: 400, width: 800, x: [1, 2] });
    view.setChartWindow({ height: 400, width: 800, x: [3, 4] });
    view.setChartWindow({ height: 400, width: 800, x: [1, 2] });
    view.receiveChartFrame(answer(view.id), 3n);
    expect(summary(sent).filter(([kind]) => kind === "chart")).toHaveLength(1);
  });
});
