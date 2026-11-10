import { describe, expect, test, vi } from "vite-plus/test";

import { exportTypes, maxArrowBytes, maxRows, maxXlsxCells, trapReason } from "#engine/limits.ts";

import { bytesOf, engineWithWorker, openView, refusal } from "./fake-worker.ts";

const layout = '{"version":1,"dataset":"positions"}';

describe("the engine's worker", () => {
  test("carries protocol messages both ways", () => {
    const { engine, worker } = engineWithWorker();
    // The connection says hello through the worker.
    expect(worker.posted[0]).toMatchObject({ kind: "message" });
    const errors = openView(engine, "positions");
    expect(worker.sent("message")).toHaveLength(2);
    worker.answer({ bytes: refusal(1, "unknown dataset positions"), kind: "reply" });
    expect(errors).toStrictEqual(["unknown dataset positions"]);
  });

  test.each([
    { kind: "fatal", message: "the parallax engine did not start" },
    { bytes: "not bytes", kind: "reply" },
  ])(
    "stops on a fatal error or a message it does not know, failing every load and view: %j",
    async (bad) => {
      const { engine, worker, workers } = engineWithWorker();
      const errors = openView(engine, "positions");
      const pending = engine.load("positions", new ArrayBuffer(8));
      worker.answer(bad);
      await expect(pending).rejects.toThrow();
      await expect(engine.load("trades", new ArrayBuffer(8))).rejects.toThrow();
      expect(errors).toHaveLength(1);
      // The worker ends, releasing the tables it held, and is not replaced: it would fail again.
      expect([worker.terminated, workers.all.length]).toStrictEqual([true, 1]);
    },
  );

  test("fails every load when the worker script does not start", async () => {
    const { engine, worker } = engineWithWorker();
    const pending = engine.load("positions", new ArrayBuffer(8));
    worker.crash("Failed to fetch a worker script");
    await expect(pending).rejects.toThrow(/did not start.*Failed to fetch a worker script/u);
    expect(worker.terminated).toBe(true);
  });

  test("closes for good when the page asks, failing what waits", async () => {
    const { engine, worker } = engineWithWorker();
    const errors = openView(engine, "positions");
    const pending = engine.load("positions", new ArrayBuffer(8));
    engine.close();
    await expect(pending).rejects.toThrow("closed");
    expect([errors, worker.terminated]).toStrictEqual([
      ["Parallax was closed in this page."],
      true,
    ]);
  });
});

