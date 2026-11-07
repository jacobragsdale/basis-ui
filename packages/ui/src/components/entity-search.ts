/* The search behind an EntityPicker: the typed text, held back until typing stops, checked, then asked for through
 * TanStack Query, so that a search goes the way every other read of the API goes, through the app's query client: it
 * retries by the shell's rules, a sign-in problem signs the user out or asks them to sign in, telemetry hears of a
 * failure, and a text searched a moment ago shows its results at once.
 *
 * Each text is its own query, so only the last text's results ever show. The search's `signal` is handed to the app's
 * function, and TanStack Query aborts it when the query loses its picker to a newer text, so a stale request is
 * cancelled rather than left to finish. */

import { useQuery } from "@tanstack/react-query";
import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

/** Searches for the items that match a text; aborting `signal` cancels it, as the generated client's functions do
 * when they are passed it. */
type EntitySearch<TItem> = (text: string, signal: AbortSignal) => Promise<readonly TItem[]>;

interface EntitySearchOptions<TItem> {
  readonly search: EntitySearch<TItem>;
  /** The text as typed. */
  readonly text: string;
  readonly debounceMs: number;
  readonly minLength: number;
  /** Why a text cannot be searched, or `undefined` when it can. */
  readonly validate: ((text: string) => string | undefined) | undefined;
  /** The search's key in the query cache; the picker's own unless set. */
  readonly queryKey: QueryKey | undefined;
}

/** Where a search is, for the picker's status line. */
type EntitySearchState<TItem> =
  | { readonly status: "idle" }
  | { readonly status: "invalid"; readonly reason: string }
  | { readonly status: "searching" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "found"; readonly text: string; readonly items: readonly TItem[] };

/** `value`, once it has stayed the same for `delay` milliseconds. */
function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delay);
    return (): void => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return settled;
}

/** Why the settled text is not searched: too short, which is no error, or the app's reason. */
function checkOf(
  text: string,
  minLength: number,
  validate: ((text: string) => string | undefined) | undefined,
): { readonly searchable: boolean; readonly reason: string | undefined } {
  if (text.length < Math.max(minLength, 1)) {
    return { reason: undefined, searchable: false };
  }
  const reason = validate?.(text);
  return { reason, searchable: reason === undefined };
}

/** Where the search is: still typing, not searched and why, failed, or found. */
function stateOf<TItem>({
  typed,
  settled,
  minLength,
  check,
  query,
}: {
  readonly typed: string;
  readonly settled: string;
  readonly minLength: number;
  readonly check: { readonly searchable: boolean; readonly reason: string | undefined };
  readonly query: UseQueryResult<readonly TItem[]>;
}): EntitySearchState<TItem> {
  if (typed !== settled) {
    return typed.length < Math.max(minLength, 1) ? { status: "idle" } : { status: "searching" };
  }
  if (check.reason !== undefined) {
    return { reason: check.reason, status: "invalid" };
  }
  if (!check.searchable) {
    return { status: "idle" };
  }
  if (query.isError) {
    return { error: query.error, status: "failed" };
  }
  return query.data === undefined
    ? { status: "searching" }
    : { items: query.data, status: "found", text: settled };
}

/** The search for the text as typed, once typing has stopped for `debounceMs`. */
function useEntitySearch<TItem>({
  search,
  text,
  debounceMs,
  minLength,
  validate,
  queryKey,
}: EntitySearchOptions<TItem>): EntitySearchState<TItem> {
  const ownKey = useId();
  const typed = text.trim();
  const settled = useDebounced(typed, debounceMs);
  const check = checkOf(settled, minLength, validate);
  const query = useQuery({
    enabled: check.searchable,
    queryFn: async ({ signal }) => search(settled, signal),
    queryKey: [...(queryKey ?? ["@basis/ui", "entity-picker", ownKey]), settled],
  });
  return stateOf({ check, minLength, query, settled, typed });
}

export { useEntitySearch };
export type { EntitySearch, EntitySearchState };
