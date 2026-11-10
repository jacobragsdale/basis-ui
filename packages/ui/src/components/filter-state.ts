/* A page's filters as its address holds them: read from the router's search parameters through the filters' schema,
 * and written back through `navigate`, so Back and Forward step through the filters as they step through pages. Each
 * change is a history entry of its own, unless the caller replaces the one it made, as a text filter does while the
 * user types. A change keeps the page where it is scrolled, and keeps the route's other search parameters. */

import { useNavigate, useSearch } from "@tanstack/react-router";

import { useTelemetry } from "#shell/telemetry.ts";

import type { FilterDefinitions, FilterValue, FilterValues } from "./filter-definitions.ts";
import { readFilterValues } from "./filter-search.ts";

/** How a change is written to the address. */
interface FilterWrite {
  /** Replace the current history entry rather than adding one, so Back skips this change; false unless set. */
  readonly replace?: boolean | undefined;
}

/** A page's filters, their active values, and how to change them. */
interface FilterState<TFilters extends FilterDefinitions> {
  /** The page's filters, as `defineFilters` returned them. */
  readonly filters: TFilters;
  /** The active filters, by name, as the address holds them; give them to `filterRows`, a table or an API. */
  readonly values: FilterValues<TFilters>;
  /** Sets one filter, or clears it when `value` is `undefined`, empty text or no options. */
  readonly set: <TName extends keyof TFilters & string>(
    name: TName,
    value: FilterValue<TFilters[TName]> | undefined,
    write?: FilterWrite,
  ) => void;
  /** Clears one filter. */
  readonly clear: (name: keyof TFilters & string) => void;
  /** Clears every filter, in one history entry. */
  readonly clearAll: () => void;
  /** Sets every filter at once, in one history entry, as a saved view restores them: a filter `values` leaves out is
   * cleared, and a value the filter cannot take, such as an option the page no longer has, is dropped. */
  readonly setAll: (values: FilterValues<TFilters>) => void;
}

/** A value as the address holds it: `undefined` for empty text, no options or a range with neither end. */
function stored(value: unknown): unknown {
  if (value === "" || (Array.isArray(value) && value.length === 0)) {
    return undefined;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const ends = Object.entries(value).filter(([, end]) => end !== undefined);
    return ends.length === 0 ? undefined : Object.fromEntries(ends);
  }
  return value;
}

/** The search parameters with `changes` written over them; a change to `undefined` removes its parameter. */
function withChanges(
  previous: Readonly<Record<string, unknown>>,
  changes: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged = {
    ...previous,
    ...Object.fromEntries(Object.entries(changes).map(([name, value]) => [name, stored(value)])),
  };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

/** Every filter's name, each set to `undefined`. */
function noneOf(filters: FilterDefinitions): Record<string, undefined> {
  return Object.fromEntries(Object.keys(filters).map((name) => [name, undefined]));
}

/** The page's filters, read from its address's search parameters and written back to them. Its route's
 * `validateSearch` is `filterSearchSchema(filters)`, with the same filters. Give the result to `FilterBar`, and its
 * `values` to `filterRows` or a query.
 *
 * @use For a page with a FilterBar: call it once, then pass it to the bar and read `values` for the rows. Back and
 * Forward restore the filters, and a link to the page opens them.
 * @see FilterBar, defineFilters, filterSearchSchema, filterRows */
function useFilters<const TFilters extends FilterDefinitions>(
  filters: TFilters,
): FilterState<TFilters> {
  const search: unknown = useSearch({ strict: false });
  const values = readFilterValues(filters, search);
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "filter-bar" });
  };
  const write = (changes: Readonly<Record<string, unknown>>, replace = false): void => {
    navigate({
      replace,
      resetScroll: false,
      search: (previous: Readonly<Record<string, unknown>>) => withChanges(previous, changes),
      to: ".",
    }).catch(report);
  };
  return {
    clear: (name) => {
      write({ [name]: undefined });
    },
    clearAll: () => {
      write(noneOf(filters));
    },
    filters,
    set: (name, value, { replace } = {}) => {
      write({ [name]: value }, replace);
    },
    setAll: (next) => {
      write({ ...noneOf(filters), ...readFilterValues(filters, next) });
    },
    values,
  };
}

export { useFilters };
export type { FilterState, FilterWrite };
