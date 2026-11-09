/* The breadcrumbs of the page shown: one for each route matched on the way to it that has a title or a breadcrumb,
 * the last one the page itself. A route's `breadcrumb` titles it by its data, such as a bond's name, over its static
 * `title`. */

import { Link, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";
import type { ReactElement } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb.tsx";

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
 * @example
 * ```tsx
 * import { RouteBreadcrumbs } from "@basis/ui";
 *
 * <RouteBreadcrumbs />;
 * ```
 */
function RouteBreadcrumbs(): ReactElement {
  const trail = useMatches({
    select: (matches) =>
      matches.flatMap((match) => {
        const { breadcrumb, title: staticTitle } = match.staticData;
        const params = paramsOf(match.params as unknown);
        const title = breadcrumb?.({ loaderData: match.loaderData, params }) ?? staticTitle;
        return title === undefined ? [] : [{ id: match.id, path: match.pathname, title }];
      }),
  });
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
