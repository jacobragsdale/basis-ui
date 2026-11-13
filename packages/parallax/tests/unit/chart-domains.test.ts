import { once } from "node:events";
import { Worker } from "node:worker_threads";

import { afterAll, describe, expect, test } from "vite-plus/test";

import type { Answer } from "./chart-domains.worker.ts";

/** How long one model may take, once the worker is up; a loop that never ends is stopped here. */
const limit = 2000;
/** How long the worker may take to start and load its modules, which a busy runner can make slow. */
const startLimit = 60_000;

/** Value ranges no round step can walk in floating point, or none at all. */
const domains: Readonly<Record<string, readonly number[]>> = {
  "a few ULPs apart": [0.9999999999999999, 1, 1.0000000000000002],
  "a few ULPs apart at 100": [100, 100.00000000000001],
  "a few ULPs apart at a million": [1e6, 1e6 + 2.3283064365386963e-10],
  "a single point": [42],
  "all null": [Number.NaN, Number.NaN],
  empty: [],
  equal: [7, 7, 7],
  "huge magnitudes": [1e308, 1.7e308],
  "huge, either side of zero": [-1.7e308, 1.7e308],
  infinities: [Number.NEGATIVE_INFINITY, 3, Number.POSITIVE_INFINITY],
  "NaN among values": [Number.NaN, 2, 4],
  "negative only": [-12, -3, -7],
  "tiny magnitudes": [1e-310, 2e-310],
  "tiny, a few ULPs apart": [5e-324, 1e-323],
  zero: [0, 0],
};
/** The value axes: a line's left and right, a log axis, a bar chart's, and a scatter's density. */
const forms = ["left", "right", "log", "bar", "density"];
const styles = ["plain", "percent", "bps", "par", "thirty-seconds"];
const cases = Object.entries(domains).flatMap(([name, values]) =>
  forms.flatMap((form) => styles.map((style) => ({ form, name, style, values }))),
);

/** A worker, and its first message, which says its modules are loaded. Its heap is held small, so that a loop that
 * fills it ends there and not in the host's memory. */
function started(): { readonly thread: Worker; readonly ready: Promise<unknown> } {
  const thread = new Worker(new URL("chart-domains.worker.ts", import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  return { ready: once(thread, "message", { signal: AbortSignal.timeout(startLimit) }), thread };
}

let worker = started();

afterAll(async () => {
  await worker.thread.terminate();
});

function isAnswer(value: unknown): value is Answer {
  return typeof value === "object" && value !== null && "ticks" in value && "finite" in value;
}

/** The model of one case, or null when it took longer than the limit or ran out of memory; the worker then starts
 * again. */
async function answer(
  form: string,
  style: string,
  values: readonly number[],
): Promise<Answer | null> {
  await worker.ready;
  worker.thread.postMessage({ form, style, values }, []);
  try {
    const replies: unknown[] = await once(worker.thread, "message", {
      signal: AbortSignal.timeout(limit),
    });
    const [reply] = replies;
    return isAnswer(reply) ? reply : null;
  } catch {
    await worker.thread.terminate();
    worker = started();
    return null;
  }
}

describe("a chart's value axes over degenerate ranges", () => {
  test.for(cases)(
    "return a few finite ticks on a $form axis in $style when the values are $name",
    async ({ form, style, values }) => {
      const result = await answer(form, style, values);
      expect(result).not.toBeNull();
      expect(result?.error).toBeUndefined();
      expect(result?.finite).toBe(true);
      expect(result?.ticks).toBeLessThanOrEqual(40);
    },
  );
});
