import { afterEach, describe, expect, test } from "vite-plus/test";

import { liftedLimitsKey, loadLimits, maxArrowBytes, maxRows } from "#engine/limits.ts";

import { engineWithWorker } from "./fake-worker.ts";

/** Raises the limits as a measuring page does, outside the package's API. */
function lift(limits: unknown): void {
  Reflect.set(globalThis, liftedLimitsKey, limits);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, liftedLimitsKey);
});

describe("the load limits", () => {
  test("are the documented ones in a page that raised none", () => {
    expect(loadLimits()).toStrictEqual({ maxArrowBytes, maxRows });
  });

  test("are the ones a measuring page raised, which a load is then checked against", () => {
    const { engine, worker } = engineWithWorker();
    lift({ maxArrowBytes: maxArrowBytes * 2, maxRows: 2_000_000 });
    engine.load("trades", new ArrayBuffer(maxArrowBytes + 1)).catch(() => null);
    expect(worker.sent("load")[0]).toMatchObject({ maxRows: 2_000_000 });
  });

  test("ignore a raised limit that is not a count the engine takes", () => {
    lift({ maxArrowBytes: -1, maxRows: 2 ** 32 });
    expect(loadLimits()).toStrictEqual({ maxArrowBytes, maxRows });
    lift("everything");
    expect(loadLimits()).toStrictEqual({ maxArrowBytes, maxRows });
  });
});
