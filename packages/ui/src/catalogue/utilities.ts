/* TypeScript's utility types over props, as the component catalogue reads them: `Omit`, `Pick`, `Partial`, `Required`
 * and `Readonly` of a type whose props it lists, and Zod's `z.input`, `z.output` and `z.infer` of a schema. */

import { child, children, text } from "./ast.ts";
import type { Node } from "./ast.ts";
import type { CatalogueProp } from "./format.ts";
import { addProps, deeper, emptyShape, typeText } from "./shape.ts";
import type { PropsShape, Walk } from "./shape.ts";
import { zodFields } from "./zod.ts";

/** A type reference, with its name and its type arguments. */
interface TypeReference {
  readonly node: Node;
  readonly name: string;
  readonly args: readonly Node[];
}

const utilities = new Set(["Omit", "Partial", "Pick", "Readonly", "Required"]);
const zodTypes = /^z\.(?:input|output|infer)$/u;

/** The string literals a type holds, such as the keys of `Omit<T, "a" | "b">`. */
function literalKeys(walk: Walk, node: Node | undefined): Set<string> {
  const source = node === undefined ? "" : typeText(walk, node);
  return new Set(
    [...source.matchAll(/["'](?<key>[^"']+)["']/gu)].map((match) => match.groups?.["key"] ?? ""),
  );
}

/** Whether a utility keeps a prop: `Omit` drops its keys, `Pick` keeps only them, and the rest keep every prop. */
function keeps(name: string, keys: ReadonlySet<string>, prop: string): boolean {
  if (name === "Omit") {
    return !keys.has(prop);
  }
  return name !== "Pick" || keys.has(prop);
}

/** What a utility leaves as written: an `Omit` of what it wraps, kept in this repo's source and dropped in a
 * library's; a `Pick` itself, when the catalogue lists only some of its keys, such as an element's props. */
function leftAsWritten(reference: TypeReference, inner: PropsShape, walk: Walk): string[] {
  const [, keysNode] = reference.args;
  if (reference.name === "Pick") {
    const listed = new Set([
      ...inner.props.map((prop) => prop.name),
      ...Object.keys(inner.variants),
    ]);
    const keys = [...literalKeys(walk, keysNode)];
    return keys.some((key) => !listed.has(key)) ? [typeText(walk, reference.node)] : [];
  }
  const keepOmit =
    reference.name === "Omit" && keysNode !== undefined && walk.file.pkg !== undefined;
  return inner.extends.map((type) =>
    keepOmit ? `Omit<${type}, ${typeText(walk, keysNode)}>` : type,
  );
}

/** The props a utility keeps of those its type lists, made optional or required as it says. */
function keptProps(reference: TypeReference, inner: PropsShape, walk: Walk): CatalogueProp[] {
  const keys = literalKeys(walk, reference.args[1]);
  const optional =
    reference.name === "Required" ? false : reference.name === "Partial" || undefined;
  return inner.props
    .filter((prop) => keeps(reference.name, keys, prop.name))
    .map((prop) => Object.assign(structuredClone(prop), { optional: optional ?? prop.optional }));
}

/** The variants a utility keeps, since a variant is a prop too: `Pick<VariantProps<typeof buttonVariants>,
 * "variant">` keeps Button's `variant` alone. */
function keptVariants(
  reference: TypeReference,
  inner: PropsShape,
  walk: Walk,
): PropsShape["variants"] {
  const keys = literalKeys(walk, reference.args[1]);
  return Object.fromEntries(
    Object.entries(inner.variants).filter(([name]) => keeps(reference.name, keys, name)),
  );
}

/** `Omit`, `Pick`, `Partial`, `Required` and `Readonly` of a type whose props the catalogue lists. */
function collectUtility(reference: TypeReference, walk: Walk): boolean {
  const [target] = reference.args;
  if (!utilities.has(reference.name) || target === undefined) {
    return false;
  }
  const inner = emptyShape();
  walk.collect(target, deeper(walk, { shape: inner }));
  const kept = keptProps(reference, inner, walk);
  addProps(walk.shape, kept);
  Object.assign(walk.shape.variants, keptVariants(reference, inner, walk));
  walk.shape.extends.push(...leftAsWritten(reference, { ...inner, props: kept }, walk));
  return true;
}

/** The fields of `z.input<typeof schema>` and its kin, read from the schema. */
function collectZod(reference: TypeReference, walk: Walk): boolean {
  const fields = zodTypes.test(reference.name)
    ? zodFields(walk.file, reference.node, walk.references)
    : undefined;
  if (fields !== undefined) {
    addProps(walk.shape, fields);
  }
  return fields !== undefined;
}

/** A reference as the handlers read it. */
function typeReference(walk: Walk, node: Node): TypeReference {
  const typeName = child(node, "typeName");
  return {
    args: children(child(node, "typeArguments"), "params"),
    name: typeName === undefined ? "" : text(walk.file, typeName),
    node,
  };
}

export { collectUtility, collectZod, typeReference };
export type { TypeReference };
