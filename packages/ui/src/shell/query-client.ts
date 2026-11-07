/* The TanStack Query client `BasisApp` holds the app's server state in, with the defaults every basis-ui app shares. */

import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "#api/fetch.ts";

/** How long a query's data counts as fresh, in milliseconds. A page that mounts within it shows the cached data without
 * asking again; after it, the data still shows while the query asks again in the background. */
const staleTime = 30_000;

/** How many times a failed query is asked again before its error shows. */
const retries = 2;

/** The statuses basis's contract says may pass: a service the route called failed, the sign-in system's keys could
 * not be fetched, or a call ran past its deadline. */
const badGateway = 502;
const serviceUnavailable = 503;
const gatewayTimeout = 504;
const passingStatuses = new Set([badGateway, serviceUnavailable, gatewayTimeout]);

/** Whether a failed query is worth asking again. A problem the API answered is final unless its status may pass, so
 * a 4xx never retries; a response its schema refused would be refused again; a request that never reached the API, a
 * `TypeError` from `fetch`, may reach it next time. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= retries) {
    return false;
  }
  if (isApiError(error)) {
    return passingStatuses.has(error.status);
  }
  return error instanceof TypeError;
}

/** A QueryClient with basis-ui's defaults: queries stay fresh for 30 seconds, and retry twice, but only after a
 * network failure or a 502, 503 or 504. Mutations never retry. `BasisApp` makes one; a test may make its own. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: shouldRetry, staleTime } },
  });
}

export { createQueryClient, shouldRetry };
