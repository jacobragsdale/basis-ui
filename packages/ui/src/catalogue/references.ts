/* The named types the catalogue's entries refer to, such as `DataTableColumn` in DataTable's `columns`, which the
 * catalogue defines beside them so that an agent never meets a name it cannot look up. */

import { child, isNode, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { resolveName, typeDeclaration } from "./modules.ts";

/** A named type an entry refers to: its name as first written, and its declaration. */
interface Reference {
  readonly name: string;
  readonly file: ParsedFile;
  readonly declaration: Node;
}

/** The types referred to, by where each is declared, so two names for one type are one entry. */
type References = Map<string, Reference>;

function nodesUnder(node: Node): Node[] {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === "start" || key === "end") {
      return [];
    }
    const values: unknown[] = Array.isArray(value) ? value : [value];
    return values.filter((item) => isNode(item));
  });
}

/** Records each named type that the type `node`, written in `file`, refers to and the catalogue can open. */
function recordReferences(file: ParsedFile, node: Node, references: References): void {
  if (node.type === "TSTypeReference") {
    const typeName = child(node, "typeName");
    const entity = resolveName(file, typeName);
    const declaration = typeDeclaration(entity);
    if (entity !== undefined && declaration !== undefined && typeName !== undefined) {
      const key = `${entity.file.url.href}#${String(declaration.start)}`;
      if (!references.has(key)) {
        references.set(key, { declaration, file: entity.file, name: text(file, typeName) });
      }
    }
  }
  for (const part of nodesUnder(node)) {
    recordReferences(file, part, references);
  }
}

export { recordReferences };
export type { Reference, References };
