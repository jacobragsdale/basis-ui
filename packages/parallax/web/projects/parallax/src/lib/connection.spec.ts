import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";

import { Connection } from "./connection";
import type { Viewport } from "./connection";
import type { FrameData } from "./frame";
import { ClientMessageSchema, ServerMessageSchema } from "./proto/parallax_pb";

function connection(): { readonly connection: Connection; readonly sent: Uint8Array[] } {
  const sent: Uint8Array[] = [];
  const c = new Connection({
    send: (bytes) => {
      sent.push(bytes);
    },
    close: () => undefined
  });
  return { connection: c, sent };
}

describe("Connection", () => {
  it("fails pending fetches and tells each view when the transport closes", async () => {
    const { connection: c, sent } = connection();
    const errors: string[] = [];
    const view = c.open("positions", "{}", {
      frame: () => undefined,
      error: (m) => {
        errors.push(m);
      }
    });
    const fetch = view.fetch({ firstRow: 0, rowCount: 10, firstColumn: 0, columnCount: 2 });
    expect(sent.length).toBe(3);
    c.disconnect("gone");
    await expect(fetch).rejects.toThrow("gone");
    expect(errors).toEqual(["gone"]);
    expect(view.isClosed).toBe(true);
    await expect(view.fetch({ firstRow: 0, rowCount: 1, firstColumn: 0, columnCount: 1 })).rejects.toThrow("closed");
  });

  it("fails pending fetches when a view closes", async () => {
    const { connection: c } = connection();
    const view = c.open("positions", "{}", { frame: () => undefined });
    const fetch = view.fetch({ firstRow: 0, rowCount: 10, firstColumn: 0, columnCount: 2 });
    view.close();
    await expect(fetch).rejects.toThrow("closed");
  });
});

describe("ViewHandle.measure", () => {
  it("asks the engine to measure and answers with what it wrote, or null when it found nothing", async () => {
    const { connection: c, sent } = connection();
    const view = c.open("prices", "{}", { frame: () => undefined });
    const asked = view.measure(10, 20);
    const request = fromBinary(ClientMessageSchema, sent.at(-1) ?? new Uint8Array());
    expect(request.body.case === "measureChart" && [request.body.value.from, request.body.value.to]).toEqual([10, 20]);
    const reply = (found: boolean): Uint8Array =>
      toBinary(
        ServerMessageSchema,
        create(ServerMessageSchema, {
          requestId: request.requestId,
          body: {
            case: "chartMeasure",
            value: { viewId: view.id, found, fromX: "2016-01-19", toX: "2016-02-02", fromValue: "100.00", toValue: "110.00", change: "10.00", percent: "10.00%", rows: 10n }
          }
        })
      );
    c.receive(reply(true));
    await expect(asked).resolves.toMatchObject({ change: "10.00", percent: "10.00%", rows: 10 });
    const nothing = view.measure(1, 2);
    const second = fromBinary(ClientMessageSchema, sent.at(-1) ?? new Uint8Array());
    c.receive(toBinary(ServerMessageSchema, create(ServerMessageSchema, { requestId: second.requestId, body: { case: "chartMeasure", value: { viewId: view.id, found: false } } })));
    await expect(nothing).resolves.toBeNull();
    // A measurement still waiting when the view closes fails.
    const waiting = view.measure(1, 2);
    view.close();
    await expect(waiting).rejects.toThrow("closed");
  });
});

describe("ViewHandle request timing", () => {
  const frame = (configVersion = 0n): FrameData => ({
    viewId: 1,
    configVersion,
    loadVersion: 1n,
    firstRow: 0,
    firstColumn: 0,
    rowCount: 0,
    totalRows: 0,
    totalColumns: 0,
    sourceAsOfMicros: 0n,
    pushed: false,
    columns: [],
    groups: [],
    tree: null,
    totals: null
  });

  it("stamps each answered frame with when the grid asked, including time queued behind another request", () => {
    let now = 1_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const { connection: c } = connection();
    const seen: FrameData[] = [];
    const view = c.open("positions", "{}", {
      frame: (f) => {
        seen.push(f);
      }
    });
    view.setViewport({ firstRow: 0, rowCount: 50, firstColumn: 0, columnCount: 5 });
    now = 1_010;
    // Asked while the first is in flight: queued, and timed from now.
    view.setViewport({ firstRow: 100, rowCount: 50, firstColumn: 0, columnCount: 5 });
    now = 1_200;
    // Hello was request 1 and opening the view 2, so the viewports are 3 and then 4.
    view.receiveFrame(frame(), 3n);
    view.receiveFrame(frame(), 4n);
    // A frame nobody asked for, such as a pushed refresh, has no time.
    view.receiveFrame(frame(), 99n);
    expect(seen.map((f) => f.requestedAtMs)).toEqual([1_000, 1_010, undefined]);
    clock.mockRestore();
  });

  it("stamps the first frame of the latest layout with when that change was sent, and drops frames of older ones", () => {
    let now = 2_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const { connection: c } = connection();
    const seen: FrameData[] = [];
    const view = c.open("positions", "{}", {
      frame: (f) => {
        seen.push(f);
      }
    });
    view.update("{}");
    now = 2_005;
    // A second change before the first is answered: only the newer one is timed.
    view.update("{}");
    now = 2_050;
    view.receiveFrame(frame(1n), 50n);
    view.receiveFrame(frame(2n), 51n);
    // Later frames of the same layout, such as scrolls, answer no change.
    view.receiveFrame(frame(2n), 52n);
    expect(seen.map((f) => [f.configVersion, f.changedAtMs])).toEqual([
      [2n, 2_005],
      [2n, undefined]
    ]);
    clock.mockRestore();
  });
});

