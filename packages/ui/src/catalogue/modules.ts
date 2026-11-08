/* How the component catalogue finds a name's declaration: in the file that uses it, or in the package module it
 * imports it from, under the name that module exports it as. */

import { child, children, nameOf, parseFile, sourceRoot } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";

/** A top-level statement's declaration, unwrapping `export`. */
function declarationIn(statement: Node): Node | undefined {
  return statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
}

/** The names a declaration declares: a function's, an interface's or type's, or each of a variable list's. */
function declaredNames(node: Node): string[] {
  if (node.type === "VariableDeclaration") {
    return children(node, "declarations").flatMap(
      (declarator) => nameOf(child(declarator, "id")) ?? [],
    );
  }
  const named = ["FunctionDeclaration", "TSInterfaceDeclaration", "TSTypeAliasDeclaration"];
  return named.includes(node.type) ? [nameOf(child(node, "id")) ?? []].flat() : [];
}

/** Every top-level declaration in `file`, by the name it declares. */
function declarations(file: ParsedFile): Map<string, Node> {
  const nodes = children(file.program, "body").flatMap(
    (statement) => declarationIn(statement) ?? [],
  );
  return new Map(nodes.flatMap((node) => declaredNames(node).map((name) => [name, node] as const)));
}

interface Imported {
  readonly from: string;
  readonly imported: string;
}

/** The module each local name in `file` is imported from, and the name that module exports it under. */
function imports(file: ParsedFile): Map<string, Imported> {
  const entries = children(file.program, "body")
    .filter((statement) => statement.type === "ImportDeclaration")
    .flatMap((statement) => {
      const from = nameOf(child(statement, "source"));
      return from === undefined
        ? []
        : children(statement, "specifiers").flatMap((specifier) => {
            const local = nameOf(child(specifier, "local"));
            const imported = nameOf(child(specifier, "imported")) ?? local;
            return local === undefined || imported === undefined
              ? []
              : [[local, { from, imported }] as const];
          });
    });
  return new Map(entries);
}

/** The file, from src/, that a module specifier in `file` names, for the package's own modules. */
function resolveModule(file: ParsedFile, specifier: string): string | undefined {
  if (specifier.startsWith("#")) {
    return specifier.slice(1);
  }
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  return new URL(specifier, new URL(file.path, sourceRoot)).pathname.slice(
    sourceRoot.pathname.length,
  );
}

interface Found {
  readonly file: ParsedFile;
  readonly node: Node;
}

/** Where `name`, as `file` sees it, is declared: in `file`, or in the package module it imports it from. */
function lookup(file: ParsedFile, name: string): Found | undefined {
  const local = declarations(file).get(name);
  if (local !== undefined) {
    return { file, node: local };
  }
  const imported = imports(file).get(name);
  const target = imported === undefined ? undefined : resolveModule(file, imported.from);
  if (imported === undefined || target === undefined) {
    return undefined;
  }
  const other = parseFile(target);
  const node = declarations(other).get(imported.imported);
  return node === undefined ? undefined : { file: other, node };
}

export { lookup, resolveModule };
export type { Found };
