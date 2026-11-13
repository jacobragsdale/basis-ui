/* The router a route test renders: the app's own options, as its `router.ts` gives `createRouter`, on a memory history
 * at the page's address, so that what the app sets, a context, a basepath or a search serializer, is under test. */

import type { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import type {
  AnyRoute,
  AnyRouter,
  RouterConstructorOptions,
  RouterHistory,
  TrailingSlashOption,
} from "@tanstack/react-router";

/** The app's router options but the route tree and the history, which the test gives. */
type AppRouterOptions = Partial<
  Omit<
    RouterConstructorOptions<
      AnyRoute,
      TrailingSlashOption,
      boolean,
      RouterHistory,
      Record<string, unknown>
    >,
    "history" | "routeTree"
  >
>;

/** The app's router options, or a function that makes them from the query client BasisApp holds, for a context that
 * carries it, as a loader that fills `context.queryClient` needs:
 * `(queryClient) => ({ context: { queryClient } })`. */
type TestRouterOptions = AppRouterOptions | ((queryClient: QueryClient) => AppRouterOptions);

/** The app's router at `path`, made with `options` and the query client BasisApp will hold. */
function testRouter({
  routeTree,
  path,
  queryClient,
  options = {},
}: {
  readonly routeTree: AnyRoute;
  readonly path: string;
  readonly queryClient: QueryClient;
  readonly options?: TestRouterOptions | undefined;
}): AnyRouter {
  const given = typeof options === "function" ? options(queryClient) : options;
  return createRouter({
    ...given,
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
}

export { testRouter };
export type { AppRouterOptions, TestRouterOptions };
