/* A request outside TanStack Query, as a dataset's `arrowResponse` is, run as a query is: retried while its failure may
 * pass, with the query client's backoff, then reported and answered. */

import { describe, expect, test, vi } from "vite-plus/test";

import { ApiError, NetworkError } from "#index.ts";
import type { Telemetry } from "#index.ts";
import { requestRunner, retryDelay } from "#shell/outside-queries.ts";

function problem(status: number, type: string): ApiError {
  return new ApiError(status, { status, type }, type);
}

/** A runner whose waits are recorded, not waited, with what it reports and answers. */
function runner(): {
  readonly run: ReturnType<typeof requestRunner>;
  readonly waits: number[];
  readonly reported: unknown[];
  readonly answered: unknown[];
} {
  const waits: number[] = [];
  const reported: unknown[] = [];
  const answered: unknown[] = [];
  const telemetry: Telemetry = {
    error: (_error, attributes) => {
      reported.push(attributes);
    },
    event: vi.fn<Telemetry["event"]>(),
    timing: vi.fn<Telemetry["timing"]>(),
  };
  const run = requestRunner({
    answer: (failure) => {
      answered.push(failure);
    },
    delay: async (milliseconds) => {
      waits.push(milliseconds);
      await Promise.resolve();
    },
    telemetry,
  });
  return { answered, reported, run, waits };
}

/** A request that fails with each of `failures` in turn, then succeeds. */
function failingThen(...failures: readonly Error[]): () => Promise<string> {
  let tries = 0;
  return async () => {
    const failure = failures[tries];
    tries += 1;
    return failure === undefined ? "rows" : Promise.reject(failure);
  };
}

describe("a request outside TanStack Query", () => {
  test.each([
    ["a keys-unavailable 503", problem(503, "keys-unavailable")],
    ["a 502", problem(502, "call-failed")],
    ["a 504", problem(504, "deadline-exceeded")],
    ["a lost connection", new NetworkError()],
  ])("is asked again twice after %s, with the query client's backoff", async (_name, failure) => {
    const { run, waits, reported } = runner();
    expect(await run(failingThen(failure, failure), "/trades")).toBe("rows");
    expect(waits).toStrictEqual([1000, 2000]);
    expect(reported).toStrictEqual([]);
  });

  test("reports its last failure to telemetry, answers it, and throws it", async () => {
    const { run, waits, reported, answered } = runner();
    const failure = problem(503, "keys-unavailable");
    await expect(run(failingThen(failure, failure, failure), "/trades")).rejects.toBe(failure);
    expect(waits).toHaveLength(2);
    expect(reported).toStrictEqual([{ request: "/trades", source: "request" }]);
    expect(answered).toStrictEqual([failure]);
  });

  test.each([
    ["sign-in-required", problem(401, "sign-in-required")],
    ["invalid-token", problem(401, "invalid-token")],
    ["a 404", problem(404, "not-found")],
  ])("hands %s to the shell's answer at once, never retried", async (_name, failure) => {
    const { run, waits, answered } = runner();
    await expect(run(failingThen(failure), "/trades")).rejects.toBe(failure);
    expect(waits).toStrictEqual([]);
    expect(answered).toStrictEqual([failure]);
  });

  test("throws a request its caller aborted at once, unreported", async () => {
    const { run, reported, answered } = runner();
    const stopped = new DOMException("The load was stopped.", "AbortError");
    await expect(run(failingThen(stopped), "/trades")).rejects.toBe(stopped);
    expect([reported, answered]).toStrictEqual([[], []]);
  });

  test("backs off as TanStack Query does, to at most 30 seconds", () => {
    expect([0, 1, 2, 5, 10].map((failures) => retryDelay(failures))).toStrictEqual([
      1000, 2000, 4000, 30_000, 30_000,
    ]);
  });
});
