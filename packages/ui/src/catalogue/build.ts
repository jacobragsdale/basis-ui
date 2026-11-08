/* The component catalogue: a machine-readable list of every component @basis/ui exports, read from its source, for
 * agents that write apps without reading the package's code (ctzd turns it into its agents' reference). Each entry
 * holds the component's name, its family, what it is for, its props, the types whose props it also takes, its variants,
 * and, on one component of each family, an example. `vp run @basis/ui#catalogue` writes catalogue.json, which the
 * package ships, and a test fails when that file is stale, when a component says nothing of what it is for, when a
 * family has no example, or when an example does not compile. This module is a build tool: no entry point imports it. */

import { child, children, docComment, exampleOf, nameOf, parseFile, summary, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { lookup, resolveModule } from "./modules.ts";
import { emptyShape, propsOf } from "./props.ts";
import type { CatalogueProp, CatalogueVariant, PropsShape } from "./props.ts";

interface CatalogueComponent {
  readonly name: string;
  /** The component's family: the file it lives in, or the file whose family a file of parts belongs to. */
  readonly family: string;
  readonly purpose: string;
  readonly props: readonly CatalogueProp[];
  /** Types whose props the component also takes, as written in the source, such as `ButtonPrimitive.Props`. */
  readonly extends: readonly string[];
  readonly variants: Readonly<Record<string, CatalogueVariant>>;
  readonly example?: string;
}

interface Catalogue {
  readonly format: "basis-ui-catalogue/1";
  readonly package: "@basis/ui";
  readonly components: readonly CatalogueComponent[];
  /** The icons the package exports, each a component taking an SVG element's props. */
  readonly icons: readonly string[];
}

/** Files that hold parts of another file's family, which that family's one example covers. */
const familyOfFile: Readonly<Record<string, string>> = {
  "combobox-chips": "combobox",
  "command-dialog": "command",
  "command-item": "command",
  "sidebar-group": "sidebar",
  "sidebar-menu": "sidebar",
  "sidebar-menu-button": "sidebar",
  "sidebar-sections": "sidebar",
};

function familyOf(path: string): string {
  const file = (path.split("/").at(-1) ?? path).replace(/\.tsx?$/u, "");
  return familyOfFile[file] ?? file;
}

/** Every value export of src/index.ts, with the file it comes from. */
function packageExports(): { readonly name: string; readonly path: string }[] {
  const index = parseFile("index.ts");
  return children(index.program, "body")
    .filter(
      (statement) =>
        statement.type === "ExportNamedDeclaration" && statement["exportKind"] !== "type",
    )
    .flatMap((statement) => {
      const from = nameOf(child(statement, "source"));
      const path = from === undefined ? undefined : resolveModule(index, from);
      return path === undefined
        ? []
        : children(statement, "specifiers")
            .filter((specifier) => specifier["exportKind"] !== "type")
            .flatMap((specifier) => {
              const name = nameOf(child(specifier, "exported"));
              return name === undefined ? [] : [{ name, path }];
            });
    });
}

/** The function a component's declaration holds: itself, or a variable's arrow or function. */
function componentFunction(node: Node): Node | undefined {
  if (node.type === "FunctionDeclaration") {
    return node;
  }
  const declarator =
    node.type === "VariableDeclaration" ? children(node, "declarations")[0] : undefined;
  const init = declarator === undefined ? undefined : child(declarator, "init");
  return init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression"
    ? init
    : undefined;
}

/** The props of a component exported as a Base UI part itself, such as `const Select = SelectPrimitive.Root`. */
function primitiveProps(file: ParsedFile, node: Node): PropsShape | undefined {
  const declarator =
    node.type === "VariableDeclaration" ? children(node, "declarations")[0] : undefined;
  const init = declarator === undefined ? undefined : child(declarator, "init");
  return init?.type === "MemberExpression"
    ? { ...emptyShape(), extends: [`${text(file, init)}.Props`] }
    : undefined;
}

/** A component's props: its function's, or a Base UI part's when it is exported as that part itself. */
function shapeOf(file: ParsedFile, node: Node, fn: Node | undefined): PropsShape | undefined {
  return fn === undefined ? primitiveProps(file, node) : propsOf(file, fn);
}

/** The catalogue entry of the component `name`, which `path` exports, or `undefined` if it is no component. */
function entryOf(name: string, path: string): CatalogueComponent | undefined {
  const found = lookup(parseFile(path), name);
  const fn = found === undefined ? undefined : componentFunction(found.node);
  const shape = found === undefined ? undefined : shapeOf(found.file, found.node, fn);
  if (found === undefined || shape === undefined) {
    return undefined;
  }
  const doc = docComment(found.file, found.node);
  const example = exampleOf(doc);
  return {
    extends: [...new Set(shape.extends)],
    family: familyOf(found.file.path),
    name,
    props: shape.props,
    purpose: summary(doc),
    variants: shape.variants,
    ...(example === undefined ? {} : { example }),
  };
}

const componentFolders = ["components/", "shell/"];

/** The catalogue of the package as its source holds it now. */
function buildCatalogue(): Catalogue {
  const exported = packageExports().filter(({ name }) => /^[A-Z]/u.test(name));
  const components = exported
    .filter(({ path }) => componentFolders.some((folder) => path.startsWith(folder)))
    .flatMap(({ name, path }) => entryOf(name, path) ?? []);
  const icons = exported
    .filter(({ path }) => path.startsWith("vendor/lucide/"))
    .map(({ name }) => name);
  return {
    components,
    format: "basis-ui-catalogue/1",
    icons: icons.toSorted(),
    package: "@basis/ui",
  };
}

/** The catalogue as catalogue.json holds it. */
function catalogueText(): string {
  return `${JSON.stringify(buildCatalogue(), undefined, 2)}\n`;
}

export { buildCatalogue, catalogueText };
export type { Catalogue, CatalogueComponent };
export type { CatalogueProp, CatalogueVariant } from "./props.ts";
