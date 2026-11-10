/* How a module exports and imports names, read from its syntax tree: each name it exports, as a local name, from another
 * module, or as another module whole; the modules it re-exports whole; and each name it imports. */

import { child, children, nameOf } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { declaredNames } from "./declarations.ts";

/** How a module exports or imports a name: as a local name, from another module, or as another module whole. */
type Binding =
  | { readonly local: string }
  | { readonly from: string; readonly imported: string }
  | { readonly namespace: string };

function specifierBindings(statement: Node, from: string | undefined): [string, Binding][] {
  return children(statement, "specifiers").flatMap((specifier): [string, Binding][] => {
    const local = nameOf(child(specifier, "local"));
    const exported = nameOf(child(specifier, "exported")) ?? local;
    if (local === undefined || exported === undefined) {
      return [];
    }
    return [[exported, from === undefined ? { local } : { from, imported: local }]];
  });
}

/** What `statement` exports, by the name it exports it as. */
function exportBindings(statement: Node): [string, Binding][] {
  const from = nameOf(child(statement, "source"));
  if (statement.type === "ExportAllDeclaration") {
    const exported = nameOf(child(statement, "exported"));
    return exported === undefined || from === undefined ? [] : [[exported, { namespace: from }]];
  }
  if (statement.type !== "ExportNamedDeclaration") {
    return [];
  }
  const declaration = child(statement, "declaration");
  return declaration === undefined
    ? specifierBindings(statement, from)
    : declaredNames(declaration).map((name) => [name, { local: name }]);
}

/** Every name `file` exports, and how. */
function exportsOf(file: ParsedFile): Map<string, Binding> {
  return new Map(children(file.program, "body").flatMap((statement) => exportBindings(statement)));
}

/** The modules `file` re-exports whole, with `export * from`. */
function starExports(file: ParsedFile): string[] {
  return children(file.program, "body").flatMap((statement) =>
    statement.type === "ExportAllDeclaration" && child(statement, "exported") === undefined
      ? (nameOf(child(statement, "source")) ?? [])
      : [],
  );
}

function importBinding(specifier: Node, from: string): Binding {
  if (specifier.type === "ImportNamespaceSpecifier") {
    return { namespace: from };
  }
  const imported =
    specifier.type === "ImportDefaultSpecifier" ? "default" : nameOf(child(specifier, "imported"));
  return { from, imported: imported ?? "" };
}

/** The module each local name in `file` is imported from, and the name that module exports it under. */
function imports(file: ParsedFile): Map<string, Binding> {
  const entries = children(file.program, "body")
    .filter((statement) => statement.type === "ImportDeclaration")
    .flatMap((statement) => {
      const from = nameOf(child(statement, "source")) ?? "";
      return children(statement, "specifiers").flatMap((specifier): [string, Binding][] => {
        const local = nameOf(child(specifier, "local"));
        return local === undefined ? [] : [[local, importBinding(specifier, from)]];
      });
    });
  return new Map(entries);
}

export { exportsOf, imports, starExports };
export type { Binding };
