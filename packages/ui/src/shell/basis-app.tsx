/* BasisApp: the providers every basis-ui app renders itself in, so that each app starts, signs in, routes, holds server
 * state, shows errors and reports them the same way. An app's whole entry point is
 *
 *   const router = createRouter({ routeTree });
 *   createRoot(root).render(<StrictMode><BasisApp router={router} signIn={signIn} /></StrictMode>);
 *
 * It signs the user in through the adapter before it shows any route, and gives `apiFetch` the adapter's token. */

import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { CatchBoundary, Link, RouterProvider, useRouter } from "@tanstack/react-router";
import type { AnyRouter, ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { ButtonLink } from "#components/button-link.ts";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#components/empty.tsx";
import { ErrorAlert } from "#components/error-alert.tsx";
import { Spinner } from "#components/spinner.tsx";
import { Toaster } from "#components/toast.tsx";
import { followPreferences } from "#theme/preferences.ts";
import type { Preferences } from "#theme/preferences.ts";

import { toastError } from "./toast-error.tsx";
import { createQueryClient } from "./query-client.ts";
import { useSessionState } from "./session-state.ts";
import { SessionContext } from "./session.ts";
import { signInProblem } from "./sign-in-problems.ts";
import type { SignIn } from "./sign-in.ts";
import { TelemetryContext, consoleTelemetry, useTelemetry } from "./telemetry.ts";
import type { Telemetry } from "./telemetry.ts";

interface BasisAppProps {
  /** The app's TanStack Router, made with `createRouter({ routeTree })`. Its routes render once the user is known.
   * Unless it sets its own, BasisApp gives it an error component, a not-found component and an `onCatch` that
   * reports to telemetry. */
  readonly router: AnyRouter;
  /** The sign-in adapter: the firm's, `anonymousSignIn()` for an app with no sign-in, or `fakeSignIn()` in tests and
   * development. */
  readonly signIn: SignIn;
  /** Where errors, events and timings go; the console by default. */
  readonly telemetry?: Telemetry;
  /** The query client, for a test that reads its cache; one from `createQueryClient()` by default. */
  readonly queryClient?: QueryClient;
  /** The mode and density to show in place of the stored choice, which it otherwise follows: for a page told them
   * another way, as the gallery is by its query. A choice made in the user menu is still stored, and shown at once. */
  readonly preferences?: Preferences | undefined;
}

/** Reports every failed query and mutation to telemetry, once its retries are spent, and raises a toast for each
 * failed mutation unless its `meta` says `{ errorToast: false }` or it failed for want of a session, which the sign-in
 * toast answers (sign-in-problems.ts). A failed query shows where its data would, through `ErrorAlert`. Returns the
 * unsubscribe. */
function reportRequests(queryClient: QueryClient, telemetry: Telemetry): () => void {
  const stopQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      const key: unknown = event.query.queryKey;
      telemetry.error(event.action.error, {
        query: Array.isArray(key) ? String(key[0]) : "",
        source: "query",
      });
    }
  });
  const stopMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      telemetry.error(event.action.error, {
        mutation: String(event.mutation.options.mutationKey?.[0]),
        source: "mutation",
      });
      if (
        event.mutation.meta?.["errorToast"] !== false &&
        signInProblem(event.action.error) === undefined
      ) {
        toastError(event.action.error);
      }
    }
  });
  return () => {
    stopQueries();
    stopMutations();
  };
}

/** Reports how long each navigation took, from the router starting to load a location to its resolving, as the
 * `navigation` timing with the path it reached. Returns the unsubscribe. */
function reportNavigations(router: AnyRouter, telemetry: Telemetry): () => void {
  let started: number | null = null;
  const stopLoads = router.subscribe("onBeforeLoad", () => {
    started = performance.now();
  });
  const stopResolutions = router.subscribe("onResolved", (event) => {
    if (started !== null) {
      telemetry.timing("navigation", performance.now() - started, {
        path: event.toLocation.pathname,
      });
      started = null;
    }
  });
  return () => {
    stopLoads();
    stopResolutions();
  };
}

