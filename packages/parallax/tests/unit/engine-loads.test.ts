/* The engine's loads of a response's body, which moves to the worker as a stream, and their progress: a first load's
 * views open on its first rows, and a reload's wait for it whole. */

import { describe, expect, test, vi } from "vite-plus/test";

import { liftedLimitsKey, maxArrowBytes } from "#engine/limits.ts";

import { engineWithWorker } from "./fake-worker.ts";

/** A response whose body sends `chunks` and then ends, or, with none, never sends anything, with its length when
 * `length` is given, and whether the engine cancelled it. */
function bodyFed(
  length: number | null,
  chunks: readonly Uint8Array[] = [],
): { readonly response: Response; readonly cancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel: (): void => {
      cancelled = true;
    },
    start: (controller): void => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (chunks.length > 0) {
        controller.close();
      }
    },
  });
  const headers = length === null ? {} : { "content-length": String(length) };
  return { cancelled: () => cancelled, response: new Response(body, { headers }) };
}

describe("the engine's loads of a response's body", () => {
  test("post the body chunk by chunk as it arrives, each chunk's buffer moved, then its end", async () => {
    const { engine, worker } = engineWithWorker();
    const chunks = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5, 6)];
    const loaded = engine.load("positions", bodyFed(6, chunks).response);
    await vi.waitFor(() => {
      expect(worker.sent("load-end")).toStrictEqual([{ error: null, id: 1, kind: "load-end" }]);
    });
    expect(worker.sent("load")).toMatchObject([{ bytes: null, expectedBytes: 6, id: 1 }]);
    const posted = worker.sent("load-bytes");
    expect(posted.map((chunk) => [...new Uint8Array(chunk.bytes)])).toStrictEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    // Each chunk's buffer moves with its message.
    expect(worker.transferred.filter((moved) => moved.length > 0).slice(-2)).toStrictEqual(
      posted.map((chunk) => [chunk.bytes]),
    );
    worker.answer({ id: 1, kind: "loaded", rows: 2 });
    await expect(loaded).resolves.toStrictEqual({ dataset: "positions", rows: 2 });
  });

  test("refuse a body that passes the limit as it streams, without saying its length first", async () => {
    Reflect.set(globalThis, liftedLimitsKey, { maxArrowBytes: 4, maxRows: 10 });
    const { engine, worker } = engineWithWorker();
    const body = bodyFed(null, [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)]);
    const loaded = engine.load("positions", body.response);
    await vi.waitFor(() => {
      expect(worker.sent("load-end")).toHaveLength(1);
    });
    Reflect.deleteProperty(globalThis, liftedLimitsKey);
    const [end] = worker.sent("load-end");
    expect(end?.error).toBe(
      "positions is more than the 4 bytes of Arrow a table in the browser holds; have its API filter or aggregate the data to fit.",
    );
    worker.answer({ id: 1, kind: "failed", message: end?.error ?? "" });
    await expect(loaded).rejects.toThrow("more than the 4 bytes");
  });

  test("stop reading the body once the worker has refused the load", async () => {
    const { engine, worker } = engineWithWorker();
    const body = bodyFed(null);
    const loaded = engine.load("positions", body.response);
    await vi.waitFor(() => {
      expect(worker.sent("load")).toHaveLength(1);
    });
    worker.answer({ id: 1, kind: "failed", message: "positions: the stream is not Arrow" });
    await expect(loaded).rejects.toThrow("not Arrow");
    await vi.waitFor(() => {
      expect(body.cancelled()).toBe(true);
    });
    expect(worker.sent("load-end")).toStrictEqual([]);
  });

  test("refuse a response whose length is past the limit before reading its body", async () => {
    const { engine, worker } = engineWithWorker();
    const body = bodyFed(maxArrowBytes + 1);
    await expect(engine.load("positions", body.response)).rejects.toThrow(
      "positions is 70000001 bytes of Arrow, more than the 70000000 a table in the browser holds",
    );
    expect([worker.sent("load"), body.cancelled()]).toStrictEqual([[], true]);
  });

  test("refuse a response that did not succeed, saying what it answered", async () => {
    const { engine, worker } = engineWithWorker();
    await expect(engine.load("positions", new Response("busy", { status: 503 }))).rejects.toThrow(
      "positions did not arrive: its request answered 503; check that its API serves it.",
    );
    expect(worker.sent("load")).toStrictEqual([]);
  });
});

describe("the engine's progress", () => {
  const firstRows = { estimated: true, expectedRows: 3000, id: 1, rows: 1000 };

  test("opens views on a first load's first rows, and tells the app where the load stands", async () => {
    const { engine, worker } = engineWithWorker();
    const heard: unknown[] = [];
    const loaded = engine.load("positions", new ArrayBuffer(8), {
      onProgress: (progress): void => {
        heard.push(progress);
      },
    });
    const placed = engine.holds("positions");
    worker.answer({ ...firstRows, kind: "progress", shown: true });
    await expect(placed).resolves.toBe(true);
    expect(heard).toStrictEqual([{ estimated: true, expectedRows: 3000, rows: 1000, shown: true }]);
    worker.answer({ id: 1, kind: "loaded", rows: 3000 });
    await expect(loaded).resolves.toMatchObject({ rows: 3000 });
  });

  test("keeps a view that waits for the whole load, as a chart's does, waiting until it is done", async () => {
    const { engine, worker } = engineWithWorker();
    engine.load("positions", new ArrayBuffer(8)).catch(() => null);
    const order: string[] = [];
    const whole = engine.connectionFor("positions", true).then(() => order.push("whole"));
    const first = engine.holds("positions").then(() => order.push("first rows"));
    worker.answer({ ...firstRows, kind: "progress", shown: true });
    await first;
    worker.answer({ id: 1, kind: "loaded", rows: 3000 });
    await whole;
    expect(order).toStrictEqual(["first rows", "whole"]);
  });

  test("holds nothing once a first load that showed rows fails", async () => {
    const { engine, worker } = engineWithWorker();
    const loaded = engine.load("positions", new ArrayBuffer(8));
    worker.answer({ ...firstRows, kind: "progress", shown: true });
    await expect(engine.holds("positions")).resolves.toBe(true);
    worker.answer({
      id: 1,
      kind: "failed",
      message: "positions: column id has 1 duplicate primary keys",
    });
    await expect(loaded).rejects.toThrow("duplicate");
    await expect(engine.holds("positions")).resolves.toBe(false);
  });

  test("keeps a reload's views waiting while it reads, and the table held if it fails", async () => {
    const { engine, worker } = engineWithWorker();
    engine.load("positions", new ArrayBuffer(8)).catch(() => null);
    worker.answer({ id: 1, kind: "loaded", rows: 10 });
    await expect(engine.holds("positions")).resolves.toBe(true);
    const reload = engine.load("positions", new ArrayBuffer(8));
    const placed = engine.holds("positions");
    worker.answer({ ...firstRows, id: 2, kind: "progress", shown: false });
    worker.answer({
      id: 2,
      kind: "failed",
      message: "positions: column id has 2 duplicate primary keys",
    });
    await expect(reload).rejects.toThrow("duplicate");
    await expect(placed).resolves.toBe(true);
  });
});
