/* The engine's loads whose bytes are still on their way, such as a fetch the app's source started: they count as
 * under way, an unload of their dataset drops them, and a response that cannot be read, or bytes that cannot move,
 * fail the load rather than leave it waiting. */

import { describe, expect, test, vi } from "vite-plus/test";

import { BrowserEngine } from "#engine/browser-engine.ts";

import { FakeWorker, engineWithWorker } from "./fake-worker.ts";

const gib = 1024 ** 3;

/** A response whose bytes the test hands over later. */
function later(): {
  readonly bytes: Promise<ArrayBuffer>;
  readonly arrive: (bytes: ArrayBuffer) => void;
} {
  const { promise, resolve } = Promise.withResolvers<ArrayBuffer>();
  return { arrive: resolve, bytes: promise };
}

/** Unloads a dataset, as request 1, and answers that the worker's memory has outgrown its tables. */
async function outgrow(engine: BrowserEngine, worker: FakeWorker): Promise<void> {
  const unloaded = engine.unload("positions");
  worker.answer({ heldBytes: 0, id: 1, kind: "unloaded", memoryBytes: 1.5 * gib });
  await unloaded;
  await Promise.resolve();
}

/** A worker whose second post, the first after the connection's hello, cannot be sent. */
function refusingSecond(): FakeWorker {
  const worker = new FakeWorker();
  const post = worker.postMessage;
  let posts = 0;
  return Object.assign(worker, {
    postMessage: (...args: Parameters<FakeWorker["postMessage"]>): void => {
      posts += 1;
      if (posts === 2) {
        throw new DOMException("could not be cloned", "DataCloneError");
      }
      post(...args);
    },
  });
}

describe("a load whose bytes are on their way", () => {
  test("holds back a planned restart until it is answered", async () => {
    const { engine, worker } = engineWithWorker();
    const fetching = later();
    const loaded = engine.load("trades", fetching.bytes);
    await outgrow(engine, worker);
    // The fetch is on its way, so the worker stays.
    expect(worker.terminated).toBe(false);
    fetching.arrive(new ArrayBuffer(8));
    await vi.waitFor(() => {
      expect(worker.sent("load")).toHaveLength(1);
    });
    worker.answer({ id: 2, kind: "loaded", rows: 3 });
    await loaded;
    await vi.waitFor(() => {
      expect(worker.terminated).toBe(true);
    });
  });

  test("is dropped when its dataset is unloaded first, and never reaches the worker", async () => {
    const { engine, worker } = engineWithWorker();
    const fetching = later();
    const loaded = engine.load("positions", fetching.bytes);
    engine.unload("positions").catch(() => null);
    fetching.arrive(new ArrayBuffer(8));
    await expect(loaded).rejects.toThrow("positions was unloaded before its data arrived");
    expect(worker.sent("load")).toStrictEqual([]);
  });

  test("never reaches the worker that replaced the one it was meant for", async () => {
    const { engine, workers } = engineWithWorker();
    const fetching = later();
    const loaded = engine.load("positions", fetching.bytes);
    workers.current().answer({ kind: "trapped", message: "RuntimeError: unreachable" });
    fetching.arrive(new ArrayBuffer(8));
    await expect(loaded).rejects.toThrow("ran out of memory");
    expect(workers.current().sent("load")).toStrictEqual([]);
  });
});

describe("a load that cannot be sent", () => {
  test("fails a response whose body was already read, and loads what follows it", async () => {
    const { engine, worker } = engineWithWorker();
    const used = new Response(new Uint8Array(8));
    await used.arrayBuffer();
    await expect(engine.load("positions", used)).rejects.toThrow(
      "positions did not arrive: its response's body was already read",
    );
    const locked = new Response(new Uint8Array(8));
    locked.body?.getReader();
    await expect(engine.load("positions", locked)).rejects.toThrow("already read");
    expect(worker.sent("load")).toStrictEqual([]);
  });

  test("fails bytes that already moved to the engine, and waits on nothing after", async () => {
    const { engine, worker } = engineWithWorker();
    const bytes = new ArrayBuffer(8);
    // As a first load moves them to the worker.
    bytes.transfer();
    await expect(engine.load("positions", bytes)).rejects.toThrow(
      "positions did not load: its source gave bytes that already moved to the engine",
    );
    expect(worker.sent("load")).toStrictEqual([]);
  });

  test("fails a request the worker cannot be sent, and waits on nothing after", async () => {
    const worker = refusingSecond();
    const engine = new BrowserEngine(() => worker);
    await expect(engine.export("{}", "csv")).rejects.toThrow("could not be cloned");
    // Nothing waits, so an unload that leaves the memory outgrown restarts the worker at once.
    const unloaded = engine.unload("positions");
    worker.answer({ heldBytes: 0, id: 2, kind: "unloaded", memoryBytes: 1.5 * gib });
    await unloaded;
    await Promise.resolve();
    expect(worker.terminated).toBe(true);
  });
});
