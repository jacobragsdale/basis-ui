/* The filter bar: a page's filters over its table, grid or list, each a control by its kind, and a chip for each active
 * filter that clears it, with one button that clears them all. The filters live in the page's search parameters, read
 * and written by `useFilters`, so a filtered view survives a reload, can be sent as a link, and Back and Forward step
 * through it; the route types them with `filterSearchSchema`. A saved view stores and restores `values` through
 * `setAll`, and sits in the bar's `actions`. */

import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";

import { XIcon } from "#vendor/lucide/x.tsx";

import { Button } from "./button.tsx";
import { FilterControl } from "./filter-controls.tsx";
import type { AnyFilterValue, FilterDefinition, FilterDefinitions } from "./filter-definitions.ts";
import type { FilterState } from "./filter-state.ts";
import { filterValueText } from "./filter-text.ts";

interface FilterBarProps<TFilters extends FilterDefinitions> {
  /** The page's filters and their values, as `useFilters` returns them. */
  readonly filters: FilterState<TFilters>;
  /** The name of the bar's search landmark; "Filters" unless set. */
  readonly label?: string | undefined;
  /** What sits at the end of the controls, such as the page's saved views. */
  readonly actions?: ReactNode;
  readonly className?: string | undefined;
}

/** One active filter, with what its chip says. */
interface ActiveFilter {
  readonly name: string;
  readonly label: string;
  readonly text: string;
}

/** The active filters, in the bar's order, each with what its chip says. */
function activeFilters(
  entries: readonly (readonly [string, FilterDefinition])[],
  values: Readonly<Record<string, AnyFilterValue | undefined>>,
): readonly ActiveFilter[] {
  return entries.flatMap(([name, definition]) => {
    const value = values[name];
    return value === undefined
      ? []
      : [{ label: definition.label, name, text: filterValueText(definition, value) }];
  });
}

/** The chips of the active filters, each clearing its own, and a button that clears them all. */
function FilterChips({
  active,
  onClear,
  onClearAll,
}: {
  readonly active: readonly ActiveFilter[];
  readonly onClear: (name: string) => void;
  readonly onClearAll: () => void;
}): ReactElement {
  return (
    <div data-slot="filter-chips" className="flex flex-wrap items-center gap-2">
      <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
        {active.map(({ name, label, text }) => (
          <li
            key={name}
            data-slot="filter-chip"
            className="flex h-(--control-sm-height) items-center gap-1 rounded-md bg-muted pl-(--control-sm-inset) text-xs text-foreground"
          >
            <span>
              <span className="font-medium">{label}:</span> {text}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Clear ${label}`}
              onClick={() => {
                onClear(name);
              }}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

/** A bar of the page's filters, kept in its address's search parameters, with a chip for each active filter.
 *
 * @use For filtering a page's table, grid or list by its fields: text, a choice, several choices, a range of days or
 * a range of numbers. Define the filters with `defineFilters`, give the route `filterSearchSchema(filters)` as its
 * `validateSearch`, and give the bar `useFilters(filters)`; filter the rows with `filterRows`, or send `values` to the
 * API. For a search box over one DataTable, DataTable's own filter is enough.
 * @see defineFilters, filterSearchSchema, useFilters, filterRows, DataTable, Page
 *
 * @example
 * ```tsx
 * import { DataTable, FilterBar, defineFilters, filterRows, filterSearchSchema, useFilters } from "@basis/ui";
 * import { createRootRoute, createRoute } from "@tanstack/react-router";
 *
 * // Once, outside any component: the filters, each by its search parameter.
 * const tradeFilters = defineFilters({
 *   issuer: { kind: "text", label: "Issuer" },
 *   book: { kind: "choice", label: "Book", options: ["Rates", "Credit"] },
 *   settles: { kind: "dateRange", label: "Settles" },
 *   par: { kind: "numberRange", label: "Par" },
 * });
 *
 * // The route types its search parameters by the filters.
 * export const tradesRoute = createRoute({
 *   getParentRoute: () => createRootRoute(),
 *   path: "/trades",
 *   validateSearch: filterSearchSchema(tradeFilters),
 * });
 *
 * // In the page's component: the filters from the address, and the rows they keep.
 * const trades = [{ book: "Rates", id: "t1", issuer: "Treasury", par: 5_000_000, settles: "2026-11-10" }];
 * const filters = useFilters(tradeFilters);
 * const shown = filterRows(trades, {
 *   fields: { book: (row) => row.book, issuer: (row) => row.issuer, par: (row) => row.par, settles: (row) => row.settles },
 *   filters: tradeFilters,
 *   values: filters.values,
 * });
 *
 * <>
 *   <FilterBar filters={filters} />
 *   <DataTable
 *     label="Trades"
 *     columns={[{ header: "Issuer", id: "issuer", value: (row: (typeof trades)[number]) => row.issuer }]}
 *     data={shown}
 *     getRowId={(row) => row.id}
 *   />
 * </>;
 * ```
 */
function FilterBar<TFilters extends FilterDefinitions>({
  filters,
  label = "Filters",
  actions,
  className,
}: FilterBarProps<TFilters>): ReactElement {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each control and chip sets the filter it was made for, by its name, with a value of its kind, which TypeScript cannot follow through `Object.entries`.
  const state = filters as unknown as FilterState<FilterDefinitions>;
  const values: Readonly<Record<string, AnyFilterValue | undefined>> = state.values;
  const entries: readonly (readonly [string, FilterDefinition])[] = Object.entries(state.filters);
  const active = activeFilters(entries, values);
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- happy-dom, which an app's tests run in without a browser, does not know `<search>`, and Playwright's role queries do not give it its role.
      role="search"
      aria-label={label}
      data-slot="filter-bar"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-start gap-3">
        {entries.map(([name, definition]) => (
          <FilterControl
            key={name}
            definition={definition}
            value={values[name]}
            onChange={(value, write) => {
              state.set(name, value, write);
            }}
          />
        ))}
        {actions === undefined ? null : (
          <div data-slot="filter-bar-actions" className="ml-auto flex items-center gap-2 self-end">
            {actions}
          </div>
        )}
      </div>
      {active.length === 0 ? null : (
        <FilterChips
          active={active}
          onClear={(name) => {
            state.clear(name);
          }}
          onClearAll={() => {
            state.clearAll();
          }}
        />
      )}
    </div>
  );
}

export { FilterBar };
export type { FilterBarProps };
