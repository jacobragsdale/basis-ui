/* How `basis/theme-classes` reads an element's classes (lint-classes.ts): written in the attribute, or followed to
 * where the file writes them, a constant, an object of classes looked up by a key, or what a helper of the file
 * returns (lint-class-values.ts), so that each class is checked where it is written. `cn(...)` is read as clsx reads
 * it: its strings, its arrays, its objects' keys, and the classes a condition chooses between, never the condition. A
 * value the file does not write, another module's or a function's result, is reported as one the lint cannot read;
 * one a function is passed, as a component's `className` prop, is read where the caller writes it. */

import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  containerOf,
  keyOf,
  memberKey,
  originOf,
  unwrapped,
  valuesOf,
} from "./lint-class-values.ts";
import type { Origin } from "./lint-class-values.ts";

/** What reading an element's classes reports: a class string found, and whether @shadcn/lint's rules miss it, since
 * it is reached through a key chosen at run time or a helper's result; a class built at run time; or a value it
 * cannot follow. */
interface ClassReader {
  readonly found: (node: ESTree.Node, value: string, hidden: boolean) => void;
  readonly built: (node: ESTree.Node) => void;
  readonly unread: (node: ESTree.Node) => void;
}

/** One reading of a file's classes: its scopes, each function's returned values, gathered as the rule visits, what
 * to report, and the values read already, each with whether it was hidden from @shadcn/lint, so that one met twice
 * is read once. */
interface Reading {
  readonly sourceCode: SourceCode;
  readonly returns: ReadonlyMap<ESTree.Node, readonly ESTree.Node[]>;
  readonly reader: ClassReader;
  readonly seen: Map<ESTree.Node, boolean>;
  // Whether @shadcn/lint's rules miss the value being read.
  readonly hidden: boolean;
}

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

/** The function a `return` belongs to: its nearest enclosing one. */
function functionOf(node: ESTree.Node): ESTree.Node | undefined {
  for (let at: ESTree.Node | null = node.parent; at !== null; at = at.parent) {
    if (functionTypes.has(at.type)) {
      return at;
    }
  }
  return undefined;
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
    (node.type === "BinaryExpression" && node.operator === "+") ||
    (node.type === "TemplateLiteral" && node.expressions.length > 0) ||
    (node.type === "CallExpression" && isJoin(node))
  );
}

/** Whether `node` holds no class: a comparison or a negation, which `cn` drops as a boolean, a number, `null`, or an
 * empty JSX expression. */
function holdsNoClass(node: ESTree.Node): boolean {
  return (
    node.type === "BinaryExpression" ||
    node.type === "UnaryExpression" ||
    node.type === "JSXEmptyExpression" ||
    (node.type === "Literal" && typeof node.value !== "string")
  );
}

/** The values a helper of this file returns, or `undefined` for a value that is no function. */
function returnedBy(reading: Reading, written: ESTree.Node): readonly ESTree.Node[] | undefined {
  const helper = unwrapped(written);
  if (helper.type === "ArrowFunctionExpression" && helper.expression) {
    return [helper.body];
  }
  return functionTypes.has(helper.type) ? (reading.returns.get(helper) ?? []) : undefined;
}

/** What a call gives as classes: `cn`'s arguments, or the values a helper of this file returns. */
function callParts(
  reading: Reading,
  node: ESTree.CallExpression,
): readonly ESTree.Node[] | undefined {
  const { callee } = node;
  if (callee.type !== "Identifier") {
    return undefined;
  }
  if (callee.name === "cn") {
    return node.arguments.map((argument) =>
      argument.type === "SpreadElement" ? argument.argument : argument,
    );
  }
  const origin = originOf(reading.sourceCode, callee);
  return origin.kind === "written" ? returnedBy(reading, origin.node) : undefined;
}

/** An object's keys, as `cn` reads them, each a class: a written one is reported found, a computed one returned. */
function keysOf(reading: Reading, node: ESTree.ObjectExpression): readonly ESTree.Node[] {
  return node.properties.flatMap((property) => {
    if (property.type !== "Property") {
      return [property.argument];
    }
    const key = keyOf(property);
    if (key !== undefined) {
      reading.reader.found(property.key, key, reading.hidden);
      return [];
    }
    return property.computed ? [property.key] : [];
  });
}

