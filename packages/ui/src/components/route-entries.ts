/* What the shell's parts read from an app's routes: each route's title, icon, group and place in the navigation, set
 * in its `staticData`. The sidebar, the breadcrumbs and the command palette are built from them, so a page added to
 * the route tree appears in all three:
 *
 *   createRoute({ path: "/positions", staticData: { title: "Positions", icon: TableIcon, group: "Books" }, ... })
 */

import { useRouter } from "@tanstack/react-router";
import type { StaticDataRouteOption } from "@tanstack/react-router";
import type { ComponentType, SVGProps } from "react";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The page's name, in the sidebar, the breadcrumbs and the command palette. A route without one is in none. */
    readonly title?: string;
    /** The icon beside it in the sidebar, one of `@basis/ui`'s. */
    readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
    /** The heading the page sits under in the sidebar, such as "Charts", which the command palette also matches. The
     * groups come in the order their first pages do; pages with none sit under no heading. */
    readonly group?: string;
    /** Leave it out of the sidebar and the command palette, though it keeps its breadcrumb: `false`. */
    readonly inNavigation?: boolean;
    /** The page's breadcrumb from its data, such as a bond's name on `/bonds/$security`: given the route's params and
     * what its loader returned, the text, or `undefined` while there is none, when the breadcrumb is `title`. */
    readonly breadcrumb?: (match: RouteCrumbMatch) => string | undefined;
  }
}

/** What a route's `breadcrumb` is given: its path's params and what its loader returned, if it has one. */
interface RouteCrumbMatch {
  readonly params: Readonly<Record<string, string>>;
  readonly loaderData: unknown;
}

/** A page the shell can link to: a route with a title and no path parameters. */
interface RouteEntry {
  readonly id: string;
  readonly title: string;
  readonly to: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>> | undefined;
  /** The sidebar's heading it sits under, if any. */
  readonly group: string | undefined;
}

/** What the navigation reads of a route. */
interface RouteLike {
  readonly id: string;
  readonly fullPath: string;
  readonly options: { readonly staticData?: StaticDataRouteOption };
}

function isRouteLike(value: unknown): value is RouteLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "fullPath" in value &&
    typeof value.fullPath === "string" &&
    "options" in value
  );
}

/** Whether a route is a page the navigation lists: titled, in the navigation, and reachable without parameters. */
function isListed(route: RouteLike): boolean {
  const { staticData } = route.options;
  return (
    typeof staticData?.title === "string" &&
    staticData.inNavigation !== false &&
    !route.fullPath.includes("$")
  );
}

/** The entry the page at `path` belongs to: the one whose path it is, or else the one with the longest path it lies
 * under, as `/bonds/912810TM0` lies under `/bonds`. The start page, `/`, is only its own. */
function currentEntry(entries: readonly RouteEntry[], path: string): RouteEntry | undefined {
  const trimmed = path.length > 1 ? path.replace(/\/+$/u, "") : path;
  const under = entries.filter(
    ({ to }) => trimmed === to || (to !== "/" && trimmed.startsWith(`${to}/`)),
  );
  const longest = Math.max(...under.map(({ to }) => to.length));
  return under.find(({ to }) => to.length === longest);
}

/** The pages in their groups, each group where its first page is, its pages in their order. */
function groupEntries(
  entries: readonly RouteEntry[],
): readonly (readonly [string | undefined, readonly RouteEntry[]])[] {
  return [...Map.groupBy(entries, ({ group }) => group).entries()];
}

/** The app's pages, in the order its route tree declares them. */
function useRouteEntries(): readonly RouteEntry[] {
  const routes: unknown = useRouter().routesById;
  const all = typeof routes === "object" && routes !== null ? Object.values(routes) : [];
  return all
    .filter((route) => isRouteLike(route))
    .filter((route) => isListed(route))
    .map((route) => ({
      group: route.options.staticData?.group,
      icon: route.options.staticData?.icon,
      id: route.id,
      title: route.options.staticData?.title ?? route.fullPath,
      to: route.fullPath,
    }));
}

export { currentEntry, groupEntries, useRouteEntries };
export type { RouteCrumbMatch, RouteEntry };
