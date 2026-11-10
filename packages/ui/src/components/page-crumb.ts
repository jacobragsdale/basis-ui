/* The page's own breadcrumb: the text a `Page` gives the last breadcrumb from its data, such as a bond's name that a
 * query fetched, which `AppShell` holds and `RouteBreadcrumbs` shows in place of the route's title. A route's
 * `staticData.breadcrumb` does the same from its loader's data; this is for a page whose data a query fetches. A
 * component file exports only components, so the context lives here. */

import { createContext, use, useLayoutEffect } from "react";

interface PageCrumb {
  /** The shown page's breadcrumb, while its Page gives one. */
  readonly crumb: string | undefined;
  readonly setCrumb: (crumb: string | undefined) => void;
}

/** The page's breadcrumb, which AppShell holds; `null` outside it, where a Page's breadcrumb goes nowhere. */
const PageCrumbContext = createContext<PageCrumb | null>(null);

/** Gives the shown page's breadcrumb `crumb` while the component is shown, or leaves the route's while it is
 * `undefined`, as while its data loads. It is set before the browser paints, as the page before it takes its own
 * away, so no page shows another's. */
function usePageCrumb(crumb: string | undefined): void {
  const setCrumb = use(PageCrumbContext)?.setCrumb;
  useLayoutEffect((): (() => void) | undefined => {
    if (setCrumb === undefined || crumb === undefined) {
      return undefined;
    }
    setCrumb(crumb);
    return (): void => {
      setCrumb(undefined);
    };
  }, [setCrumb, crumb]);
}

export { PageCrumbContext, usePageCrumb };
export type { PageCrumb };
