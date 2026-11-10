/* The hooks, functions, classes and constants the catalogue lists beside the components: each with its kind, its
 * signature as its source writes it, what it is for, when to use it and what goes with it, and an example when its doc
 * comment has one. The types a signature names are recorded, so the catalogue defines them. */

import { child, children, docComment, exampleOf, seeOf, summary, tagOf, text } from "./ast.ts";
import type { Node } from "./ast.ts";
import type { ExportedName, PublicModule } from "./exports.ts";
import type { CatalogueFunction } from "./format.ts";
import { valueDeclaration } from "./modules.ts";
import type { Found } from "./modules.ts";
import { recordReferences } from "./references.ts";
import type { References } from "./references.ts";

/** What a doc comment says of when to use an entry and what goes with it. */
function guidance(doc: string): { use?: string; with?: string[] } {
  const use = tagOf(doc, "use");
  const see = seeOf(doc);
  return { ...(use === undefined ? {} : { use }), ...(see === undefined ? {} : { with: see }) };
}

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
]);

function declaratorOf(declaration: Node): Node | undefined {
  return children(declaration, "declarations")[0];
}

/** The function a declaration holds: itself, or a variable's arrow or function. */
function functionNode(declaration: Node): Node | undefined {
  const init =
    declaration.type === "VariableDeclaration"
      ? child(declaratorOf(declaration), "init")
      : declaration;
  return init !== undefined && functionTypes.has(init.type) ? init : undefined;
}

/** What a signature names: an entry's name and the file it is declared in, with where its types are recorded. */
interface Signed {
  readonly name: string;
  readonly found: Found;
  readonly references: References;
}

/** A function's signature, `name<T>(params): Return`, as its source writes it, recording the types it names. */
function functionSignature({ found, name, references }: Signed, fn: Node): string {
  const generics = child(fn, "typeParameters");
  const params = children(fn, "params");
  const returned = child(child(fn, "returnType"), "typeAnnotation");
  for (const part of [generics, ...params, returned]) {
    if (part !== undefined) {
      recordReferences(found.file, part, references);
    }
  }
  const typeParameters = generics === undefined ? "" : text(found.file, generics);
  const result = returned === undefined ? "" : `: ${text(found.file, returned)}`;
  return `${name}${typeParameters}(${params.map((param) => text(found.file, param)).join(", ")})${result}`;
}

/** The longest start of a constant's value a signature shows. */
const shownValue = 100;

/** A constant's signature: its declared type, what it is taken from, or the start of its value. */
function constantSignature({ found, name }: Signed, declaration: Node): string {
  const declarator = declaratorOf(declaration);
  const id = child(declarator, "id");
  const type = child(child(id, "typeAnnotation"), "typeAnnotation");
  const init = child(declarator, "init");
  const value = init === undefined ? "" : text(found.file, init);
  if (type !== undefined) {
    return `const ${name}: ${text(found.file, type)}`;
  }
  if (id?.type === "ObjectPattern") {
    return `const ${name} = ${value}.${name}`;
  }
  return `const ${name} = ${value.length > shownValue ? `${value.slice(0, shownValue - 1)}…` : value}`;
}

/** A class's signature, with the class it extends. */
function classSignature({ found, name }: Signed, declaration: Node): string {
  const base = child(declaration, "superClass");
  return `class ${name}${base === undefined ? "" : ` extends ${text(found.file, base)}`}`;
}

function kindOf(name: string, declaration: Node, fn: Node | undefined): CatalogueFunction["kind"] {
  if (declaration.type === "ClassDeclaration") {
    return "class";
  }
  if (fn === undefined) {
    return "constant";
  }
  return /^use[A-Z]/u.test(name) ? "hook" : "function";
}

function signatureOf(signed: Signed, declaration: Node, fn: Node | undefined): string {
  if (fn !== undefined) {
    return functionSignature(signed, fn);
  }
  return declaration.type === "ClassDeclaration"
    ? classSignature(signed, declaration)
    : constantSignature(signed, declaration);
}

/** The entry of a name a module re-exports from a library the catalogue does not open, such as Testing Library. */
function reexportEntry(module: PublicModule, { library, name }: ExportedName): CatalogueFunction {
  return {
    kind: "function",
    module: module.name,
    name,
    purpose:
      library === undefined
        ? ""
        : `${library}'s \`${name}\`, re-exported, so a test imports it from here.`,
    signature: `export { ${name} } from "${library ?? "?"}"`,
  };
}

/** The catalogue entry of the hook, function, class or constant `name`. */
function functionEntry(
  module: PublicModule,
  exportedName: ExportedName,
  references: References,
): CatalogueFunction {
  const { entity, name } = exportedName;
  const declaration = valueDeclaration(entity);
  if (entity?.kind !== "declarations" || declaration === undefined) {
    return reexportEntry(module, exportedName);
  }
  const fn = functionNode(declaration);
  const doc = docComment(entity.file, declaration);
  const example = exampleOf(doc);
  return {
    kind: kindOf(name, declaration, fn),
    module: module.name,
    name,
    purpose: summary(doc),
    signature: signatureOf({ found: entity, name, references }, declaration, fn),
    ...guidance(doc),
    ...(example === undefined ? {} : { example }),
  };
}

export { functionEntry, guidance };
