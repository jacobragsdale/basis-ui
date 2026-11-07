import { describe, expect, test } from "vite-plus/test";

import { BrowserEngine } from "#engine/browser-engine.ts";
import type { ViewHandle } from "#engine/view.ts";
import type { FrameData } from "#frame/frame.ts";
import { parseLayout } from "#layout/layout.ts";

import { byFund, hugeBytes, positionsBytes, startCappedWorker, startWorker } from "./data.ts";

/** Opens a view of `dataset` and waits for its first frame. */
async function firstFrame(
  engine: BrowserEngine,
  dataset: string,
): Promise<{ readonly frame: FrameData; readonly view: ViewHandle }> {
  const { promise, resolve, reject } = Promise.withResolvers<FrameData>();
  const connection = await engine.connectionFor(dataset);
  const layout = JSON.stringify(parseLayout({ ...byFund, dataset }));
  const view = connection.open(dataset, layout, {
    error: (message) => {
      reject(new Error(message));
    },
    frame: resolve,
  });
  view.setViewport({ columnCount: 10, firstColumn: 0, firstRow: 0, rowCount: 10 });
  return { frame: await promise, view };
}

/** A pivot frame's rows as their labels and their sums' text. */
function rowsOf(frame: FrameData): readonly (readonly string[])[] {
  return Array.from({ length: frame.rowCount }, (_entry, row) => [
    frame.tree?.label(row) ?? "",
    frame.columns[0]?.text(row) ?? "",
  ]);
}

describe("the engine's real worker", () => {
  test("loads an Arrow table the page made, and pivots it", async () => {
    const engine = new BrowserEngine(startWorker);
    await expect(engine.load("positions", positionsBytes())).resolves.toStrictEqual({
      dataset: "positions",
      rows: 6,
    });
    const { frame, view } = await firstFrame(engine, "positions");
    expect(rowsOf(frame)).toStrictEqual([
      ["Total", "652.75"],
      ["Atlas", "250.75"],
      ["Boreal", "402.00"],
    ]);
    view.close();
    engine.close();
  });
});

describe("the engine's real worker, out of memory", () => {
  const reason =
    "The engine in this page stopped after a fatal error (RuntimeError: unreachable), most likely because it ran out of memory.";

  test("traps, and fails its loads and views with the reason", async () => {
    const engine = new BrowserEngine(startCappedWorker);
    const restarts: string[] = [];
    engine.onRestart((given) => {
      restarts.push(given);
    });
    await engine.load("positions", positionsBytes());
    const { view } = await firstFrame(engine, "positions");
    await expect(engine.load("huge", hugeBytes())).rejects.toThrow(reason);
    expect(view.isClosed).toBe(true);
    expect(restarts).toStrictEqual([expect.stringContaining(reason) as unknown]);
    engine.close();
  });

  test("starts again empty, and the data loads and pivots again", async () => {
    const engine = new BrowserEngine(startCappedWorker);
    await engine.load("positions", positionsBytes());
    await expect(engine.load("huge", hugeBytes())).rejects.toThrow(reason);
    await expect(engine.holds("positions")).resolves.toBe(false);
    await engine.load("positions", positionsBytes());
    const { frame } = await firstFrame(engine, "positions");
    expect(rowsOf(frame)[0]).toStrictEqual(["Total", "652.75"]);
    engine.close();
  });
});

describe("the package's built worker", () => {
  test("finds its engine beside it, as an app's bundler serves them", async () => {
    const engine = new BrowserEngine(
      () => new Worker(new URL("../../dist/worker.mjs", import.meta.url), { type: "module" }),
    );
    await expect(engine.load("positions", positionsBytes())).resolves.toMatchObject({ rows: 6 });
    const { frame } = await firstFrame(engine, "positions");
    expect(rowsOf(frame)[0]).toStrictEqual(["Total", "652.75"]);
    engine.close();
  });
});