describe("the engine's loads", () => {
  test("move the app's bytes to the worker with the row limit, and answer with the rows", async () => {
    const { engine, worker } = engineWithWorker();
    const bytes = new ArrayBuffer(64);
    const loaded = engine.load("positions", bytes, { primaryKey: "id", receivedAtMicros: 5000 });
    const [message] = worker.sent("load");
    expect(message).toStrictEqual({
      bytes,
      dataset: "positions",
      expectedBytes: null,
      id: 1,
      kind: "load",
      maxRows,
      nowMicros: 5000,
      primaryKey: "id",
      sourceAsOfMicros: null,
    });
    // The buffer is in the transfer list, so it moves rather than being copied.
    expect(worker.transferred.at(-1)).toStrictEqual([bytes]);
    worker.answer({ id: 1, kind: "loaded", rows: 1234 });
    await expect(loaded).resolves.toStrictEqual({ dataset: "positions", rows: 1234 });
  });

  test("say which datasets the engine holds", async () => {
    const { engine, worker } = engineWithWorker();
    const loaded = engine.load("positions", new ArrayBuffer(8));
    worker.answer({ id: 1, kind: "loaded", rows: 3 });
    await loaded;
    await expect(engine.holds("positions")).resolves.toBe(true);
    await expect(engine.holds("trades")).resolves.toBe(false);
    await expect(engine.connectionFor("trades")).rejects.toThrow(
      "trades is not loaded in this page; load it with useDataset before opening a view of it.",
    );
  });

  test("pass a source time the app gives, which wins over the stream's", () => {
    const { engine, worker } = engineWithWorker();
    engine.load("positions", new ArrayBuffer(8), { sourceAsOfMicros: 900 }).catch(() => null);
    expect(worker.sent("load")[0]).toMatchObject({ primaryKey: null, sourceAsOfMicros: 900 });
  });

  test("refuse bytes past the limit before posting them, naming the limit and the size", async () => {
    const { engine, worker } = engineWithWorker();
    const tooBig = new ArrayBuffer(maxArrowBytes + 1);
    await expect(engine.load("positions", tooBig)).rejects.toThrow(
      "positions is 70000001 bytes of Arrow, more than the 70000000 a table in the browser holds; have its API filter or aggregate the data to fit.",
    );
    expect(worker.sent("load")).toHaveLength(0);
    // The buffer stays the app's.
    expect(tooBig.byteLength).toBe(maxArrowBytes + 1);
    // At the limit, it goes.
    engine.load("positions", new ArrayBuffer(maxArrowBytes)).catch(() => null);
    expect(worker.sent("load")).toHaveLength(1);
  });

  test("report the engine's refusal, such as too many rows", async () => {
    const { engine, worker } = engineWithWorker();
    const refused = engine.load("positions", new ArrayBuffer(8));
    worker.answer({
      id: 1,
      kind: "failed",
      message: "positions has 150001 rows, more than the 150000 a table in the browser holds",
    });
    await expect(refused).rejects.toThrow("150001 rows");
    await expect(engine.holds("positions")).resolves.toBe(false);
  });

  test("keep the table an earlier load left when a reload is refused", async () => {
    const { engine, worker } = engineWithWorker();
    engine.load("positions", new ArrayBuffer(8)).catch(() => null);
    worker.answer({ id: 1, kind: "loaded", rows: 10 });
    const reload = engine.load("positions", new ArrayBuffer(8));
    worker.answer({ id: 2, kind: "failed", message: "too many rows" });
    await expect(reload).rejects.toThrow("too many rows");
    await expect(engine.holds("positions")).resolves.toBe(true);
  });

  test("place a view by a load still in flight, waiting for its answer and saying why it failed", async () => {
    const { engine, worker } = engineWithWorker();
    const placed = Promise.all([
      engine.load("positions", new ArrayBuffer(8)),
      engine.holds("positions"),
    ]);
    worker.answer({ id: 1, kind: "loaded", rows: 3 });
    await expect(placed).resolves.toStrictEqual([{ dataset: "positions", rows: 3 }, true]);
    const failing = engine.load("trades", new ArrayBuffer(8));
    const waiting = engine.holds("trades");
    worker.answer({ id: 2, kind: "failed", message: "trades: the stream ends inside a message" });
    await expect(failing).rejects.toThrow();
    await expect(waiting).rejects.toThrow("the stream ends inside a message");
  });
});

describe("the engine's loads of bytes still arriving", () => {
  test("count as in flight from the call, so a view that opens first waits for the bytes and the load", async () => {
    const { engine, worker } = engineWithWorker();
    const bytes = new ArrayBuffer(8);
    const { promise: arriving, resolve: arrive } = Promise.withResolvers<ArrayBuffer>();
    const loading = Promise.all([engine.load("positions", arriving), engine.holds("positions")]);
    expect(worker.sent("load")).toStrictEqual([]);
    arrive(bytes);
    await vi.waitFor(() => {
      expect(worker.sent("load")).toMatchObject([{ bytes, dataset: "positions", id: 1 }]);
    });
    worker.answer({ id: 1, kind: "loaded", rows: 4 });
    await expect(loading).resolves.toStrictEqual([{ dataset: "positions", rows: 4 }, true]);
  });

  test("fail the views waiting with the fetch's reason", async () => {
    const { engine } = engineWithWorker();
    const failing = engine.load("positions", Promise.reject(new Error("the API answered 503")));
    await expect(engine.holds("positions")).rejects.toThrow("the API answered 503");
    await expect(failing).rejects.toThrow("the API answered 503");
  });

  test("check the bytes against the limit when they arrive", async () => {
    const { engine, worker } = engineWithWorker();
    const big = engine.load("trades", Promise.resolve(new ArrayBuffer(maxArrowBytes + 1)));
    await expect(engine.holds("trades")).rejects.toThrow(
      `more than the ${String(maxArrowBytes)} a table in the browser holds`,
    );
    await expect(big).rejects.toThrow();
    expect(worker.sent("load")).toStrictEqual([]);
  });
});

