/* The breadcrumbs of the page shown: one for each route matched on the way to it that has a title or a breadcrumb,
 * the last one the page itself. A route's `breadcrumb` titles it by its loader's data, such as a bond's name, over its
 * static `title`; inside AppShell, a Page's `breadcrumb`, from data a query fetched, titles the page's own over both. */

import { Link, useMatches } from "@tanstack/react-router";
import { Fragment, use } from "react";
import type { ReactElement } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb.tsx";
import { PageCrumbContext } from "./page-crumb.ts";

/** One matched route's breadcrumb: its match, where it links, and its text, if it has any. */
interface Crumb {
  readonly id: string;
  readonly path: string;
  readonly title: string | undefined;
}

/** The trail with the page's own breadcrumb, when its Page gives one, as the last matched route's, the page shown's:
 * in place of its title, or as its title when it has none. */
function withPageCrumb(trail: readonly Crumb[], crumb: string | undefined): readonly Crumb[] {
  const leaf = trail.at(-1);
  if (crumb === undefined || leaf === undefined) {
    return trail;
  }
  return [...trail.slice(0, -1), { ...leaf, title: crumb }];
}

/** A match's params, as text by name. */
function paramsOf(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** The trail to the page shown, from the titles its routes set in `staticData`. `AppShell` puts it in the header.
 *
 * @use AppShell shows one in its header; use it alone only in a layout of the app's own. For a trail built by hand, use
 * Breadcrumb.
 * @see AppShell, Breadcrumb, useRouteEntries
 *
 * @example
 * ```tsx
 * import { RouteBreadcrumbs } from "@basis/ui";
 *
 * <RouteBreadcrumbs />;
 * ```
 */
function RouteBreadcrumbs(): ReactElement {
  const pageCrumb = use(PageCrumbContext)?.crumb;
  const matched = useMatches({
    select: (matches) =>
      matches.map((match): Crumb => {
        const { breadcrumb, title: staticTitle } = match.staticData;
        const params = paramsOf(match.params as unknown);
        return {
          id: match.id,
          path: match.pathname,
          title: breadcrumb?.({ loaderData: match.loaderData, params }) ?? staticTitle,
        };
      }),
  });
  const trail = withPageCrumb(matched, pageCrumb).flatMap(({ id, path, title }) =>
    title === undefined ? [] : [{ id, path, title }],
  );
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map(({ id, path, title }, index) => (
          <Fragment key={id}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {index === trail.length - 1 ? (
                <BreadcrumbPage>{title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link to={path} />}>{title}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export { RouteBreadcrumbs };
