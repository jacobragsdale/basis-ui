/* `basis/no-fetch`: an app calls its API only through the generated client (docs/design.md, The toolchain, at its
 * strictest), so `fetch` and the browser's other network APIs are refused, read as globals or through the global
 * object, as `window.fetch`, an alias of it, as `const w = window`, or destructured from it, as
 * `const { fetch: send } = globalThis`. Each message is one line that starts with `ERROR` and ends with its fix.
 * lint-plugin.ts registers it. */

import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import { bannedFetch, bannedNetwork, clientOnly } from "./lint-bans.ts";
import { unwrapped, variableAt } from "./lint-class-values.ts";

// The objects a network API is reached through as a property, as `window.fetch`.
const globalObjects = new Set(["globalThis", "self", "window"]);

/** Whether `node` reads a global the module does not declare, such as the browser's `fetch`. Oxlint's
 * `isGlobalReference` says no for a global no configured environment names, which `fetch` is not. */
function readsGlobal(sourceCode: SourceCode, node: ESTree.Node): boolean {
  const reference = sourceCode
    .getScope(node)
    .references.find(({ identifier }) => identifier === node);
  if (reference === undefined) {
    return false;
  }
  const { resolved } = reference;
  return resolved === null || (resolved.scope.type === "global" && resolved.defs.length === 0);
}

/** What a network API at `name` is refused with in `file`: `fetch` in the client layer, src/api, is its own case. */
function networkMessage(name: string, file: string): string | undefined {
  if (name === bannedFetch.name) {
    return /[/\\]src[/\\]api[/\\]/u.test(file) ? clientOnly : bannedFetch.message;
  }
  return Object.hasOwn(bannedNetwork, name) ? bannedNetwork[name] : undefined;
}

// How many constants deep an alias of a global object is followed, as `const w = window`.
const aliasDepth = 8;

/** The name a member expression reads, as `fetch` of `window.fetch` or `window["fetch"]`. */
function memberName(node: ESTree.MemberExpression): string | undefined {
  const { property } = node;
  if (!node.computed && property.type === "Identifier") {
    return property.name;
  }
  return property.type === "Literal" && typeof property.value === "string"
    ? property.value
    : undefined;
}

/** The value a constant at `node` is declared with, as `window` of `const w = window`. */
function constantValue(
  sourceCode: SourceCode,
  node: ESTree.Node & { readonly name: string },
): ESTree.Node | null {
  const [definition] = variableAt(sourceCode, node, node.name)?.defs ?? [];
  const declarator = definition?.type === "Variable" ? definition.node : undefined;
  return declarator?.type === "VariableDeclarator" && declarator.id.type === "Identifier"
    ? declarator.init
    : null;
}

/** Whether `node` is the browser's global object, as `window`, `self.window`, `(window as Window)`, or a constant
 * that holds one, as `const w = window`. */
function isGlobalObject(sourceCode: SourceCode, node: ESTree.Node, depth = 0): boolean {
  const at = unwrapped(node);
  if (depth > aliasDepth) {
    return false;
  }
  if (at.type === "MemberExpression") {
    const name = memberName(at) ?? "";
    return globalObjects.has(name) && isGlobalObject(sourceCode, at.object, depth + 1);
  }
  if (at.type !== "Identifier") {
    return false;
  }
  const value = constantValue(sourceCode, at);
  return (
    (globalObjects.has(at.name) && readsGlobal(sourceCode, at)) ||
    (value !== null && isGlobalObject(sourceCode, value, depth + 1))
  );
}

/** `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`, also as `window.fetch`, through an alias of the global
 * object or destructured from it, unless the module declares one of its own, and `navigator.sendBeacon`, in any file
 * of the app, src/api's included. */
const noFetch = defineRule({
  create(context) {
    const { physicalFilename: file, sourceCode } = context;
    return {
      Identifier(node): void {
        const message = node.name === "sendBeacon" ? undefined : networkMessage(node.name, file);
        if (message !== undefined && readsGlobal(sourceCode, node)) {
          context.report({ message, node });
        }
      },
      MemberExpression(node): void {
        const name = memberName(node);
        const message = name === undefined ? undefined : networkMessage(name, file);
        if (
          message !== undefined &&
          (name === "sendBeacon" || isGlobalObject(sourceCode, node.object))
        ) {
          context.report({ message, node });
        }
      },
      VariableDeclarator(node): void {
        if (
          node.id.type !== "ObjectPattern" ||
          node.init === null ||
          !isGlobalObject(sourceCode, node.init)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          const name =
            property.type === "Property" && property.key.type === "Identifier"
              ? property.key.name
              : "";
          const message = networkMessage(name, file);
          if (message !== undefined) {
            context.report({ message, node: property });
          }
        }
      },
    };
  },
  meta: {
    docs: { description: "An app calls its API only through the generated client." },
    type: "problem",
  },
});

export { noFetch };