/** Where a name or a member that holds classes is written, or `unread` for any other value. */
function referenceOrigin(reading: Reading, node: ESTree.Node): Origin {
  if (node.type === "Identifier") {
    return originOf(reading.sourceCode, node);
  }
  return node.type === "MemberExpression"
    ? containerOf(reading.sourceCode, node.object)
    : { kind: "unread" };
}

/** The parts of a name or a member that hold classes: what it is written as, nothing for a value passed in, or
 * `undefined` for one the lint cannot read. */
function referenceParts(reading: Reading, node: ESTree.Node): readonly ESTree.Node[] | undefined {
  const origin = referenceOrigin(reading, node);
  if (origin.kind !== "written") {
    return origin.kind === "passed" ? [] : undefined;
  }
  return node.type === "MemberExpression" ? valuesOf(origin.node, memberKey(node)) : [origin.node];
}

/** The classes a condition chooses between, never the condition: `wide && "p-4"` chooses `p-4` by `wide`, which is
 * no class itself. */
function choicesOf(node: ESTree.Node): readonly ESTree.Node[] | undefined {
  if (node.type === "ConditionalExpression") {
    return [node.consequent, node.alternate];
  }
  if (node.type !== "LogicalExpression") {
    return undefined;
  }
  return node.operator === "&&" ? [node.right] : [node.left, node.right];
}

/** The classes a container holds: an array's items, an object's keys, as `cn` reads them, and a JSX expression's. */
function containedBy(reading: Reading, node: ESTree.Node): readonly ESTree.Node[] | undefined {
  if (node.type === "ArrayExpression") {
    return valuesOf(node);
  }
  if (node.type === "ObjectExpression") {
    return keysOf(reading, node);
  }
  return node.type === "JSXExpressionContainer" ? [node.expression] : undefined;
}

/** The parts of `node` that hold its classes, or `undefined` for a value the lint cannot read. */
function partsOf(reading: Reading, node: ESTree.Node): readonly ESTree.Node[] | undefined {
  if (holdsNoClass(node)) {
    return [];
  }
  if (node.type === "CallExpression") {
    return callParts(reading, node);
  }
  return choicesOf(node) ?? containedBy(reading, node) ?? referenceParts(reading, node);
}

/** The class string `node` is, if it is one written whole. */
function stringOf(node: ESTree.Node): string | undefined {
  if (node.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  return node.type === "TemplateLiteral" && node.expressions.length === 0
    ? node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("")
    : undefined;
}

/** Whether `node` is a class string or one built at run time, which it reports. */
function reportedItself(reading: Reading, node: ESTree.Node): boolean {
  const text = stringOf(node);
  if (text !== undefined) {
    reading.reader.found(node, text, reading.hidden);
  } else if (isBuilt(node)) {
    reading.reader.built(node);
  }
  return text !== undefined || isBuilt(node);
}

/** The parts of one value that hold classes, once it has reported what it is itself. */
function readOne(reading: Reading, node: ESTree.Node): readonly ESTree.Node[] {
  if (reportedItself(reading, node)) {
    return [];
  }
  const parts = partsOf(reading, node);
  if (parts === undefined) {
    reading.reader.unread(node);
  }
  return parts ?? [];
}

/** Whether what `node` holds is out of @shadcn/lint's sight: an object's value at a key chosen at run time, or what
 * a helper returns. Its rules read `cn`'s arguments and constants, and a member at a key written in the file. */
function hidesClasses(node: ESTree.Node): boolean {
  if (node.type === "MemberExpression") {
    return memberKey(node) === undefined;
  }
  return (
    node.type === "CallExpression" &&
    !(node.callee.type === "Identifier" && node.callee.name === "cn")
  );
}

/** Whether `node` is read already, as hidden from @shadcn/lint as now or more so. */
function readAlready(reading: Reading, node: ESTree.Node, hidden: boolean): boolean {
  const before = reading.seen.get(node);
  return before === true || before === hidden;
}

/** Each class string at `node`, followed to where the file writes it, reported to the reading's reader. */
function readClasses(reading: Reading, node: ESTree.Node): void {
  const pending: [ESTree.Node, boolean][] = [[node, reading.hidden]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [item, hidden] = next;
    const at = unwrapped(item);
    if (!readAlready(reading, at, hidden)) {
      reading.seen.set(at, hidden);
      const hides = hidden || hidesClasses(at);
      const parts = readOne({ ...reading, hidden }, at);
      pending.push(...parts.toReversed().map((part): [ESTree.Node, boolean] => [part, hides]));
    }
  }
}

export { functionOf, readClasses };
export type { ClassReader, Reading };
