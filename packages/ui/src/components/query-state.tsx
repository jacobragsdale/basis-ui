/* QueryState: one component for every state of a query's data. While it first loads, a skeleton stands in; while it
 * waits to be enabled, as a query that needs the user's choice does, an Empty says what it waits for; if it failed, an ErrorAlert says why from the problem details the API answered, with a button to try again; with nothing
 * to show, an Empty says so; and otherwise its children draw the data, under the time it was current, which turns to
 * the warning colour once it is older than `staleAfter`. A refetch that fails keeps the data on show, with the error
 * above it. It reads TanStack Query's result, or anything shaped like it. */

import { cn } from "cn";
import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { isStale, relativeTime } from "#dates/staleness.ts";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./empty.tsx";
import { ErrorAlert } from "./error-alert.tsx";
import { Skeleton } from "./skeleton.tsx";

/** The parts of a query QueryState reads, as TanStack Query's `useQuery` returns them. */
interface QueryLike<TData> {
  readonly data: TData | undefined;
  readonly error: unknown;
  readonly isPending: boolean;
  /** Whether the query is fetching: TanStack Query's `fetchStatus`. A pending query that is `idle` is disabled, waiting
   * for what it needs, rather than loading. */
  readonly fetchStatus?: "fetching" | "paused" | "idle" | undefined;
  /** When the data was fetched, in milliseconds since the epoch; 0 before it ever was. */
  readonly dataUpdatedAt: number;
  readonly refetch: () => unknown;
}

interface QueryStateProps<TData> {
  /** The query, such as a generated client's `usePositions()`. */
  readonly query: QueryLike<TData>;
  /** Draws the data once it is there and not empty. */
  readonly children: (data: TData) => ReactNode;
  /** Whether the data has nothing to show: by default, an empty array. */
  readonly isEmpty?: ((data: TData) => boolean) | undefined;
  /** What the empty state says, such as "No trades today", and what may change that. */
  readonly emptyTitle?: string | undefined;
  /** The empty state's line under its title, such as what may change that. */
  readonly emptyDescription?: string | undefined;
  /** What the idle state says, while a disabled query waits for what it needs, such as "Choose a book", and what will
   * show once it has it. */
  readonly idleTitle?: string | undefined;
  /** The idle state's line under its title, such as what will show once the query has what it needs. */
  readonly idleDescription?: string | undefined;
  /** What stands in while the data first loads; three lines of skeleton by default. */
  readonly loading?: ReactNode;
  /** How old the data may be before its time turns to the warning colour, such as `{ minutes: 15 }`; without it, the
   * time is not shown. */
  readonly staleAfter?: Temporal.DurationLike | undefined;
  /** Places the states, as with `min-h-40`. */
  readonly className?: string | undefined;
}

/** How often the data's age is written again. */
const ageRefreshMs = 30_000;
const lines = ["first", "second", "third"] as const;

/** Now, written again every half minute, so a shown age keeps up. */
function useNow(): Temporal.Instant {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Temporal.Now.instant());
    }, ageRefreshMs);
    return (): void => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** An empty array, or a data the caller says is empty. */
function emptyOf<TData>(data: TData, isEmpty: ((data: TData) => boolean) | undefined): boolean {
  return isEmpty === undefined ? Array.isArray(data) && data.length === 0 : isEmpty(data);
}

/** When the data was current, as "As of 4 min. ago", in the warning colour once it is stale. */
function Age({
  updatedAt,
  staleAfter,
}: {
  readonly updatedAt: number;
  readonly staleAfter: Temporal.DurationLike;
}): ReactElement {
  const now = useNow();
  const then = Temporal.Instant.fromEpochMilliseconds(updatedAt);
  const stale = isStale(then, { now, threshold: staleAfter });
  return (
    <p
      data-slot="query-state-age"
      data-stale={stale ? "" : undefined}
      className={cn("text-xs text-muted-foreground", stale && "text-warning")}
    >
      <time dateTime={then.toString()}>As of {relativeTime(then, { now })}</time>
      {stale ? " (stale)" : null}
    </p>
  );
}

