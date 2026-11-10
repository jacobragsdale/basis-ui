/* `basis/theme-classes`: what a plain element's classes may not do, where @shadcn/lint's rules look only at a
 * component's or let a class pass that Tailwind can generate (docs/design.md, The toolchain, at its strictest): a
 * `dark:` variant, `!important`, a selector that styles other elements, a filter, black or white, and a class built
 * at run time. Each message is one line that starts with `ERROR` and ends with its fix. lint-plugin.ts registers it. */

import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";

import { rawColour } from "./lint-messages.ts";

/** A class split at its variants' colons, outside brackets: `dark:hover:bg-muted` is `dark`, `hover`, `bg-muted`. */
function partsOf(token: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token.charAt(index);
    depth += Number("[(".includes(char)) - Number("])".includes(char));
    if (char === ":" && depth === 0) {
      parts.push(token.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, token.slice(start)];
}

const filters =
  /^-?(?:grayscale|invert|sepia|brightness|contrast|saturate|hue-rotate|blur|backdrop|filter)(?:-|$)/u;
const blackOrWhite =
  /^(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|decoration|caret|accent|placeholder|from|via|to)-(?:black|white)(?:\/.*)?$/u;

/** One class, read: its variants, and its utility with any `!` removed. */
interface ClassParts {
  readonly variants: readonly string[];
  readonly utility: string;
  readonly bare: string;
}

/** What a plain element's class may not do, each with its one line, in the order they are asked. */
const classRules: readonly {
  readonly breaks: (parts: ClassParts) => boolean;
  readonly message: (token: string) => string;
}[] = [
  {
    breaks: ({ variants }) => variants.includes("dark"),
    message: (token) =>
      `ERROR "${token}" sets a look for dark mode, and every token of @basis/ui's theme already follows the user's mode: drop the dark: variant and write the token alone, as bg-muted, which is right in both.`,
  },
  {
    breaks: ({ variants }) =>
      variants.some((variant) => variant.startsWith("[") || variant === "*" || variant === "**"),
    message: (token) =>
      `ERROR "${token}" styles other elements through a selector, where no check can see them: put the class on each element it is for, or render them with a component whose variant gives the look.`,
  },
  {
    breaks: ({ utility }) =>
      utility.startsWith("!") || (utility.endsWith("!") && utility.length > 1),
    message: (token) =>
      `ERROR "${token}" forces its style with !important over the theme's: drop the !, and where a component's own style wins, set its variant or size instead, as vp run docs NAME shows them.`,
  },
  {
    breaks: ({ bare }) => filters.test(bare) && !bare.endsWith("-none"),
    message: (token) =>
      `ERROR "${token}" is a filter, which a Citrix desktop draws on the CPU, standing in for a colour the theme has a token for: use text-muted-foreground or bg-muted for something dimmed, and opacity-disabled for something off.`,
  },
  {
    breaks: ({ bare }) => blackOrWhite.test(bare),
    message: (token) => rawColour.replace("{{className}}", token),
  },
];

/** What is wrong with one class on a plain element, as its one line, or `undefined` for a class the theme allows. */
function classProblem(token: string): string | undefined {
  const parts = partsOf(token);
  const utility = parts.at(-1) ?? "";
  const read = { bare: utility.replace(/^!/u, ""), utility, variants: parts.slice(0, -1) };
  return classRules.find(({ breaks }) => breaks(read))?.message(token);
}

const builtAtRunTime =
  'ERROR a class built at run time, as from a template string, is one no check can read and Tailwind may never generate: write each class whole and choose between them with a condition, as cn("p-2", wide && "p-4").';

/** Whether a JSX attribute names an element's classes. */
function isClassAttribute(node: ESTree.JSXAttribute): boolean {
  return (
    node.name.type === "JSXIdentifier" &&
    (node.name.name === "className" || node.name.name === "class")
  );
}

/** Whether the attribute is on a plain element, such as `div`, whose name starts in lower case. */
function onPlainElement(node: ESTree.JSXAttribute): boolean {
  const { parent } = node;
  return (
    parent.type === "JSXOpeningElement" &&
    parent.name.type === "JSXIdentifier" &&
    /^[a-z]/u.test(parent.name.name)
  );
}

/** What reading a class expression reports: a class string found, or a class built at run time. */
interface ClassReader {
  readonly found: (node: ESTree.Node, value: string) => void;
  readonly built: (node: ESTree.Node) => void;
}

/** Whether a call is an array's `join`, which builds a class at run time. */
function isJoin({ callee }: ESTree.CallExpression): boolean {
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "join"
  );
}

/** Whether `node` builds a class at run time: a template with a value in it, a `+` or an array's `join`. */
function isBuilt(node: ESTree.Node): boolean {
  return (
    node.type === "BinaryExpression" ||
    (node.type === "TemplateLiteral" && node.expressions.length > 0) ||
    (node.type === "CallExpression" && isJoin(node))
  );
}

/** The parts of a list or a container that hold class strings: an array's elements, an object's keys, as `cn`
 * reads them, and a JSX expression. */
function itemsOf(node: ESTree.Node): readonly ESTree.Node[] {
  if (node.type === "ArrayExpression") {
    return node.elements.filter((element) => element !== null);
  }
  if (node.type === "ObjectExpression") {
    return node.properties.flatMap((property) =>
      property.type === "Property" ? [property.key] : [],
    );
  }
  return node.type === "JSXExpressionContainer" ? [node.expression] : [];
}

/** The parts of `node` that hold class strings: a call's arguments, as `cn`'s, a condition's two sides, and those of
 * `itemsOf`. A name, such as a constant's, holds none here, and is read where it is written. */
function classParts(node: ESTree.Node): readonly ESTree.Node[] {
  if (node.type === "CallExpression") {
    return node.arguments;
  }
  if (node.type === "ConditionalExpression") {
    return [node.consequent, node.alternate];
  }
  return node.type === "LogicalExpression" ? [node.left, node.right] : itemsOf(node);
}

/** Each class string at `node` or in an expression that builds one, such as `cn`'s arguments or a condition's. */
function readClasses(node: ESTree.Node, reader: ClassReader): void {
  if (node.type === "Literal" && typeof node.value === "string") {
    reader.found(node, node.value);
  } else if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    reader.found(node, node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(""));
  } else if (isBuilt(node)) {
    reader.built(node);
  } else {
    for (const part of classParts(node)) {
      readClasses(part, reader);
    }
  }
}

/** A plain element's classes are the theme's, written whole. */
const themeClasses = defineRule({
  create(context) {
    return {
      JSXAttribute(node): void {
        if (!isClassAttribute(node) || !onPlainElement(node) || node.value === null) {
          return;
        }
        readClasses(node.value, {
          built: (at) => {
            context.report({ message: builtAtRunTime, node: at });
          },
          found: (at, value) => {
            for (const token of value.split(/\s+/u).filter((part) => part !== "")) {
              const message = classProblem(token);
              if (message !== undefined) {
                context.report({ message, node: at });
              }
            }
          },
        });
      },
    };
  },
  meta: {
    docs: { description: "A plain element's classes are the theme's, written whole." },
    type: "problem",
  },
});

export { classProblem, themeClasses };
