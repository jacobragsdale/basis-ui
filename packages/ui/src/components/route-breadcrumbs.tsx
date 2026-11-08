/* The breadcrumbs of the page shown: one for each route matched on the way to it that has a title, the last one the
 * page itself. */

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
        const { title } = match.staticData;
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
