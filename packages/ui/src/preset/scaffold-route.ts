/* The route `vp run new` adds to the app's `src/routes.ts`: a route under the shell's root, its page loaded with
 * `lazyRouteComponent` as its own chunk, its title in `staticData` for the sidebar, the breadcrumbs and the command
 * palette, and its name added to the root's children. A routes file in another shape fails with the route to add. */

import { parseSync } from "vite-plus";

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

/** A node of Oxc's syntax tree, as far as the routes file is read. */
interface SyntaxNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string"
  );
}

/** Whether `node` is `rootRoute.addChildren([...])`. */
function isRootChildren(node: SyntaxNode): boolean {
  const { callee, arguments: given } = node;
  return (
    node.type === "CallExpression" &&
    isNode(callee) &&
    callee.type === "MemberExpression" &&
    isNode(callee["object"]) &&
    callee["object"]["name"] === "rootRoute" &&
    isNode(callee["property"]) &&
    callee["property"]["name"] === "addChildren" &&
    Array.isArray(given) &&
    isNode(given[0]) &&
    given[0].type === "ArrayExpression"
  );
}

/** The list of the root's children in the routes file, `[...]` of `rootRoute.addChildren([...])`, and the call. */
function rootChildren(
  node: unknown,
): { readonly call: SyntaxNode; readonly list: SyntaxNode } | undefined {
  if (Array.isArray(node)) {
    return node.map((item) => rootChildren(item)).find((found) => found !== undefined);
  }
  if (!isNode(node)) {
    return undefined;
  }
  const given: unknown = node["arguments"];
  if (isRootChildren(node) && Array.isArray(given) && isNode(given[0])) {
    return { call: node, list: given[0] };
  }
  return Object.entries(node)
    .filter(([key]) => key !== "parent")
    .map(([, value]) => rootChildren(value))
    .find((found) => found !== undefined);
}

/** `text` with `variable` added as the last of the root's own children, after the last one listed, so a child's own
 * `addChildren` and a comment after the last are kept as they are; or `undefined` for a file with no such list. */
function withChild(
  text: string,
  variable: string,
): { readonly text: string; readonly at: number } | undefined {
  const found = rootChildren(parseSync(routesFile, text).program);
  if (found === undefined) {
    return undefined;
  }
  const elements: unknown = found.list["elements"];
  const last = Array.isArray(elements)
    ? elements.findLast((element) => isNode(element))
    : undefined;
  const after = isNode(last) ? last.end : found.list.start + 1;
  const added = isNode(last) ? `, ${variable}` : variable;
  return { at: found.call.start, text: `${text.slice(0, after)}${added}${text.slice(after)}` };
}

/** The routes file with the scaffold's route added, or `undefined` when it holds that route already. */
function withRoute(text: string, scaffold: Scaffold): string | undefined {
  if (hasRoute(text, scaffold)) {
    return undefined;
  }
  const imported = withLazyImport(text);
  const added =
    imported === undefined ? undefined : withChild(imported, `${camel(scaffold.name)}Route`);
  if (added === undefined) {
    throw cannotAdd(
      scaffold,
      rootChildren(parseSync(routesFile, text).program) === undefined
        ? "has no rootRoute.addChildren([...])"
        : "imports nothing from @tanstack/react-router",
    );
  }
  const start = added.text.lastIndexOf("\n", added.at) + 1;
  return `${added.text.slice(0, start)}${routeCode(scaffold)}\n\n${added.text.slice(start)}`;
}

export { routesFile, withRoute };
