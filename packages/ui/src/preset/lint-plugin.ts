/* The preset's own lint rules, as the Oxlint JS plugin `basis`, for the checks no stock rule makes or whose stock rule
 * could not say what an app should do (docs/design.md, The toolchain, at its strictest): `fetch` and the browser's
 * other network APIs, which `eslint/no-restricted-globals` followed with advice to shadow them; a number with no name,
 * which an app may write inside JSX; rounding by hand to decimals; a comment that turns a check off; Radix's `asChild`,
 * which Base UI's `render` replaces; and a plain element's classes (lint-classes.ts). Each message is one line that starts with `ERROR` and ends with its fix. lint.ts
 * applies them, to app code only. */

import { definePlugin, defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import { bannedFetch, bannedNetwork, clientOnly, showWithComponents } from "./lint-bans.ts";
import { themeClasses } from "./lint-classes.ts";
import { refusal, suppressionIn } from "./suppressions.ts";

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

/** `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`, also as `window.fetch`, unless the module declares one of
 * its own, and `navigator.sendBeacon`, in any file of the app, src/api's included. */
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
        const { object, property } = node;
        if (node.computed || property.type !== "Identifier") {
          return;
        }
        const message = networkMessage(property.name, file);
        const beacon = property.name === "sendBeacon";
        if (
          message !== undefined &&
          (beacon ||
            (object.type === "Identifier" &&
              globalObjects.has(object.name) &&
              readsGlobal(sourceCode, object)))
        ) {
          context.report({ message, node });
        }
      },
    };
  },
  meta: {
    docs: { description: "An app calls its API only through the generated client." },
    type: "problem",
  },
});

/** A comment that turns a check off, but one the allowlist in suppressions.ts names, at the comment. */
const noSuppressions = defineRule({
  create(context) {
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          const suppression = suppressionIn(comment.value);
          const message =
            suppression === undefined ? undefined : refusal(suppression, context.physicalFilename);
          if (message !== undefined) {
            context.report({ message, node: comment });
          }
        }
      },
    };
  },
  meta: {
    docs: { description: "An app turns no check off, but where suppressions.ts allows." },
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

// How `roundToTick` names the rounding of each of Math's integer functions.
const roundings: Readonly<Record<string, string>> = {
  ceil: "ceiling",
  floor: "floor",
  trunc: "toward-zero",
};

/** `Math.ceil(n * 100) / 100`, and the same with `floor` or `trunc`: rounding to decimals by hand, which `Math.round`'s
 * ban does not see. */
const noHandRounding = defineRule({
  create(context) {
    return {
      BinaryExpression(node): void {
        const { left } = node;
        if (node.operator !== "/" || left.type !== "CallExpression") {
          return;
        }
        const [name = "", method = ""] = sourceTextOf(left.callee).split(".");
        const rounding = roundings[method];
        if (
          name !== "Math" ||
          rounding === undefined ||
          left.arguments[0]?.type !== "BinaryExpression"
        ) {
          return;
        }
        context.report({
          message: `ERROR Math.${method}(n * 100) / 100 rounds a number to decimals by hand, which an app never does: ${showWithComponents}, and round a value to a step, as a price to 0.01, with roundToTick(value, 0.01, "${rounding}") from @basis/ui/numbers.`,
          node,
        });
      },
    };
  },
  meta: {
    docs: { description: "An app rounds no number to decimals by hand." },
    type: "problem",
  },
});

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

/** What `asChild` is refused with: shadcn's Radix prop, which Base UI's components, and so @basis/ui's, replace with
 * `render`. */
const asChildMessage =
  "ERROR asChild is Radix's prop, which @basis/ui's components do not take: they are Base UI's, so pass the element to render as, as <DialogTrigger render={<Button variant=\"outline\" />}>Open</DialogTrigger>, with the text inside the component.";

/** `asChild` on any element, as shadcn's Radix examples write it. */
const noAsChild = defineRule({
  create(context) {
    return {
      JSXAttribute(node): void {
        if (node.name.type === "JSXIdentifier" && node.name.name === "asChild") {
          context.report({ message: asChildMessage, node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "A component renders as another element through `render`, not Radix's `asChild`.",
    },
    type: "problem",
  },
});

const plugin = definePlugin({
  meta: { name: "basis" },
  rules: {
    "no-as-child": noAsChild,
    "no-fetch": noFetch,
    "no-hand-rounding": noHandRounding,
    "no-magic-numbers": noMagicNumbers,
    "no-suppressions": noSuppressions,
    "theme-classes": themeClasses,
  },
});

export default plugin;
