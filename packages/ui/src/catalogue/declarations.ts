/* The declarations a file holds, for the component catalogue: each top-level function, variable, class, interface,
 * type, enum and namespace, by the name it declares, `export` unwrapped. */

import { child, children, nameOf } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";

const declarationTypes = new Set([
  "ClassDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration",
]);

/** A statement's declaration, unwrapping `export`. */
function declarationIn(statement: Node): Node | undefined {
  return statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
}

/** The names a declaration declares. */
function declaredNames(node: Node): string[] {
  if (node.type === "VariableDeclaration") {
    return children(node, "declarations").flatMap((declarator) => {
      const id = child(declarator, "id");
      // `const { a, b } = X` declares each name it takes.
      return id?.type === "ObjectPattern"
        ? children(id, "properties").flatMap((property) => nameOf(child(property, "value")) ?? [])
        : (nameOf(id) ?? []);
    });
  }
  return declarationTypes.has(node.type) ? [nameOf(child(node, "id")) ?? []].flat() : [];
}

/** Every declaration among `statements`, by the name it declares. */
function declarationsAmong(statements: readonly Node[]): Map<string, Node[]> {
  const found = new Map<string, Node[]>();
  for (const node of statements.flatMap((statement) => declarationIn(statement) ?? [])) {
    for (const name of declaredNames(node)) {
      found.set(name, [...(found.get(name) ?? []), node]);
    }
  }
  return found;
}

const fileDeclarations = new Map<string, Map<string, Node[]>>();

/** Every top-level declaration in `file`, by the name it declares. */
function declarations(file: ParsedFile): Map<string, Node[]> {
  const known = fileDeclarations.get(file.url.href);
  if (known !== undefined) {
    return known;
  }
  const found = declarationsAmong(children(file.program, "body"));
  fileDeclarations.set(file.url.href, found);
  return found;
}

export { declarations, declarationsAmong, declaredNames };