/** What a query with no data yet is doing: loading, waiting to be enabled, or failed with no data to keep showing. */
function unloadedState(query: QueryLike<unknown>): "loading" | "idle" | "failed" {
  if (!query.isPending) {
    return "failed";
  }
  return query.fetchStatus === "idle" ? "idle" : "loading";
}

/** An Empty that says what is, or is not, there. */
function Nothing({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string | undefined;
}): ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description === undefined ? null : <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

/** A query with no data yet: loading, waiting to be enabled, or failed with no data to keep showing. */
function Unloaded({
  query,
  loading,
  idleTitle,
  idleDescription,
  className,
}: {
  readonly query: QueryLike<unknown>;
  readonly loading: ReactNode;
  readonly idleTitle: string;
  readonly idleDescription: string | undefined;
  readonly className: string | undefined;
}): ReactElement {
  const state = unloadedState(query);
  return (
    <div data-slot="query-state" data-state={state} className={className}>
      {state === "loading"
        ? (loading ?? (
            <output aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">
              {lines.map((line) => (
                <Skeleton key={line} className="h-5 w-full" />
              ))}
            </output>
          ))
        : null}
      {state === "idle" ? <Nothing title={idleTitle} description={idleDescription} /> : null}
      {state === "failed" ? (
        <ErrorAlert
          error={query.error ?? new Error("The data could not be loaded.")}
          onRetry={() => {
            query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

/** A query's data, or what stands in for it: loading, failed, empty, and how old it is.
 *
 * @use For every state of a query's data in one place: loading, waiting, failed, empty and stale. For an error alone,
 * use ErrorAlert; a DataTable takes its query's `loading` and `error` itself.
 * @see ErrorAlert, Empty, Skeleton, DataTable
 *
 * @example
 * ```tsx
 * import { QueryState } from "@basis/ui";
 *
 * // A query result as useQuery gives it; here, two positions fetched a minute ago.
 * const positions = {
 *   data: [{ cusip: "912828C57", par: 5_000_000 }, { cusip: "037833100", par: 2_000_000 }],
 *   dataUpdatedAt: Date.now() - 60_000,
 *   error: null,
 *   isPending: false,
 *   refetch: () => undefined,
 * };
 *
 * <QueryState query={positions} emptyTitle="No positions" staleAfter={{ minutes: 15 }}>
 *   {(rows) => (
 *     <ul>
 *       {rows.map((row) => (
 *         <li key={row.cusip}>{row.cusip}</li>
 *       ))}
 *     </ul>
 *   )}
 * </QueryState>;
 * ```
 */
function QueryState<TData>(props: QueryStateProps<TData>): ReactElement {
  const {
    query,
    children,
    isEmpty,
    emptyTitle = "Nothing to show",
    emptyDescription,
    idleTitle = "Nothing chosen yet",
    idleDescription,
    staleAfter,
    className,
  } = props;
  const { data } = query;
  if (data === undefined) {
    return (
      <Unloaded
        query={query}
        loading={props.loading}
        idleTitle={idleTitle}
        idleDescription={idleDescription}
        className={className}
      />
    );
  }
  const empty = emptyOf(data, isEmpty);
  return (
    <div
      data-slot="query-state"
      data-state={empty ? "empty" : "ready"}
      className={cn("flex flex-col gap-2", className)}
    >
      <ErrorAlert
        error={query.error}
        onRetry={() => {
          query.refetch();
        }}
      />
      {empty ? <Nothing title={emptyTitle} description={emptyDescription} /> : children(data)}
      {staleAfter === undefined || query.dataUpdatedAt === 0 ? null : (
        <Age updatedAt={query.dataUpdatedAt} staleAfter={staleAfter} />
      )}
    </div>
  );
}

export { QueryState };
export type { QueryLike, QueryStateProps };
