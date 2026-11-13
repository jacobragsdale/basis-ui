/* Where a value `basis/theme-classes` reads comes from (lint-class-read.ts): written in this file, as a constant, an
 * object or array of classes looked up by a key, or a function's own; passed in, as a parameter, which is read where
 * the caller writes it; or from somewhere the lint cannot read, another module or a function's result. */

import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

/** Where a name's value comes from. */
type Origin =
  | { readonly kind: "written"; readonly node: ESTree.Node }
  | { readonly kind: "passed" }
  | { readonly kind: "unread" };

const passed: Origin = { kind: "passed" };
const unread: Origin = { kind: "unread" };

type Variable = ReturnType<SourceCode["getScope"]>["variables"][number];
type Scope = ReturnType<SourceCode["getScope"]>;

/** `node` without what only types it: `as`, `satisfies` and `!`. */
function unwrapped(node: ESTree.Node): ESTree.Node {
  let at = node;
  while (
    at.type === "TSAsExpression" ||
    at.type === "TSSatisfiesExpression" ||
    at.type === "TSNonNullExpression" ||
    at.type === "ParenthesizedExpression"
  ) {
    at = at.expression;
  }
  return at;
}

/** The variable `name` names where `node` stands, if the file declares one. */
function variableAt(sourceCode: SourceCode, node: ESTree.Node, name: string): Variable | undefined {
  for (let scope: Scope | null = sourceCode.getScope(node); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

/** Whether the name at `node` is a function's parameter. */
function isParameter(
  sourceCode: SourceCode,
  node: ESTree.Node & { readonly name: string },
): boolean {
  return variableAt(sourceCode, node, node.name)?.defs[0]?.type === "Parameter";
}

/** Where a variable's value comes from, as its declaration says. */
function declaredOrigin(
  sourceCode: SourceCode,
  declarator: ESTree.Node,
  declaration: ESTree.Node | null,
): Origin {
  if (declarator.type !== "VariableDeclarator") {
    return unread;
  }
  if (declarator.init === null) {
    // A loop's item, as `for (const row of rows)`: one of the data's, read where it is written.
    return passed;
  }
  if (declarator.id.type === "Identifier") {
    return declaration?.type === "VariableDeclaration" && declaration.kind === "const"
      ? { kind: "written", node: declarator.init }
      : unread;
  }
  // A destructured value, as `const { className } = props`: passed when what it comes from was.
  const from = unwrapped(declarator.init);
  return from.type === "Identifier" && isParameter(sourceCode, from) ? passed : unread;
}

/** Where the value of the name at `node` comes from. */
function originOf(sourceCode: SourceCode, node: ESTree.Node & { readonly name: string }): Origin {
  const [definition] = variableAt(sourceCode, node, node.name)?.defs ?? [];
  if (definition === undefined) {
    return node.name === "undefined" ? passed : unread;
  }
  if (definition.type === "Parameter" || definition.type === "CatchClause") {
    return passed;
  }
  if (definition.type === "FunctionName") {
    return { kind: "written", node: definition.node };
  }
  return definition.type === "Variable"
    ? declaredOrigin(sourceCode, definition.node, definition.parent)
    : unread;
}

/** A property's key as text, as `{ bad: … }` or `{ "bad": … }` names it, or `undefined` for a computed one. */
function keyOf(property: ESTree.Node): string | undefined {
  if (property.type !== "Property") {
    return undefined;
  }
  const { key } = property;
  if (!property.computed && key.type === "Identifier") {
    return key.name;
  }
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
}

/** The key a member expression reads, `tone.bad` or `tone["bad"]`, or `undefined` for one chosen at run time. */
function memberKey(node: ESTree.MemberExpression): string | undefined {
  const { property } = node;
  if (!node.computed && property.type === "Identifier") {
    return property.name;
  }
  return property.type === "Literal" && typeof property.value === "string"
    ? property.value
    : undefined;
}

/** An object's or array's values: the one a key names, or every one for a key chosen at run time, each spread read as
 * what it spreads. */
function valuesOf(container: ESTree.Node, key?: string): readonly ESTree.Node[] {
  if (container.type === "ArrayExpression") {
    return container.elements.flatMap((element) => {
      if (element === null) {
        return [];
      }
      return [element.type === "SpreadElement" ? element.argument : element];
    });
  }
  if (container.type !== "ObjectExpression") {
    return [];
  }
  const named = container.properties.filter(
    (property) => key !== undefined && keyOf(property) === key,
  );
  return (named.length > 0 ? named : container.properties).map((property) =>
    property.type === "Property" ? property.value : property.argument,
  );
}

// A chain of constants longer than any a page writes is one that refers to itself.
const deepest = 20;

/** Where the object or array a member, as `styles.cell`, holds is written, each part followed by `follow`. */
function memberContainer(
  node: ESTree.MemberExpression,
  depth: number,
  follow: (value: ESTree.Node, depth: number) => Origin,
): Origin {
  const outer = follow(node.object, depth + 1);
  if (outer.kind !== "written") {
    return outer;
  }
  const [value] = valuesOf(outer.node, memberKey(node));
  return value === undefined ? unread : follow(value, depth + 1);
}

/** Where the object or array `node` reads from is written, followed through constants and members. */
function containerOf(sourceCode: SourceCode, node: ESTree.Node, depth = 0): Origin {
  const at = unwrapped(node);
  const follow = (value: ESTree.Node, deeper: number): Origin =>
    containerOf(sourceCode, value, deeper);
  if (at.type === "ObjectExpression" || at.type === "ArrayExpression") {
    return { kind: "written", node: at };
  }
  if (depth > deepest || at.type === "ThisExpression") {
    return passed;
  }
  if (at.type === "Identifier") {
    const origin = originOf(sourceCode, at);
    return origin.kind === "written" ? follow(origin.node, depth + 1) : origin;
  }
  return at.type === "MemberExpression" ? memberContainer(at, depth, follow) : unread;
}

export { containerOf, keyOf, memberKey, originOf, unwrapped, valuesOf, variableAt };
export type { Origin };
