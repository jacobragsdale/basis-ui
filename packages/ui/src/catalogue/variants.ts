/* A component's variants, as the component catalogue lists them: read from the `cva` call that styles it, through
 * `VariantProps<typeof xVariants>` in its props, each with its options and its default. */

import { child, children, nameOf } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import type { CatalogueVariant } from "./format.ts";
import { lookup, valueDeclaration } from "./modules.ts";
import type { Entity } from "./modules.ts";
import type { PropsShape } from "./shape.ts";

function property(object: Node | undefined, key: string): Node | undefined {
  const entry = children(object, "properties").find(
    (candidate) => nameOf(child(candidate, "key")) === key,
  );
  return child(entry, "value");
}

/** The `cva` call's options, `{ variants, defaultVariants }`, that the variable `entity` holds. */
function cvaOptions(entity: Entity | undefined): Node | undefined {
  const declaration = valueDeclaration(entity);
  const declarator =
    declaration?.type === "VariableDeclaration"
      ? children(declaration, "declarations")[0]
      : undefined;
  const init = child(declarator, "init");
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

export { addVariants };
