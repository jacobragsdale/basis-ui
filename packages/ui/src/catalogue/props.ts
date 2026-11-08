/* A component's props, as the component catalogue lists them: the ones it declares itself, with their types and docs;
 * the types whose props it also takes, such as Base UI's; and its variants, read from the `cva` call that styles it. */

import { child, children, docComment, nameOf, summary, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { lookup } from "./modules.ts";
import type { Found } from "./modules.ts";

/** One prop a component declares itself. */
interface CatalogueProp {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly description: string;
}

/** One variant: its options, and the one used when it is not set. */
interface CatalogueVariant {
  readonly options: readonly string[];
  readonly default: string | null;
}

interface PropsShape {
  readonly props: CatalogueProp[];
  readonly extends: string[];
  readonly variants: Record<string, CatalogueVariant>;
}

/** How deep a type's references are followed before it is listed as written. */
const maxDepth = 8;

function emptyShape(): PropsShape {
  return { extends: [], props: [], variants: {} };
}

function propOf(file: ParsedFile, member: Node): CatalogueProp | undefined {
  const name = nameOf(child(member, "key"));
  const annotation = child(member, "typeAnnotation");
  const type = annotation === undefined ? undefined : child(annotation, "typeAnnotation");
  if (member.type !== "TSPropertySignature" || name === undefined) {
    return undefined;
  }
  return {
    description: summary(docComment(file, member)),
    name,
    optional: member["optional"] === true,
    type: type === undefined ? "unknown" : text(file, type),
  };
}

function addProps(shape: PropsShape, props: readonly CatalogueProp[]): void {
  for (const prop of props) {
    if (!shape.props.some((known) => known.name === prop.name)) {
      shape.props.push(prop);
    }
  }
}

function addMembers(file: ParsedFile, members: readonly Node[], shape: PropsShape): void {
  addProps(
    shape,
    members.flatMap((member) => propOf(file, member) ?? []),
  );
}

function property(object: Node | undefined, key: string): Node | undefined {
  const entry =
    object === undefined
      ? undefined
      : children(object, "properties").find((candidate) => nameOf(child(candidate, "key")) === key);
  return entry === undefined ? undefined : child(entry, "value");
}

/** The `cva` call's options, `{ variants, defaultVariants }`, that the variable `found` holds. */
function cvaOptions(found: Found | undefined): Node | undefined {
  const declarator =
    found?.node.type === "VariableDeclaration"
      ? children(found.node, "declarations")[0]
      : undefined;
  const init = declarator === undefined ? undefined : child(declarator, "init");
  const options = init?.type === "CallExpression" ? children(init, "arguments")[1] : undefined;
  return options?.type === "ObjectExpression" ? options : undefined;
}

/** A `cva` call's variant: its options, and the default `defaults` names for it. */
function variantOf(
  variant: Node,
  defaults: Node | undefined,
): [string, CatalogueVariant] | undefined {
  const key = nameOf(child(variant, "key"));
  const value = child(variant, "value");
  if (key === undefined || value === undefined) {
    return undefined;
  }
  const options = children(value, "properties").flatMap(
    (option) => nameOf(child(option, "key")) ?? [],
  );
  return [key, { default: nameOf(property(defaults, key)) ?? null, options }];
}

/** Adds the variants of the `cva` call `name` holds, as `file` sees it, or returns `false` if it is not one. */
function addVariants(file: ParsedFile, name: string, shape: PropsShape): boolean {
  const options = cvaOptions(lookup(file, name));
  if (options === undefined) {
    return false;
  }
  const defaults = property(options, "defaultVariants");
  const variants = children(property(options, "variants") ?? options, "properties");
  Object.assign(
    shape.variants,
    Object.fromEntries(
      variants.flatMap((variant) => {
        const entry = variantOf(variant, defaults);
        return entry === undefined ? [] : [entry];
      }),
    ),
  );
  return true;
}

interface Walk {
  readonly file: ParsedFile;
  readonly shape: PropsShape;
  readonly depth: number;
}

type Collect = (node: Node, walk: Walk) => void;

/** A union's props, as modes such as a single or a multiple picker: every member's, optional unless each requires it. */
function collectUnion(node: Node, walk: Walk, recurse: Collect): void {
  const shapes = children(node, "types").map((part) => {
    const partShape = emptyShape();
    recurse(part, { ...walk, depth: walk.depth + 1, shape: partShape });
    return partShape;
  });
  const required = (name: string): boolean =>
    shapes.every((other) => other.props.some((prop) => prop.name === name && !prop.optional));
  for (const partShape of shapes) {
    walk.shape.extends.push(...partShape.extends);
    Object.assign(walk.shape.variants, partShape.variants);
    addProps(
      walk.shape,
      partShape.props.map((prop) =>
        Object.assign(structuredClone(prop), { optional: !required(prop.name) }),
      ),
    );
  }
}

/** An interface's props: the types it extends, then its own members. */
function collectInterface(found: Found, walk: Walk, recurse: Collect): void {
  const next = { ...walk, depth: walk.depth + 1, file: found.file };
  for (const heritage of children(found.node, "extends")) {
    recurse(
      { ...heritage, type: "TSTypeReference", typeName: child(heritage, "expression") },
      next,
    );
  }
  addMembers(found.file, children(child(found.node, "body") ?? found.node, "body"), walk.shape);
}

/** A declaration's props: an interface's, or a type alias's type's. */
function collectDeclaration(found: Found, walk: Walk, recurse: Collect): void {
  if (found.node.type === "TSInterfaceDeclaration") {
    collectInterface(found, walk, recurse);
    return;
  }
  const type =
    found.node.type === "TSTypeAliasDeclaration" ? child(found.node, "typeAnnotation") : undefined;
  if (type === undefined) {
    walk.shape.extends.push(text(found.file, found.node));
    return;
  }
  recurse(type, { ...walk, depth: walk.depth + 1, file: found.file });
}

/** A type reference's props: a `cva` call's variants, a package type's props, or the type as written. */
function collectReference(node: Node, walk: Walk, recurse: Collect): void {
  const reference = text(walk.file, node);
  const variants = /^VariantProps<typeof (?<name>\w+)>$/u.exec(reference)?.groups?.["name"];
  if (variants !== undefined && addVariants(walk.file, variants, walk.shape)) {
    return;
  }
  const name = nameOf(child(node, "typeName"));
  const found = variants === undefined && name !== undefined ? lookup(walk.file, name) : undefined;
  if (found === undefined) {
    walk.shape.extends.push(reference);
    return;
  }
  collectDeclaration(found, walk, recurse);
}

/** Adds what the type `node` holds to the walk's shape. */
function collect(node: Node, walk: Walk): void {
  const inner = child(node, "typeAnnotation");
  if (walk.depth > maxDepth) {
    walk.shape.extends.push(text(walk.file, node));
  } else if (node.type === "TSIntersectionType") {
    for (const part of children(node, "types")) {
      collect(part, { ...walk, depth: walk.depth + 1 });
    }
  } else if (node.type === "TSUnionType") {
    collectUnion(node, walk, collect);
  } else if (node.type === "TSTypeLiteral") {
    addMembers(walk.file, children(node, "members"), walk.shape);
  } else if (node.type === "TSParenthesizedType" && inner !== undefined) {
    collect(inner, { ...walk, depth: walk.depth + 1 });
  } else if (node.type === "TSTypeReference") {
    collectReference(node, walk, collect);
  } else {
    walk.shape.extends.push(text(walk.file, node));
  }
}

/** The props of the function `fn` declares in `file`, read from its first parameter's type. */
function propsOf(file: ParsedFile, fn: Node): PropsShape {
  const shape = emptyShape();
  const [parameter] = children(fn, "params");
  const annotation = parameter === undefined ? undefined : child(parameter, "typeAnnotation");
  const type = annotation === undefined ? undefined : child(annotation, "typeAnnotation");
  if (type !== undefined) {
    collect(type, { depth: 0, file, shape });
  }
  return shape;
}

export { emptyShape, propsOf };
export type { CatalogueProp, CatalogueVariant, PropsShape };