describe("ViewHandle updates", () => {
  const frame = (configVersion: bigint): FrameData => ({
    viewId: 1,
    configVersion,
    loadVersion: 1n,
    firstRow: 0,
    firstColumn: 0,
    rowCount: 0,
    totalRows: 0,
    totalColumns: 0,
    sourceAsOfMicros: 0n,
    pushed: false,
    columns: [],
    groups: [],
    tree: null,
    totals: null
  });

  /** The messages sent after hello and opening the view, decoded. */
  const decoded = (sent: readonly Uint8Array[]): ReturnType<typeof fromBinary<typeof ClientMessageSchema>>[] => sent.slice(2).map((bytes) => fromBinary(ClientMessageSchema, bytes));

  const summary = (sent: readonly Uint8Array[]): unknown[] =>
    decoded(sent).map(({ body }) => {
      if (body.case === "updateView") {
        return ["update", body.value.layoutJson, body.value.configVersion, body.value.viewport === undefined ? null : Number(body.value.viewport.firstRow)];
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

  const window = (firstRow: number): Viewport => ({ firstRow, rowCount: 50, firstColumn: 0, columnCount: 5 });

  it("sends one update at a time, and only the newest of those asked for meanwhile", () => {
    let now = 3_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const { connection: c, sent } = connection();
    const seen: FrameData[] = [];
    const view = c.open("positions", "{}", {
      frame: (f) => {
        seen.push(f);
      }
    });
    const visible = (): Viewport => window(0);
    view.update("a", visible);
    now = 3_010;
    view.update("b", visible);
    now = 3_020;
    view.update("c", visible);
    expect(summary(sent)).toEqual([["update", "a", 1n, 0]]);
    now = 3_100;
    // The answer to "a" lets "c" go, and is not drawn, as a newer layout is on its way.
    view.receiveFrame(frame(1n), 3n);
    expect(summary(sent)).toEqual([
      ["update", "a", 1n, 0],
      ["update", "c", 2n, 0]
    ]);
    view.receiveFrame(frame(2n), 4n);
    // Timed from when "c" was asked for.
    expect(seen.map((f) => [f.configVersion, f.changedAtMs])).toEqual([[2n, 3_020]]);
    clock.mockRestore();
  });

  it("carries the newest window, and sends what was asked for meanwhile after the update", () => {
    const { connection: c, sent } = connection();
    const view = c.open("positions", "{}", { frame: () => undefined });
    let visible = window(0);
    view.update("a", () => visible);
    expect(view.requested()).toEqual(window(0));
    view.update("b", () => visible);
    // Waiting behind "b", so that they apply to its layout.
    view.setViewport(window(200));
    view.setExpanded(["Atlas"], true);
    view.setChartWindow({ width: 300, height: 100 });
    expect(summary(sent)).toEqual([["update", "a", 1n, 0]]);
    visible = window(300);
    view.receiveFrame(frame(1n), 3n);
    // The window is read when "b" goes, so it is the newest, and the viewport waiting is dropped.
    expect(summary(sent)).toEqual([
      ["update", "a", 1n, 0],
      ["update", "b", 2n, 300],
      ["expand", '["Atlas"]', true],
      ["chart", 300]
    ]);
    expect(view.requested()).toEqual(window(300));
    // The same window again is already asked for.
    view.setViewport(window(300));
    expect(sent.length).toBe(6);
  });

  it("lets the next update go when the engine refuses one", () => {
    const { connection: c, sent } = connection();
    const errors: string[] = [];
    const view = c.open("positions", "{}", {
      frame: () => undefined,
      error: (m) => {
        errors.push(m);
      }
    });
    view.update("bad", () => window(0));
    view.update("good", () => window(0));
    view.receiveError("no such column", 3n);
    expect(errors).toEqual(["no such column"]);
    expect(summary(sent)).toEqual([
      ["update", "bad", 1n, 0],
      ["update", "good", 2n, 0]
    ]);
  });

  it("sends an update without a window at once, as the engine may have nothing to answer it with", () => {
    const { connection: c, sent } = connection();
    const view = c.open("prices", "{}", { frame: () => undefined });
    // A chart not yet asked for a window: neither update is answered, and neither waits.
    view.update("a");
    view.update("b");
    view.setChartWindow({ width: 300, height: 100 });
    // A window the caller cannot give yet is no window.
    view.update("c", () => null);
    view.setExpanded(["Atlas"], true);
    expect(summary(sent)).toEqual([
      ["update", "a", 1n, null],
      ["update", "b", 2n, null],
      ["chart", 300],
      ["update", "c", 3n, null],
      ["expand", '["Atlas"]', true]
    ]);
  });

  it("sends expansions at once while an update is in flight but none waits, and viewports once its window is answered", () => {
    const { connection: c, sent } = connection();
    const view = c.open("positions", "{}", { frame: () => undefined });
    view.update("a", () => window(0));
    view.setViewport(window(100));
    view.setExpanded(["Atlas"], false);
    expect(summary(sent)).toEqual([
      ["update", "a", 1n, 0],
      ["expand", '["Atlas"]', false]
    ]);
    view.receiveFrame(frame(1n), 3n);
    expect(summary(sent).at(-1)).toEqual(["viewport", 100]);
  });
});
