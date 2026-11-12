/* The named types the catalogue defines: every type an app's modules export, but the props types of their components,
 * which the components' own entries list, and every type that an entry's props, signatures or fields refer to, so that
 * an agent never meets a name it cannot look up. A library's type, such as Base UI's, is defined one level deep. */

import { child, docComment, summary, text } from "./ast.ts";
import type { CatalogueComponent, CatalogueType } from "./format.ts";
import type { Listed } from "./exports.ts";
import { typeDeclaration } from "./modules.ts";
import { declarationFields } from "./props.ts";
import { libraryOf } from "./shape.ts";
import { recordReferences } from "./references.ts";
import type { Reference, References } from "./references.ts";
import { zodDefinition } from "./zod.ts";

/** Where a type's declaration is, as the references key it. */
function keyOf(reference: Pick<Reference, "declaration" | "file">): string {
  return `${reference.file.url.href}#${String(reference.declaration.start)}`;
}

/** The module that exports each type, by where it is declared. */
function exportingModules(
  listed: readonly Listed[],
  references: References,
  skip: ReadonlySet<string>,
): Map<string, string> {
  const modules = new Map<string, string>();
  for (const { module, names } of listed) {
    for (const { entity, isType, name } of names) {
      const declaration = isType ? typeDeclaration(entity) : undefined;
      if (entity !== undefined && declaration !== undefined) {
        const key = keyOf({ declaration, file: entity.file });
        modules.set(key, modules.get(key) ?? module.name);
        if (!skip.has(name) && !references.has(key)) {
          references.set(key, { declaration, file: entity.file, name });
        }
      }
    }
  }
  return modules;
}

/** A type's shape: its fields when it is an object type, and its definition as written when it is not, or when it is a
 * union of object types, whose fields are its members'. A library's type is defined one level deep: the types it names
 * are not followed. */
function shapeOf(reference: Reference, references: References): Partial<CatalogueType> {
  const { declaration, file } = reference;
  const library = libraryOf(file);
  const written = child(declaration, "typeAnnotation");
  if (library === undefined && written !== undefined) {
    // A type written as another, such as `readonly FieldErrorEntry[]`, names that one too.
    recordReferences(file, written, references);
  }
  const shape = declarationFields(
    file,
    declaration,
    library === undefined ? references : new Map(),
  );
  const hasFields = shape.props.length > 0;
  const extended = [...new Set(shape.extends)];
  const definition =
    (written?.type === "TSTypeReference" && !hasFields
      ? zodDefinition(file, written, library === undefined ? references : new Map())
      : undefined) ?? text(file, written ?? declaration);
  return {
    ...(hasFields && written?.type !== "TSUnionType" ? {} : { definition }),
    ...(hasFields && extended.length > 0 ? { extends: extended } : {}),
    ...(hasFields ? { fields: shape.props } : {}),
  };
}

/** One type's entry. */
function typeEntry(
  reference: Reference,
  module: string | undefined,
  references: References,
): CatalogueType {
  const { declaration, file, name } = reference;
  const parameters = child(declaration, "typeParameters");
  return {
    ...shapeOf(reference, references),
    exported: module !== undefined,
    module: module ?? libraryOf(file) ?? file.pkg?.name ?? "",
    name,
    ...(parameters === undefined ? {} : { parameters: text(file, parameters) }),
    purpose: summary(docComment(file, declaration)),
  };
}

/** Every type the catalogue defines, sorted by module and name. */
function describeTypes(
  listed: readonly Listed[],
  components: readonly CatalogueComponent[],
  references: References,
): CatalogueType[] {
  const propsTypes = new Set(components.map((component) => `${component.name}Props`));
  const modules = exportingModules(listed, references, propsTypes);
  const types: CatalogueType[] = [];
  // A Map's iteration visits what is added to it during the loop, so the types each entry names are defined too.
  for (const [key, reference] of references) {
    types.push(typeEntry(reference, modules.get(key), references));
  }
  return types.toSorted(
    (one, other) => one.module.localeCompare(other.module) || one.name.localeCompare(other.name),
  );
}

export { describeTypes };