describe("the engine's traps", () => {
  const reason = trapReason("RuntimeError: unreachable");

  test("end the trapped worker, failing everything waiting and every view with the reason", async () => {
    const { engine, worker } = engineWithWorker();
    const restarts: string[] = [];
    engine.onRestart((given) => {
      restarts.push(given);
    });
    const errors = openView(engine, "small");
    const big = engine.load("big", new ArrayBuffer(8));
    const exporting = engine.export(layout, "csv");
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    await expect(big).rejects.toThrow(reason);
    await expect(exporting).rejects.toThrow(reason);
    expect([errors, restarts, worker.terminated]).toStrictEqual([[reason], [reason], true]);
  });

  test("start a new worker without the tables, and hear the old one no more", async () => {
    const { engine, worker, workers } = engineWithWorker();
    engine.load("small", new ArrayBuffer(8)).catch(() => null);
    worker.answer({ id: 1, kind: "loaded", rows: 1 });
    const before = engine.connection;
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    // A new connection that has said hello; the tables went with the old worker.
    expect([
      workers.all.length,
      engine.connection === before,
      workers.current().sent("message").length,
    ]).toStrictEqual([2, false, 1]);
    await expect(engine.holds("small")).resolves.toBe(false);
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    expect(workers.all).toHaveLength(2);
  });

  test("leave the new worker to load again", async () => {
    const { engine, worker, workers } = engineWithWorker();
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    const again = engine.load("small", new ArrayBuffer(8));
    const [message] = workers.current().sent("load");
    workers.current().answer({ id: message?.id, kind: "loaded", rows: 1 });
    await expect(again).resolves.toStrictEqual({ dataset: "small", rows: 1 });
    await expect(engine.holds("small")).resolves.toBe(true);
  });

  test("stop telling a listener that stopped listening", () => {
    const { engine, worker } = engineWithWorker();
    const restarts: string[] = [];
    const stop = engine.onRestart((given) => {
      restarts.push(given);
    });
    stop();
    worker.answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    expect(restarts).toStrictEqual([]);
  });
});

describe("the engine's exports", () => {
  test("ask the worker for an xlsx within the cell cap, and return its bytes as a file", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export(layout, "xlsx", 3n);
    expect(worker.sent("export")[0]).toStrictEqual({
      format: "xlsx",
      id: 1,
      kind: "export",
      layout,
      loadVersion: 3,
      maxCells: maxXlsxCells,
    });
    worker.answer({ bytes: bytesOf("PK workbook"), id: 1, kind: "exported" });
    const blob = await file;
    expect(blob.type).toBe(exportTypes.xlsx);
    await expect(blob.text()).resolves.toBe("PK workbook");
  });

  test("join a CSV's chunks into one file as they arrive", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export(layout, "csv");
    expect(worker.sent("export")[0]).toMatchObject({ format: "csv", loadVersion: null });
    for (const chunk of ["id,fund\n", "1,A\n", "2,B\n"]) {
      worker.answer({ bytes: bytesOf(chunk), id: 1, kind: "chunk" });
    }
    worker.answer({ bytes: null, id: 1, kind: "exported" });
    const blob = await file;
    expect(blob.type).toBe(exportTypes.csv);
    await expect(blob.text()).resolves.toBe("id,fund\n1,A\n2,B\n");
  });

  test("pass the engine's refusal on, such as an xlsx past the cell cap", async () => {
    const { engine, worker } = engineWithWorker();
    const file = engine.export(layout, "xlsx");
    worker.answer({
      id: 1,
      kind: "failed",
      message:
        "the view has 4000000 cells, more than the 1000000 an Excel export here holds; export it as CSV instead",
    });
    await expect(file).rejects.toThrow("export it as CSV instead");
  });
});
