import { describe, expect, test } from "vite-plus/test";

import { ParallaxClient } from "#engine/client.ts";
import type { Restart } from "#engine/client.ts";
import { parseToWorker } from "#engine/messages.ts";

import { fakeWorkers } from "./fake-worker.ts";

const trap = { kind: "trapped", message: "RuntimeError: unreachable" };

/** A client on fake workers, with a clock the test moves, and the restarts it reports. */
function client(): {
  readonly parallax: ParallaxClient;
  readonly workers: ReturnType<typeof fakeWorkers>;
  readonly restarts: Restart[];
  readonly time: { now: number };
} {
  const workers = fakeWorkers();
  const time = { now: 0 };
  const parallax = new ParallaxClient(workers.start, { now: (): number => time.now });
  const restarts: Restart[] = [];
  parallax.onRestart((restart) => {
    restarts.push(restart);
  });
  return { parallax, restarts, time, workers };
}

describe(ParallaxClient, () => {
  test("starts its worker on first use, or when prewarmed", () => {
    const { parallax, workers } = client();
    expect([workers.all.length, parallax.generation]).toStrictEqual([0, 0]);
    parallax.prewarm();
    parallax.prewarm();
    expect([workers.all.length, parallax.generation]).toStrictEqual([1, 1]);
  });

  test("ends its worker when closed, and starts another on the next use", () => {
    const { parallax, workers } = client();
    parallax.prewarm();
    parallax.close();
    expect(workers.current().terminated).toBe(true);
    parallax.load("positions", new ArrayBuffer(8)).catch(() => null);
    expect([workers.all.length, parallax.generation]).toStrictEqual([2, 2]);
  });

  test("tells its listeners of a restart, to recover from", () => {
    const { parallax, workers, restarts } = client();
    parallax.prewarm();
    workers.current().answer(trap);
    expect(restarts).toStrictEqual([
      { reason: expect.stringContaining("RuntimeError: unreachable") as unknown, recover: true },
    ]);
    expect(parallax.generation).toBe(2);
  });

  test("says not to recover once the engine keeps stopping, and to recover again a minute on", () => {
    const { parallax, workers, restarts, time } = client();
    parallax.prewarm();
    for (const at of [0, 10_000, 20_000, 90_000]) {
      time.now = at;
      workers.current().answer(trap);
    }
    expect(restarts.map((restart) => restart.recover)).toStrictEqual([true, true, false, true]);
    expect(restarts[2]?.reason).toContain("parallax leaves it stopped: reload the page");
  });

  test("stops telling a listener that stopped listening", () => {
    const { parallax, workers } = client();
    const heard: Restart[] = [];
    const stop = parallax.onRestart((restart) => {
      heard.push(restart);
    });
    stop();
    parallax.prewarm();
    workers.current().answer(trap);
    expect(heard).toStrictEqual([]);
  });
});

describe(parseToWorker, () => {
  test("reads the page's messages", () => {
    const bytes = new ArrayBuffer(8);
    const load = {
      bytes,
      dataset: "x",
      expectedBytes: null,
      id: 1,
      kind: "load",
      maxRows: 10,
      nowMicros: 5,
      primaryKey: null,
    };
    expect(parseToWorker({ ...load, sourceAsOfMicros: null })).toStrictEqual({
      ...load,
      sourceAsOfMicros: null,
    });
    const exporting = {
      format: "csv",
      id: 2,
      kind: "export",
      layout: "{}",
      loadVersion: null,
      maxCells: 5,
    };
    expect(parseToWorker(exporting)).toStrictEqual(exporting);
    expect(parseToWorker({ bytes: new Uint8Array(2), kind: "message" })).toMatchObject({
      kind: "message",
    });
  });

  test("reads a load of a response's body, and the body's chunks and end", () => {
    const streamed = {
      bytes: null,
      dataset: "x",
      expectedBytes: 64,
      id: 1,
      kind: "load",
      maxRows: 10,
      nowMicros: 5,
      primaryKey: null,
      sourceAsOfMicros: null,
    };
    expect(parseToWorker(streamed)).toStrictEqual(streamed);
    const chunk = { bytes: new ArrayBuffer(4), id: 1, kind: "load-bytes" };
    expect(parseToWorker(chunk)).toStrictEqual(chunk);
    for (const error of [null, "the network dropped"]) {
      const end = { error, id: 1, kind: "load-end" };
      expect(parseToWorker(end)).toStrictEqual(end);
    }
    expect(parseToWorker({ bytes: "not bytes", id: 1, kind: "load-bytes" })).toBeNull();
    expect(parseToWorker({ error: 5, id: 1, kind: "load-end" })).toBeNull();
  });

  test.each([
    null,
    [],
    { kind: "copy" },
    { bytes: "text", kind: "message" },
    {
      bytes: new Uint8Array(1),
      dataset: "x",
      id: -1,
      kind: "load",
      maxRows: 1,
      nowMicros: 1,
      primaryKey: null,
    },
    { format: "pdf", id: 1, kind: "export", layout: "{}", loadVersion: null, maxCells: 1 },
  ])("refuses %j", (data) => {
    expect(parseToWorker(data)).toBeNull();
  });
});
