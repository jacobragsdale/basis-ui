/* When a page `checkRoutes` opened has loaded: its route resolved, its lazy component and loaders among it, and no
 * query or mutation in flight, for a moment together, so that a query an effect starts once the data arrives counts
 * too. */

import { waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

/** How long a page must stay still to count as loaded, and how often it is looked at. */
const stillMs = 100;
const pollMs = 20;

/** What keeps a page loading: its route, a query by its key, or a mutation. */
function busyWith(router: AnyRouter, queryClient: QueryClient): string[] {
  const loading =
    router.state.status === "idle" && router.state.resolvedLocation !== undefined
      ? []
      : ["its route"];
  const queries = queryClient
    .getQueryCache()
    .findAll({ fetchStatus: "fetching" })
    .map(({ queryKey }) => `the query ${String(queryKey[0])}`);
  const mutations = queryClient.isMutating() > 0 ? ["a mutation"] : [];
  return [...loading, ...queries, ...mutations];
}

/** Waits until the page has loaded, as this file's header says. Returns what still kept it loading when `limitMs` ran
 * out, or nothing. Testing Library's `waitFor` does the waiting, so React's updates meanwhile need no `act`. */
async function settled(
  router: AnyRouter,
  queryClient: QueryClient,
  limitMs: number,
): Promise<readonly string[]> {
  const still: { since?: number | undefined } = {};
  try {
    await waitFor(
      () => {
        const now = performance.now();
        if (busyWith(router, queryClient).length > 0) {
          still.since = undefined;
          throw new Error("The page is still loading.");
        }
        still.since ??= now;
        if (now - still.since < stillMs) {
          throw new Error("The page has only just loaded.");
        }
      },
      { interval: pollMs, timeout: limitMs },
    );
    return [];
  } catch {
    const busy = busyWith(router, queryClient);
    return busy.length === 0 ? ["nothing it names"] : busy;
  }
}

export { settled };
