/* The routes `vp run shot --all` pictures: every path of the app's TanStack Router, read from the router the page
 * made, which TanStack Router puts on `self.__TSR_ROUTER__` in the browser. A path with a parameter, as
 * `/bonds/$security`, cannot be opened as it stands: a route named on the command line that it matches stands for it,
 * and without one it is skipped, with how to picture it. */

import type { Page } from "playwright";

import { TaskError } from "./task-error.ts";

/** How long the page may take to make its router. */
const routerSeconds = 10;
const millisecondsPerSecond = 1000;

/** The paths of the router the page made, in the router's order, or none while it has made none. */
async function pathsOnPage(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const router: unknown = Reflect.get(globalThis, "__TSR_ROUTER__");
    const paths: unknown =
      typeof router === "object" && router !== null
        ? Reflect.get(router, "routesByPath")
        : undefined;
    return typeof paths === "object" && paths !== null ? Object.keys(paths) : [];
  });
}

/** The router's paths, as the page at `url` made them, in the router's order. */
async function routerPaths(page: Page, url: string): Promise<readonly string[]> {
  await page.goto(url, { waitUntil: "load" });
  try {
    await page.waitForFunction(() => "__TSR_ROUTER__" in globalThis, undefined, {
      timeout: routerSeconds * millisecondsPerSecond,
    });
  } catch {
    throw new TaskError(
      `ERROR --all found no TanStack Router on ${url} within ${String(routerSeconds)} s, so it cannot list the routes: check that vp run shot / pictures the app, or name each route, as vp run shot / /positions.`,
    );
  }
  return pathsOnPage(page);
}

/** A router path as a pattern a concrete route matches: each `$name` one segment, a bare `$` the rest. */
function patternOf(path: string): RegExp {
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment === "$") {
        return ".*";
      }
      return segment.startsWith("$")
        ? "[^/]+"
        : segment.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
    })
    .join("/");
  return new RegExp(`^${pattern}/?$`, "u");
}

/** A router path without the trailing slash TanStack Router gives some, `/` aside. */
function bareOf(path: string): string {
  return path.length > 1 ? path.replace(/\/$/u, "") : path;
}

/** The most routes a line names, so that one for a large router stays one line. */
const namedAtMost = 6;

/** The problem of a route that none of the router's `paths` matches, which shows the router's page not found; none
 * when one does, or when the page made no router to read. */
function unmatchedLine(route: string, paths: readonly string[]): string | undefined {
  const { pathname } = new URL(route, "http://shot.invalid");
  const bare = [...new Set(paths.map((path) => bareOf(path)))];
  if (bare.length === 0 || bare.some((path) => patternOf(path).test(pathname))) {
    return undefined;
  }
  const listed = bare.slice(0, namedAtMost).join(", ");
  const more = bare.length > namedAtMost ? " and more, which vp run shot --all pictures" : "";
  return `ERROR ${route} matches no route of the app's router, so its picture is the page not found: name one of the router's paths, ${listed}${more}, or add the route to src/routes.ts.`;
}

/** The routes to picture: those named, then each of the router's paths that none of them stands for, and the paths
 * skipped for a parameter no named route gives. */
function routesToShoot(
  named: readonly string[],
  paths: readonly string[],
): { readonly routes: readonly string[]; readonly skipped: readonly string[] } {
  const bare = named.map((route) => new URL(route, "http://shot.invalid").pathname);
  const routes = [...named];
  const skipped: string[] = [];
  for (const raw of paths) {
    const path = bareOf(raw);
    const pattern = patternOf(path);
    if (!bare.some((route) => pattern.test(route))) {
      (path.includes("$") ? skipped : routes).push(path);
    }
  }
  return { routes: [...new Set(routes)], skipped: [...new Set(skipped)] };
}

/** The line a skipped path reads as. */
function skippedLine(path: string): string {
  return `skipped ${path}, which takes a parameter: name one of its pages beside --all, as vp run shot --all ${path.replaceAll(/\$[^/]*/gu, "VALUE")}.`;
}

export { pathsOnPage, routerPaths, routesToShoot, skippedLine, unmatchedLine };
