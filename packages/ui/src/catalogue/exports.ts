/* The modules an app imports from, `@basis/ui`, its subpaths and `@basis/parallax`, and what each exports, read from
 * their entry files: every name, whether it is a type, and the declaration it refers to. */

import { child, children, nameOf, parallaxPackage, sourceFile, uiPackage } from "./ast.ts";
import type { Node, ParsedFile, SourcePackage } from "./ast.ts";
import { exported } from "./modules.ts";
import type { Entity } from "./modules.ts";

/** A module an app imports from: its name, its entry file, and the folders whose functions are its components. */
interface PublicModule {
  readonly name: string;
  readonly pkg: SourcePackage;
  readonly entry: string;
  readonly componentFolders: readonly string[];
  /** What it is for, where its entry's header comment does not say. */
  readonly purpose?: string;
}

const uiComponents = ["src/components/", "src/shell/"];

function uiSubpath(name: string): PublicModule {
  return {
    componentFolders: [],
    entry: `${name}/index.ts`,
    name: `@basis/ui/${name}`,
    pkg: uiPackage,
  };
}

const publicModules: readonly PublicModule[] = [
  {
    componentFolders: uiComponents,
    entry: "index.ts",
    name: "@basis/ui",
    pkg: uiPackage,
    purpose:
      "The components and their icons, the app shell, and the hooks and functions that go with them: what an app's pages import.",
  },
  ...["numbers", "utils", "dates", "securities", "testing", "fixtures"].map((name) =>
    uiSubpath(name),
  ),
  {
    componentFolders: [],
    entry: "preset/index.ts",
    name: "@basis/ui/preset",
    pkg: uiPackage,
    purpose:
      "The Vite+ preset an app's vite.config.ts spreads in: its lint, its tasks, its plugins and its tests.",
  },
  {
    componentFolders: ["src/chart/", "src/grid/", "src/pivot/", "src/react/"],
    entry: "index.ts",
    name: "@basis/parallax",
    pkg: parallaxPackage,
    purpose:
      "The grid, the pivot table and every chart, drawn on a canvas from a Rust engine in a Web Worker, with their React layer.",
  },
];

/** One name a module exports: whether it is a type, and what it refers to, or `undefined` for a library's. */
interface ExportedName {
  readonly name: string;
  readonly isType: boolean;
  readonly entity: Entity | undefined;
  /** The library it is re-exported from, when the catalogue does not open that library, such as Testing Library. */
  readonly library?: string;
}

function namesOf(statement: Node): { name: string; isType: boolean }[] {
  const allTypes = statement["exportKind"] === "type";
  const declaration = child(statement, "declaration");
  if (declaration !== undefined) {
    const name = nameOf(child(declaration, "id"));
    const isType =
      declaration.type.startsWith("TSInterface") || declaration.type.startsWith("TSTypeAlias");
    return name === undefined ? [] : [{ isType, name }];
  }
  return children(statement, "specifiers").flatMap((specifier) => {
    const name = nameOf(child(specifier, "exported"));
    return name === undefined
      ? []
      : [{ isType: allTypes || specifier["exportKind"] === "type", name }];
  });
}

/** Every name the module exports, in the order its entry file lists them. */
function exportedNames(module: PublicModule): ExportedName[] {
  const entry = sourceFile(module.pkg, module.entry);
  return children(entry.program, "body")
    .filter((statement) => statement.type === "ExportNamedDeclaration")
    .flatMap((statement) => {
      const library = nameOf(child(statement, "source"));
      const external =
        library !== undefined && !library.startsWith(".") && !library.startsWith("#");
      return namesOf(statement).map(({ isType, name }): ExportedName => {
        const entity = exported(entry, name);
        return external ? { entity, isType, library, name } : { entity, isType, name };
      });
    });
}

/** The header comment of a module's entry file: what the module is for. */
function headerOf(module: PublicModule): string {
  const entry: ParsedFile = sourceFile(module.pkg, module.entry);
  const [first] = entry.comments;
  if (first === undefined || first.start !== 0 || first.type !== "Block") {
    return "";
  }
  return first.value
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/u, ""))
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** A module and the names it exports. */
interface Listed {
  readonly module: PublicModule;
  readonly names: readonly ExportedName[];
}

export { exportedNames, headerOf, publicModules };
export type { ExportedName, Listed, PublicModule };
