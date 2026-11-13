/* A request outside TanStack Query, such as a parallax dataset's `arrowResponse`, answered as a query is: retried while
 * its failure may pass, reported to telemetry once its retries are spent, and its sign-in problem answered. The shell
 * installs it while `BasisApp` is mounted (`setRequestRunner`), so a dataset page gets what a generated hook gets. */

import { isNetworkError } from "#api/network-error.ts";
import type { RequestRunner } from "#api/fetch.ts";

import { shouldRetry } from "./query-client.ts";
import type { Telemetry } from "./telemetry.ts";

const millisecondsPerSecond = 1000;
const longestDelay = 30_000;

/** TanStack Query's own backoff, so a request outside it waits as a query does: 1 s, 2 s, then 4 s, at most 30 s. */
function retryDelay(failures: number): number {
  return Math.min(millisecondsPerSecond * 2 ** failures, longestDelay);
}

async function wait(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, milliseconds);
  await promise;
}

/** Whether `error` is a request its caller stopped, which is nobody's failure. */
function aborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError" && !isNetworkError(error);
}

interface RunnerOptions {
  readonly telemetry: Telemetry;
  /** The shell's answer to a failure: a sign-in problem's toast or sign-out, and nothing for any other. */
  readonly answer: (failure: unknown) => void;
  /** How long to wait before the next try; the backoff's by default, for a test to shorten. */
  readonly delay?: (milliseconds: number) => Promise<void>;
}

/** The runner every request outside TanStack Query goes through while `BasisApp` is mounted: it asks again after a
 * failure the query client would retry, a network failure or a 502, 503 or 504 (`keys-unavailable` among them), with
 * the same backoff, then reports the failure to telemetry as `source: "request"` with the request's name, answers its
 * sign-in problem, and throws it. A request its caller aborted is thrown at once, unreported. */
function requestRunner({ telemetry, answer, delay = wait }: RunnerOptions): RequestRunner {
  return async <TResult>(request: () => Promise<TResult>, name: string): Promise<TResult> => {
    for (let failures = 0; ; failures += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- each try waits for the one before it to fail.
        return await request();
      } catch (error) {
        if (aborted(error)) {
          throw error;
        }
        if (!shouldRetry(failures, error)) {
          telemetry.error(error, { request: name, source: "request" });
          answer(error);
          throw error;
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await delay(retryDelay(failures));
    }
  };
}

export { requestRunner, retryDelay };
