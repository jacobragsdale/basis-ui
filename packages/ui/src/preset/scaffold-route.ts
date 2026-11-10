/* The route `vp run new` adds to the app's `src/routes.ts`: a route under the shell's root, its page loaded with
 * `lazyRouteComponent` as its own chunk, its title in `staticData` for the sidebar, the breadcrumbs and the command
 * palette, and its name added to the root's children. A routes file in another shape fails with the route to add. */

import { camel } from "./api-operations.ts";
import type { Scaffold } from "./scaffold-plan.ts";
import { TaskError } from "./task-error.ts";

const routesFile = "src/routes.ts";

/** The route's definition, as the routes file holds it. */
function routeCode(scaffold: Scaffold): string {
  return `const ${camel(scaffold.name)}Route = createRoute({
  component: lazyRouteComponent(async () => import("./pages/${scaffold.name}.tsx"), ${JSON.stringify(scaffold.component)}),
  getParentRoute: () => rootRoute,
  path: ${JSON.stringify(scaffold.routePath)},
  staticData: { title: ${JSON.stringify(scaffold.title)} },
});`;
}

/** The failure for a routes file this cannot add to, with the route to add by hand. */
function cannotAdd(scaffold: Scaffold, reason: string): TaskError {
  const code = routeCode(scaffold).replaceAll(/\s*\n\s*/gu, " ");
  return new TaskError(
    `ERROR ${routesFile} ${reason}, so vp run new cannot add the route to it: add ${code} to it, and ${camel(scaffold.name)}Route to rootRoute.addChildren, then run vp run new again.`,
  );
}

/** `text` with `lazyRouteComponent` imported from the router, or `undefined` when it imports nothing from it. */
function withLazyImport(text: string): string | undefined {
  const routerImport = /import \{(?<names>[^}]*)\} from "@tanstack\/react-router";/u.exec(text);
  if (routerImport === null) {
    return undefined;
  }
  const names = (routerImport.groups?.["names"] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.includes("lazyRouteComponent")) {
    return text;
  }
  const merged = [...names, "lazyRouteComponent"].toSorted().join(", ");
  return text.replace(routerImport[0], `import { ${merged} } from "@tanstack/react-router";`);
}

/** Whether the routes file has the scaffold's route already, or fails when it has another by its name or path. */
function hasRoute(text: string, scaffold: Scaffold): boolean {
  const variable = `${camel(scaffold.name)}Route`;
  const hasVariable = new RegExp(`\\b${variable}\\b`, "u").test(text);
  const hasPath = text.includes(`path: ${JSON.stringify(scaffold.routePath)}`);
  if (hasVariable !== hasPath) {
    throw new TaskError(
      `ERROR ${routesFile} has a route named ${variable} or at ${scaffold.routePath} already: give the page another NAME.`,
    );
  }
  return hasVariable;
}

/** `text` with `code` put at the start of the line that holds `marker`. */
function beforeLineOf(text: string, marker: string, code: string): string {
  const start = text.lastIndexOf("\n", text.indexOf(marker)) + 1;
  return `${text.slice(0, start)}${code}${text.slice(start)}`;
}

/** The routes file with the scaffold's route added, or `undefined` when it holds that route already. */
function withRoute(text: string, scaffold: Scaffold): string | undefined {
  if (hasRoute(text, scaffold)) {
    return undefined;
  }
  const children = /rootRoute\.addChildren\(\[(?<listed>[^\]]*)\]\)/u.exec(text);
  const imported = withLazyImport(text);
  if (children === null || imported === undefined) {
    throw cannotAdd(
      scaffold,
      children === null
        ? "has no rootRoute.addChildren([...])"
        : "imports nothing from @tanstack/react-router",
    );
  }
  const listed = (children.groups?.["listed"] ?? "").trim().replace(/,$/u, "");
  const variable = `${camel(scaffold.name)}Route`;
  const added = imported.replace(
    children[0],
    `rootRoute.addChildren([${listed === "" ? "" : `${listed}, `}${variable}])`,
  );
  return beforeLineOf(added, "rootRoute.addChildren(", `${routeCode(scaffold)}\n\n`);
}

export { routesFile, withRoute };
