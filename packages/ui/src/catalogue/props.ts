/* A component's props, as the component catalogue lists them: the ones it declares itself and the ones it takes from
 * the types it is built on, Base UI's among them, each with its type, its docs and its default; the types left as
 * written, such as a `<div>`'s props; and its variants, read from the `cva` call that styles it. */

import { child, children, nameOf, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { resolveName, typeDeclaration, valueDeclaration } from "./modules.ts";
import type { Entity } from "./modules.ts";
import type { References } from "./references.ts";
import { addMembers, addProps, deeper, emptyShape, maxDepth, typeText } from "./shape.ts";
import type { PropsShape, Walk } from "./shape.ts";
import { collectUtility, collectZod, typeReference } from "./utilities.ts";
import type { TypeReference } from "./utilities.ts";
import { addVariants } from "./variants.ts";

/** A union's props, as modes such as a single or a multiple picker: every member's, optional unless each requires it,
 * and typed as any member types it, as `selectable?: false` in one and `selectable: true | "single"` in another. */
function collectUnion(node: Node, walk: Walk): void {
  const shapes = children(node, "types").map((part) => {
    const partShape = emptyShape();
    walk.collect(part, deeper(walk, { shape: partShape }));
    return partShape;
  });
  const each = (name: string): PropsShape["props"] =>
    shapes.flatMap((other) => other.props.filter((prop) => prop.name === name));
  const required = (name: string): boolean =>
    shapes.every((other) => other.props.some((prop) => prop.name === name && !prop.optional));
  const typeOf = (name: string): string => {
    const kept = [...new Set(each(name).map((prop) => prop.type))].filter(
      (type) => type !== "undefined",
    );
    return kept.length === 0 ? "undefined" : kept.join(" | ");
  };
  for (const partShape of shapes) {
    walk.shape.extends.push(...partShape.extends);
    Object.assign(walk.shape.variants, partShape.variants);
    const merged = partShape.props.map((prop) =>
      Object.assign(structuredClone(prop), {
        optional: !required(prop.name),
        type: typeOf(prop.name),
      }),
    );
    addProps(walk.shape, merged);
  }
}

/** The arguments of a reference to `declaration`, by its type parameters, defaults filled in. */
function argumentsOf(declaration: Node, reference: Node, walk: Walk): Map<string, string> {
  const given = children(child(reference, "typeArguments"), "params");
  const entries = children(child(declaration, "typeParameters"), "params").flatMap(
    (parameter, index): [string, string][] => {
      const name = nameOf(child(parameter, "name")) ?? "";
      const argument = given[index];
      const fallback = child(parameter, "default");
      if (argument !== undefined) {
        return [[name, typeText(walk, argument)]];
      }
      return fallback === undefined ? [] : [[name, text(walk.file, fallback)]];
    },
  );
  return new Map(entries);
}

/** An interface's props: the types it extends, then its own members. */
function collectInterface(declaration: Node, walk: Walk): void {
  for (const heritage of children(declaration, "extends")) {
    const reference = {
      ...heritage,
      type: "TSTypeReference",
      typeName: child(heritage, "expression"),
    };
    walk.collect(reference, deeper(walk));
  }
  addMembers(children(child(declaration, "body"), "body"), walk);
}

/** The props of the type `reference` names, declared as `declaration` in its file. */
function collectDeclaration(
  declared: { readonly declaration: Node; readonly file: ParsedFile },
  reference: Node,
  walk: Walk,
): void {
  const { declaration, file } = declared;
  const inner = deeper(walk, { arguments: argumentsOf(declaration, reference, walk), file });
  const type = child(declaration, "typeAnnotation");
  if (declaration.type === "TSInterfaceDeclaration") {
    collectInterface(declaration, inner);
  } else if (type === undefined) {
    walk.shape.extends.push(typeText(walk, reference));
  } else {
    walk.collect(type, inner);
  }
}

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
]);

/** The first parameter's type of a function, an arrow or a declared function. */
function parameterType(fn: Node | undefined): Node | undefined {
  const [parameter] = children(fn, "params");
  return child(child(parameter, "typeAnnotation"), "typeAnnotation");
}

/** What a component's declaration holds: its function, or a variable's value. */
function valueOf(declaration: Node): Node | undefined {
  return declaration.type === "VariableDeclaration"
    ? child(children(declaration, "declarations")[0], "init")
    : declaration;
}

/** The props of a component typed as React's, such as Base UI's `ForwardRefExoticComponent<Props>`. */
function annotatedProps(declaration: Node): Node | undefined {
  if (declaration.type !== "VariableDeclaration") {
    return undefined;
  }
  const id = child(children(declaration, "declarations")[0], "id");
  const type = child(child(id, "typeAnnotation"), "typeAnnotation");
  return children(child(type, "typeArguments"), "params")[0];
}

/** Adds the props of a function component, from its first parameter's type, or from a React type it is declared
 * with, and returns whether it is a function: one with no props is a component too, such as `<Toaster />`. */
function collectFunction(declaration: Node, init: Node | undefined, walk: Walk): boolean {
  const type = parameterType(init) ?? annotatedProps(declaration);
  if (type !== undefined) {
    walk.collect(type, walk);
  }
  return type !== undefined || (init !== undefined && functionTypes.has(init.type));
}

/** Adds the props of the component `entity` declares, and returns whether it found a component to read them from:
 * a function, or another component it is, as `Select` is Base UI's `Select.Root`. */
