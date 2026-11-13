/* `basis/theme-classes`: what a plain element's classes may not do, where @shadcn/lint's rules look only at a
 * component's or let a class pass that Tailwind can generate (docs/design.md, The toolchain, at its strictest): a
 * `dark:` variant, `!important`, a selector that styles other elements, a filter, black or white, and a class built
 * at run time. Each message is one line that starts with `ERROR` and ends with its fix. lint-plugin.ts registers it. */

import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import { functionOf, readClasses } from "./lint-class-read.ts";
import type { ClassReader, Reading } from "./lint-class-read.ts";
import { containerOf, keyOf, variableAt } from "./lint-class-values.ts";
import { arbitraryValue, rawColour } from "./lint-messages.ts";

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

const hexOrPalette =
  /(?:#[\da-f]{3,8}\b|-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b)/iu;

/** What is wrong with a class @shadcn/lint's rules cannot see, reached through a key chosen at run time or a helper:
 * a palette colour or hex value, and a value off the theme's scales, which its rules refuse where they see them. */
function hiddenProblem(token: string): string | undefined {
  const utility = partsOf(token).at(-1) ?? "";
  if (hexOrPalette.test(utility)) {
    return rawColour.replace("{{className}}", token);
  }
  return utility.includes("[")
    ? arbitraryValue
        .replace("{{className}}", token)
        .replace(/\{\{suggestions\|(?<fallback>[^}]*)\}\}/u, "$<fallback>")
    : undefined;
}

const builtAtRunTime =
  'ERROR a class built at run time, as from a template string, is one no check can read and Tailwind may never generate: write each class whole and choose between them with a condition, as cn("p-2", wide && "p-4") with cn from @basis/ui.';

const cannotRead =
  'ERROR these classes come from another module or a function\'s result, where neither the lint nor Tailwind can read them: write them in this file, whole, inline or in a constant or an object of classes, and choose between them with a condition, as cn("p-2", wide && "p-4") with cn from @basis/ui.';

/** Whether a JSX attribute names an element's classes. */
function isClassAttribute(node: ESTree.JSXAttribute): boolean {
  return (
    node.name.type === "JSXIdentifier" &&
    (node.name.name === "className" || node.name.name === "class")
  );
}

/** The name an element's tag starts with: `div`, or `Panel` of `<Panel.Body>`. */
function rootName(name: ESTree.JSXElementName): ESTree.JSXIdentifier {
  if (name.type === "JSXMemberExpression") {
    return name.object.type === "JSXIdentifier" ? name.object : rootName(name.object);
  }
  return name.type === "JSXNamespacedName" ? name.name : name;
}

/** Whether `element` is one of @basis/ui's or @basis/parallax's components, whose classes @shadcn/lint's rules read
 * against what each component lets an app change. A plain element, as `div`, and the app's own components, which
 * pass their classes on to one, are this rule's. */
function isFrameworkComponent(sourceCode: SourceCode, element: ESTree.JSXOpeningElement): boolean {
  const root = rootName(element.name);
  if (/^[a-z]/u.test(root.name) && element.name.type !== "JSXMemberExpression") {
    return false;
  }
  const [definition] = variableAt(sourceCode, root, root.name)?.defs ?? [];
  return (
    definition?.type === "ImportBinding" &&
    definition.parent?.type === "ImportDeclaration" &&
    definition.parent.source.value.startsWith("@basis/")
  );
}

/** The class value an element's attribute or spread gives, if it gives one: `className={…}`, or the `className` of
 * an object written in the file and spread onto it. */
function classValueOf(
  sourceCode: SourceCode,
  node: ESTree.JSXAttribute | ESTree.JSXSpreadAttribute,
): readonly ESTree.Node[] {
  if (node.type === "JSXAttribute") {
    return isClassAttribute(node) && node.value !== null ? [node.value] : [];
  }
  const container = containerOf(sourceCode, node.argument);
  if (container.kind !== "written" || container.node.type !== "ObjectExpression") {
    return [];
  }
  return container.node.properties.flatMap((property) => {
    const key = keyOf(property);
    return property.type === "Property" && (key === "className" || key === "class")
      ? [property.value]
      : [];
  });
}

/** What reading reports, each problem once at the node it is written at, however many elements use it. */
function readerFor(report: (node: ESTree.Node, message: string) => void): ClassReader {
  return {
    built: (at) => {
      report(at, builtAtRunTime);
    },
    found: (at, value, hidden) => {
      for (const token of value.split(/\s+/u).filter((part) => part !== "")) {
        const message = classProblem(token) ?? (hidden ? hiddenProblem(token) : undefined);
        if (message !== undefined) {
          report(at, message);
        }
      }
    },
    unread: (at) => {
      report(at, cannotRead);
    },
  };
}

/** A plain element's classes are the theme's, written whole, wherever the file writes them. */
const themeClasses = defineRule({
  create(context) {
    const { sourceCode } = context;
    const returns = new Map<ESTree.Node, ESTree.Node[]>();
    const attributes: (ESTree.JSXAttribute | ESTree.JSXSpreadAttribute)[] = [];
    const reported = new Set<string>();
    const reader = readerFor((node, message) => {
      const key = `${String(node.start)}:${message}`;
      if (!reported.has(key)) {
        reported.add(key);
        context.report({ message, node });
      }
    });
    return {
      JSXAttribute(node): void {
        attributes.push(node);
      },
      JSXSpreadAttribute(node): void {
        attributes.push(node);
      },
      // A helper may be declared below the element that calls it, so the classes are read once its returns are known.
      "Program:exit"(): void {
        const reading: Reading = { hidden: false, reader, returns, seen: new Map(), sourceCode };
        for (const node of attributes) {
          const { parent } = node;
          if (parent.type === "JSXOpeningElement" && !isFrameworkComponent(sourceCode, parent)) {
            for (const value of classValueOf(sourceCode, node)) {
              readClasses(reading, value);
            }
          }
        }
      },
      ReturnStatement(node): void {
        const owner = functionOf(node);
        if (owner !== undefined && node.argument !== null) {
          returns.set(owner, [...(returns.get(owner) ?? []), node.argument]);
        }
      },
    };
  },
  meta: {
    docs: { description: "A plain element's classes are the theme's, written whole." },
    type: "problem",
  },
});

export { classProblem, themeClasses };
