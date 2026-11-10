/* How the component catalogue finds what a name refers to: a declaration in the file that uses it, or in the module it
 * imports it from, under the name that module exports it as, following re-exports, `export * as`, and the namespaces
 * Base UI declares its parts' props in, such as `Select.Root.Props`. Names from this repo's packages and from Base UI's
 * declarations are followed; other libraries' are left as written. */

import { child, children, nameOf } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { exportsOf, imports, starExports } from "./bindings.ts";
import type { Binding } from "./bindings.ts";
import { declarations, declarationsAmong } from "./declarations.ts";
import { moduleFile } from "./resolve-module.ts";

/** The declarations of one name in one file: several where they merge, as a function and a namespace do. */
interface Found {
  readonly kind: "declarations";
  readonly file: ParsedFile;
  readonly nodes: readonly Node[];
}

/** A module as a namespace, such as Base UI's `Select` from `export * as Select from "./index.parts.js"`. */
interface NamespaceModule {
  readonly kind: "module";
  readonly file: ParsedFile;
}

type Entity = Found | NamespaceModule;

/** How deep re-exports are followed, against a cycle. */
const maxHops = 12;

/** Where a name is looked for, among a file's own names and imports or among what a module exports, how many
 * re-exports deep, and the resolution itself, for a step that follows one. */
interface Step {
  readonly scope: "local" | "export";
  readonly hops: number;
  readonly resolve: (file: ParsedFile, name: string, step: Step) => Entity | undefined;
}

/** The binding `name` has in `file`, in the step's scope. */
function bindingIn(file: ParsedFile, name: string, scope: Step["scope"]): Binding | undefined {
  return (scope === "local" ? imports(file) : exportsOf(file)).get(name);
}

/** What a binding refers to: a local name, a name another module exports, or that module whole. */
function followBinding(file: ParsedFile, binding: Binding, step: Step): Entity | undefined {
  if ("local" in binding) {
    return step.resolve(file, binding.local, { ...step, scope: "local" });
  }
  const target = moduleFile(file, "from" in binding ? binding.from : binding.namespace);
  if (target === undefined) {
    return undefined;
  }
  return "from" in binding
    ? step.resolve(target, binding.imported, { ...step, scope: "export" })
    : { file: target, kind: "module" };
}

/** What one of the modules `file` re-exports whole exports as `name`. */
function followStars(file: ParsedFile, name: string, step: Step): Entity | undefined {
  for (const specifier of starExports(file)) {
    const star = moduleFile(file, specifier);
    const found = star === undefined ? undefined : step.resolve(star, name, step);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** What `name` refers to: as `file` sees it, a declaration in it or what it imports under that name; or what the
 * module `file` exports as `name`, through its re-exports. */
function resolve(file: ParsedFile, name: string, step: Step): Entity | undefined {
  const local = step.scope === "local" ? declarations(file).get(name) : undefined;
  if (local !== undefined) {
    return { file, kind: "declarations", nodes: local };
  }
  const binding = bindingIn(file, name, step.scope);
  const next = { ...step, hops: step.hops + 1 };
  if (step.hops > maxHops) {
    return undefined;
  }
  if (binding !== undefined) {
    return followBinding(file, binding, next);
  }
  return step.scope === "export" ? followStars(file, name, next) : undefined;
}

/** What the module `file` exports as `name`. */
function exported(file: ParsedFile, name: string): Entity | undefined {
  return resolve(file, name, { hops: 0, resolve, scope: "export" });
}

/** What `name`, as `file` sees it, refers to: a declaration in `file`, or what it imports under that name. */
function lookup(file: ParsedFile, name: string): Entity | undefined {
  return resolve(file, name, { hops: 0, resolve, scope: "local" });
}

/** The member `name` of a module or of a declared namespace, such as `Root` of Base UI's `Select`. */
function member(entity: Entity, name: string): Entity | undefined {
  if (entity.kind === "module") {
    return exported(entity.file, name);
  }
  const inside = entity.nodes
    .filter((node) => node.type === "TSModuleDeclaration")
    .flatMap((node) => children(child(node, "body"), "body"));
  const nodes = declarationsAmong(inside).get(name);
  return nodes === undefined ? undefined : { file: entity.file, kind: "declarations", nodes };
}

/** What a name in `file` refers to: an identifier, or a qualified name such as `SelectPrimitive.Root.Props`. */
function resolveName(file: ParsedFile, node: Node | undefined): Entity | undefined {
  if (node?.type === "Identifier") {
    return lookup(file, nameOf(node) ?? "");
  }
  const isQualified = node?.type === "TSQualifiedName" || node?.type === "MemberExpression";
  const left = child(node, node?.type === "MemberExpression" ? "object" : "left");
  const right = nameOf(child(node, node?.type === "MemberExpression" ? "property" : "right"));
  const outer = isQualified ? resolveName(file, left) : undefined;
  return outer === undefined || right === undefined ? undefined : member(outer, right);
}

/** The declaration of a type among what an entity holds: an interface's, or a type alias's. */
function typeDeclaration(entity: Entity | undefined): Node | undefined {
  return entity?.kind === "declarations"
    ? entity.nodes.find(
        (node) => node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration",
      )
    : undefined;
}

/** The declaration of a value among what an entity holds: a function's, a variable's or a class's. */
function valueDeclaration(entity: Entity | undefined): Node | undefined {
  const values = new Set([
    "ClassDeclaration",
    "FunctionDeclaration",
    "TSDeclareFunction",
    "VariableDeclaration",
  ]);
  return entity?.kind === "declarations"
    ? entity.nodes.find((node) => values.has(node.type))
    : undefined;
}

export { exported, lookup, member, resolveName, typeDeclaration, valueDeclaration };
export type { Entity, Found };