function collectValue(entity: Entity, walk: Walk): boolean {
  const declaration = valueDeclaration(entity);
  if (declaration === undefined || entity.kind !== "declarations" || walk.depth > maxDepth) {
    return false;
  }
  const inner = deeper(walk, { arguments: new Map(), file: entity.file });
  const init = valueOf(declaration);
  if (init?.type === "MemberExpression" || init?.type === "Identifier") {
    const target = resolveName(entity.file, init);
    return target !== undefined && collectValue(target, inner);
  }
  return collectFunction(declaration, init, inner);
}

const elementProps =
  /^(?:React\.)?(?:ComponentProps|ComponentPropsWithRef|ComponentPropsWithoutRef)$/u;
/** Base UI's wrappers of an element's props, whose props are the element's. */
const passThrough = new Set(["WithBaseUIEvent"]);

/** Base UI's wrapper of an element's props, whose props are the element's. */
function collectPassThrough({ args, name }: TypeReference, walk: Walk): boolean {
  const [argument] = args;
  if (!passThrough.has(name) || argument === undefined) {
    return false;
  }
  walk.collect(argument, deeper(walk));
  return true;
}

/** `ComponentProps<"div">`, written as a `<div>`'s props, and `ComponentProps<typeof X>`, which are X's. */
function collectElement({ args, name, node }: TypeReference, walk: Walk): boolean {
  const [argument] = args;
  if (!elementProps.test(name)) {
    return false;
  }
  const component =
    argument?.type === "TSTypeQuery"
      ? resolveName(walk.file, child(argument, "exprName"))
      : undefined;
  if (component === undefined || !collectValue(component, walk)) {
    // An element's props, as `ComponentProps<"div">` whichever way it is written, or of any of several elements.
    const written = argument === undefined ? "" : typeText(walk, argument);
    const tags = /^["']\w+["'](?:\s*\|\s*["']\w+["'])*$/u.test(written)
      ? written.replaceAll("'", '"')
      : undefined;
    walk.shape.extends.push(tags === undefined ? typeText(walk, node) : `ComponentProps<${tags}>`);
  }
  return true;
}

/** `VariantProps<typeof xVariants>`: the `cva` call's variants, or the type as written. */
function collectVariants({ node }: TypeReference, walk: Walk): boolean {
  const name = /^VariantProps<typeof (?<name>\w+)>$/u.exec(text(walk.file, node))?.groups?.["name"];
  if (name !== undefined && !addVariants(walk.file, name, walk.shape)) {
    walk.shape.extends.push(typeText(walk, node));
  }
  return name !== undefined;
}

/** A type this repo or Base UI declares: its props. */
function collectDeclared({ node }: TypeReference, walk: Walk): boolean {
  const entity = resolveName(walk.file, child(node, "typeName"));
  const declaration = typeDeclaration(entity);
  if (entity === undefined || declaration === undefined) {
    return false;
  }
  collectDeclaration({ declaration, file: entity.file }, node, walk);
  return true;
}

/** How a type reference's props are read, in order; one that reads none leaves the type as written. */
const referenceReaders = [
  collectVariants,
  collectZod,
  collectUtility,
  collectPassThrough,
  collectElement,
  collectDeclared,
];

/** How each kind of type adds its props to the walk's shape; any other kind is listed as written. */
const typeReaders: Readonly<Record<string, (node: Node, walk: Walk) => void>> = {
  TSIntersectionType: (node, walk) => {
    for (const part of children(node, "types")) {
      walk.collect(part, deeper(walk));
    }
  },
  TSParenthesizedType: (node, walk) => {
    const inner = child(node, "typeAnnotation");
    if (inner !== undefined) {
      walk.collect(inner, deeper(walk));
    }
  },
  TSTypeLiteral: (node, walk) => {
    addMembers(children(node, "members"), walk);
  },
  TSTypeReference: (node, walk) => {
    const reference = typeReference(walk, node);
    if (!referenceReaders.some((read) => read(reference, walk))) {
      walk.shape.extends.push(typeText(walk, node));
    }
  },
  TSUnionType: collectUnion,
};

/** Adds what the type `node` holds to the walk's shape. */
function collect(node: Node, walk: Walk): void {
  const read = walk.depth > maxDepth ? undefined : typeReaders[node.type];
  if (read === undefined) {
    walk.shape.extends.push(typeText(walk, node));
  } else {
    read(node, walk);
  }
}

function startWalk(file: ParsedFile, references: References): Walk {
  return { arguments: new Map(), collect, depth: 0, file, references, shape: emptyShape() };
}

/** The props of the component `entity` declares, or `undefined` when it is no component the catalogue can read. */
function componentProps(entity: Entity, references: References): PropsShape | undefined {
  const walk = startWalk(entity.file, references);
  return collectValue(entity, walk) ? walk.shape : undefined;
}

/** The fields of the interface or type alias `declaration` in `file`, as a type's entry lists them. */
function declarationFields(
  file: ParsedFile,
  declaration: Node,
  references: References,
): PropsShape {
  const walk = startWalk(file, references);
  const type = child(declaration, "typeAnnotation");
  if (declaration.type === "TSInterfaceDeclaration") {
    collectInterface(declaration, walk);
  } else if (type !== undefined) {
    collect(type, walk);
  }
  return walk.shape;
}

export { componentProps, declarationFields };
export type { PropsShape } from "./shape.ts";
