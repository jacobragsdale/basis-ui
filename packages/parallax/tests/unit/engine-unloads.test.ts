import { describe, expect, test } from "vite-plus/test";

import { engineWithWorker } from "./fake-worker.ts";

const gib = 1024 ** 3;
const layout = '{"version":1,"dataset":"positions"}';

type Holding = ReturnType<typeof engineWithWorker> & { readonly restarts: [string, boolean][] };

/** An engine holding `positions`, on fake workers, with the restarts it reports. */
async function holding(): Promise<Holding> {
  const started = engineWithWorker();
  const loaded = started.engine.load("positions", new ArrayBuffer(8));
  started.worker.answer({ id: 1, kind: "loaded", rows: 3 });
  await loaded;
  const restarts: [string, boolean][] = [];
  started.engine.onRestart((reason, planned) => {
    restarts.push([reason, planned]);
  });
  return { ...started, restarts };
}

describe("the engine's unloads", () => {
  test("drop the dataset in the worker and say what its memory holds", async () => {
    const { engine, worker, restarts } = await holding();
    const unloaded = engine.unload("positions");
    expect(worker.sent("unload")).toStrictEqual([{ dataset: "positions", id: 2, kind: "unload" }]);
    // Views of it now say it is not loaded, without waiting for the worker.
    await expect(engine.holds("positions")).resolves.toBe(false);
    worker.answer({ heldBytes: 0, id: 2, kind: "unloaded", memoryBytes: 0.3 * gib });
    await expect(unloaded).resolves.toStrictEqual({
      heldBytes: 0,
      memoryBytes: 0.3 * gib,
      restarting: false,
    });
    expect([worker.terminated, restarts]).toStrictEqual([false, []]);
  });

  test("replace a worker whose memory outgrew its tables once nothing waits, as a planned restart", async () => {
    const { engine, worker, workers, restarts } = await holding();
    const exporting = engine.export(layout, "csv");
    const unloaded = engine.unload("positions");
    worker.answer({ heldBytes: 0.3 * gib, id: 3, kind: "unloaded", memoryBytes: 1.5 * gib });
    await expect(unloaded).resolves.toMatchObject({ restarting: true });
    // The export still waits, so the worker stays until it is answered.
    expect([worker.terminated, workers.all.length]).toStrictEqual([false, 1]);
    worker.answer({ bytes: null, id: 2, kind: "exported" });
    await exporting;
    await Promise.resolve();
    expect([worker.terminated, workers.all.length, restarts]).toStrictEqual([
      true,
      2,
      [[expect.stringContaining("give back the memory"), true]],
    ]);
  });

  test("keep a worker whose tables still take most of its memory", async () => {
    const { engine, worker, restarts } = await holding();
    const unloaded = engine.unload("positions");
    worker.answer({ heldBytes: 0.9 * gib, id: 2, kind: "unloaded", memoryBytes: 1.5 * gib });
    await expect(unloaded).resolves.toMatchObject({ restarting: false });
    await Promise.resolve();
    expect([worker.terminated, restarts]).toStrictEqual([false, []]);
  });
});
