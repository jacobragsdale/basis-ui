/* A page's state in its address's search parameters, which the filter bar and saved views read and write, so a view
 * is a link: it survives a reload and can be sent to someone. */

import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useTelemetry } from "#shell/telemetry.ts";

/** The page's search parameters, as text by name. */
type SearchState = Readonly<Record<string, string>>;

/** The search parameters that hold text, from the router's parsed search. */
function textParameters(search: unknown): SearchState {
  if (typeof search !== "object" || search === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(search).flatMap(([name, value]) =>
      typeof value === "string" ? [[name, value] as const] : [],
    ),
  );
}

/** The page's path and its search parameters as text, and a function that replaces them. A parameter set to the empty
 * string is removed. */
function useSearchState(): {
  readonly path: string;
  readonly search: SearchState;
  readonly setSearch: (next: SearchState) => void;
} {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const parsed: unknown = useRouterState({ select: (state): unknown => state.location.search });
  const search = textParameters(parsed);
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "search-state" });
  };
  const setSearch = (next: SearchState): void => {
    const kept = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== ""));
    navigate({ replace: true, search: kept, to: path }).catch(report);
  };
  return { path, search, setSearch };
}

export { textParameters, useSearchState };
export type { SearchState };