/** The outer error boundary's key never changes; its "Try again" resets it. */
function boundaryKey(): number {
  return 0;
}

/** What a route shows when it throws: its error, and a "Try again" that loads the route again. */
function RouteError({ error: routeError, reset }: ErrorComponentProps): ReactElement {
  const router = useRouter();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "route" });
  };
  return (
    <ErrorAlert
      error={routeError}
      onRetry={() => {
        reset();
        router.invalidate().catch(report);
      }}
    />
  );
}

/** What a location no route matches shows. */
function RouteNotFound(): ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>No page in this app has this address.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ButtonLink render={<Link to="/" />} variant="outline">
          Go to the start page
        </ButtonLink>
      </EmptyContent>
    </Empty>
  );
}

/** The whole page, while the error boundary or the sign-in holds it: `error` with a "Try again". */
function PageError({ error, reset }: ErrorComponentProps): ReactElement {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg items-center p-6">
      <ErrorAlert error={error} onRetry={reset} />
    </div>
  );
}

function SigningIn(): ReactElement {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-label="Signing in" />
      <span aria-hidden="true">Signing in</span>
    </div>
  );
}

/** The router, with BasisApp's error and not-found components and error reports where it sets none of its own. */
function Routes({ router }: { readonly router: AnyRouter }): ReactElement {
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "route" });
  };
  return (
    <RouterProvider
      router={router}
      defaultErrorComponent={router.options.defaultErrorComponent ?? RouteError}
      defaultNotFoundComponent={router.options.defaultNotFoundComponent ?? RouteNotFound}
      defaultOnCatch={router.options.defaultOnCatch ?? report}
    />
  );
}

/** The app's providers: telemetry, the query client, the toasts, an error boundary round everything, the signed-in
 * session, and the router. It also keeps the page in the user's mode and density as they change them, or in the
 * `preferences` it is given, signs the user out when the API says their session has ended, and asks them to sign in
 * when it says a request needs them to.
 *
 * @example
 * ```tsx
 * import { BasisApp, anonymousSignIn } from "@basis/ui";
 * import { createRootRoute, createRouter } from "@tanstack/react-router";
 *
 * const router = createRouter({ routeTree: createRootRoute() });
 *
 * <BasisApp router={router} signIn={anonymousSignIn()} />;
 * ```
 */
function BasisApp({
  router,
  signIn,
  telemetry = consoleTelemetry,
  queryClient: givenClient,
  preferences,
}: BasisAppProps): ReactElement {
  // oxlint-disable-next-line react/hook-use-state -- one query client for the app's life, made once; nothing sets it.
  const [queryClient] = useState(() => givenClient ?? createQueryClient());
  const { state, retry, session } = useSessionState(signIn, queryClient, telemetry);
  const shownMode = preferences?.mode;
  const shownDensity = preferences?.density;
  useEffect(
    () =>
      followPreferences(
        shownMode === undefined || shownDensity === undefined
          ? undefined
          : { density: shownDensity, mode: shownMode },
      ),
    [shownMode, shownDensity],
  );
  useEffect(() => reportRequests(queryClient, telemetry), [queryClient, telemetry]);
  useEffect(() => reportNavigations(router, telemetry), [router, telemetry]);
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "render" });
  };
  return (
    <TelemetryContext value={telemetry}>
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <CatchBoundary getResetKey={boundaryKey} errorComponent={PageError} onCatch={report}>
            {state.status === "pending" ? <SigningIn /> : null}
            {state.status === "failed" ? <PageError error={state.error} reset={retry} /> : null}
            {session === null ? null : (
              <SessionContext value={session}>
                <Routes router={router} />
              </SessionContext>
            )}
          </CatchBoundary>
        </Toaster>
      </QueryClientProvider>
    </TelemetryContext>
  );
}

export { BasisApp };
export type { BasisAppProps };
