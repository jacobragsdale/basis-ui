/* What the shell's parts read from an app's routes: each route's title, icon and place in the navigation, set in its
 * `staticData`. The sidebar, the breadcrumbs and the command palette are built from them, so a page added to the route
 * tree appears in all three:
 *
 *   createRoute({ path: "/positions", staticData: { title: "Positions", icon: TableIcon }, ... })
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
    /** Leave it out of the sidebar and the command palette, though it keeps its breadcrumb: `false`. */
    readonly inNavigation?: boolean;
  }
}

/** A page the shell can link to: a route with a title and no path parameters. */
interface RouteEntry {
  readonly id: string;
  readonly title: string;
  readonly to: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>> | undefined;
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

/** The app's pages, in the order its route tree declares them. */
function useRouteEntries(): readonly RouteEntry[] {
  const routes: unknown = useRouter().routesById;
  const all = typeof routes === "object" && routes !== null ? Object.values(routes) : [];
  return all
    .filter((route) => isRouteLike(route))
    .filter((route) => isListed(route))
    .map((route) => ({
      icon: route.options.staticData?.icon,
      id: route.id,
      title: route.options.staticData?.title ?? route.fullPath,
      to: route.fullPath,
    }));
}

export { useRouteEntries };
export type { RouteEntry };
