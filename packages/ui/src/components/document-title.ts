/* The browser tab's title, which AppShell keeps to the page shown: the route's `staticData` title, then the app's
 * name, as "Positions · Workbench", or the app's name alone on a route with no title. */

import { useMatches } from "@tanstack/react-router";
import { useEffect } from "react";

/** The tab's title for a page titled `page`, in the app named `app`. */
function documentTitle(page: string | undefined, app: string): string {
  return page === undefined || page === "" ? app : `${page} · ${app}`;
}

/** Keeps `document.title` to the page shown, while the component that calls it is mounted. */
function useDocumentTitle(appName: string): void {
  const page = useMatches({ select: (matches) => matches.at(-1)?.staticData.title });
  useEffect(() => {
    document.title = documentTitle(page, appName);
  }, [page, appName]);
}

export { documentTitle, useDocumentTitle };
