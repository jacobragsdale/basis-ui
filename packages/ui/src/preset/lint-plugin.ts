/* The preset's own lint rules, as the Oxlint JS plugin `basis`, for the two checks whose stock rules could not say
 * what an app should do (docs/design.md, The toolchain, at its strictest): `fetch` outside the client layer, which
 * `eslint/no-restricted-globals` followed with advice to shadow it, and a number with no name, which an app may write
 * inside JSX. Each message is one line that starts with `ERROR` and ends with its fix. lint.ts applies them. */

import { definePlugin, defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import { bannedFetch } from "./lint-bans.ts";

// The objects `fetch` is reached through as a property, as `window.fetch`.
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

/** `fetch`, also as `globalThis.fetch` or `window.fetch`, unless the module declares a `fetch` of its own. */
const noFetch = defineRule({
  create(context) {
    const { sourceCode } = context;
    return {
      Identifier(node): void {
        if (node.name === "fetch" && readsGlobal(sourceCode, node)) {
          context.report({ message: bannedFetch.message, node });
        }
      },
      MemberExpression(node): void {
        const { object, property } = node;
        if (
          !node.computed &&
          property.type === "Identifier" &&
          property.name === "fetch" &&
          object.type === "Identifier" &&
          globalObjects.has(object.name) &&
          readsGlobal(sourceCode, object)
        ) {
          context.report({ message: bannedFetch.message, node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Feature code calls the API only through the generated client." },
    type: "problem",
  },
});

// -1, 0, 1, 2 and 100 read as themselves, as in `eslint/no-magic-numbers`'s options in lint.ts.
const plainNumbers = new Set<number | bigint>([-1, 0, 1, 2, 100]);

/** Whether `node` is inside JSX: an attribute's value, a child's expression, or a callback written there. */
function insideJsx(node: ESTree.Node): boolean {
  for (let at: ESTree.Node | null = node.parent; at !== null; at = at.parent) {
    if (at.type === "JSXExpressionContainer" || at.type === "JSXAttribute") {
      return true;
    }
  }
  return false;
}

/** A callee's name as written, such as `Number.parseInt`, or "" for any other expression. */
function sourceTextOf(callee: ESTree.Expression | ESTree.Super): string {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    const object = sourceTextOf(callee.object);
    return object === ""
      ? ""
      : `${object}.${callee.property.type === "Identifier" ? callee.property.name : ""}`;
  }
  return "";
}

/** Whether a number at `node` is named or keyed where it stands, as `eslint/no-magic-numbers` allows: a variable's
 * value, an object's property, an assignment to a property, or `parseInt`'s radix. */
function namedWhereItStands(node: ESTree.Node): boolean {
  const { parent } = node;
  if (parent?.type === "VariableDeclarator" || parent?.type === "Property") {
    return true;
  }
  if (parent?.type === "AssignmentExpression") {
    return parent.left.type !== "Identifier";
  }
  if (parent?.type === "CallExpression") {
    const callee = sourceTextOf(parent.callee);
    return (callee === "parseInt" || callee === "Number.parseInt") && parent.arguments[1] === node;
  }
  return false;
}

/** `eslint/no-magic-numbers` with its options in lint.ts, except that a number inside JSX may stand as itself. */
const noMagicNumbers = defineRule({
  create(context) {
    return {
      Literal(node): void {
        const { value } = node;
        if (typeof value !== "number" && typeof value !== "bigint") {
          return;
        }
        const { parent } = node;
        const negated = parent.type === "UnaryExpression" && parent.operator === "-";
        const whole: ESTree.Node = negated ? parent : node;
        if (
          plainNumbers.has(negated ? -value : value) ||
          insideJsx(whole) ||
          namedWhereItStands(whole)
        ) {
          return;
        }
        const text = context.sourceCode.getText(whole);
        context.report({
          message: `ERROR ${text} is a number with no name: declare it once, as a const named for what it is, and use the name, or write it inside JSX, where a number may stand as itself.`,
          node: whole,
        });
      },
    };
  },
  meta: {
    docs: { description: "A number outside JSX has a name." },
    type: "suggestion",
  },
});

const plugin = definePlugin({
  meta: { name: "basis" },
  rules: { "no-fetch": noFetch, "no-magic-numbers": noMagicNumbers },
});

export default plugin;
