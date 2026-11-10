/* The component catalogue: a machine-readable list of everything an app imports from `@basis/ui` and
 * `@basis/parallax`, read from their source, for agents that write apps without reading the packages' code (ctzd turns
 * it into its agents' reference, and `vp run docs NAME` prints one entry). It holds each module and what it is for;
 * each component, with its family, what it is for, when to use it, what goes with it, its props, its own and those it
 * takes from Base UI, with their docs and defaults, its variants and, on one component of each family, an example; each
 * hook, function, class and constant, with its signature; and each named type those refer to, with its fields.
 * `vp run @basis/ui#catalogue` writes catalogue.json, which the package ships, and a test fails when that file is
 * stale, when an entry says nothing of what it is for, when a family has no example, when an example does not compile,
 * or when a prop it lists is not one the component takes. This module is a build tool: no entry point imports it.
 *
 * `@basis/parallax`'s entries are read from its source here, at the catalogue's build, so `@basis/ui` never depends on
 * parallax: the two release together at one version, so the entries match the parallax an app installs, and one file
 * serves an agent that uses both. */

import { docComment, exampleOf, propTagsOf, summary } from "./ast.ts";
import { exportedNames, headerOf, publicModules } from "./exports.ts";
import type { ExportedName, Listed, PublicModule } from "./exports.ts";
import type { Catalogue, CatalogueComponent, CatalogueFunction, CatalogueProp } from "./format.ts";
import { functionEntry, guidance } from "./functions.ts";
import { valueDeclaration } from "./modules.ts";
import { componentProps } from "./props.ts";
import type { References } from "./references.ts";
import { describeTypes } from "./types.ts";

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

/** What a prop the source leaves undescribed does, where it does the same on every component. */
const sharedDescriptions: Readonly<Record<string, string>> = {
  children: "What it holds.",
  className:
    "Classes that place it: margin, width, and flex or grid placement. Its look comes from its props, never from classes.",
  id: "The element's id, which a label's `htmlFor` names.",
  inset: "Indents it to line up with the items beside it that start with an icon or a check.",
  onClick: "Called when it is clicked.",
  onSelect:
    "Called with the item's value when the user chooses it, by Enter or a click; never for a disabled item.",
};

/** What a prop Base UI gives every part does in an app, which its own description, written for restyling, misleads. */
const appDescriptions: Readonly<Record<string, string>> = {
  className: sharedDescriptions["className"] ?? "",
  render:
    "Renders it as another element or component, such as a router's link, keeping its behaviour: a React element, or a function of its props and state.",
  style:
    'Inline styles: in an app, CSS variables only, which a class reads, as `style={{ "--fill": "40%" }}`.',
};

/** What a menu item's `variant` does, which every menu's items share. */
const destructiveVariant =
  "Marks an action that deletes or cannot be undone, in the destructive colour.";

function described(prop: CatalogueProp): CatalogueProp {
  const shared =
    prop.name === "variant" && prop.type === '"default" | "destructive"'
      ? destructiveVariant
      : sharedDescriptions[prop.name];
  const forApps = prop.from === undefined ? undefined : appDescriptions[prop.name];
  if (forApps !== undefined) {
    return { ...prop, description: forApps };
  }
  return prop.description === "" && shared !== undefined ? { ...prop, description: shared } : prop;
}

/** A component's props, and those its doc comment names with `@prop` that its types do not give the catalogue. */
function withNamedProps(props: readonly CatalogueProp[], doc: string): CatalogueProp[] {
  const listed = new Set(props.map((prop) => prop.name));
  const named = propTagsOf(doc).filter((tag) => !listed.has(tag.name));
  return [...props, ...named.map((tag): CatalogueProp => Object.assign(tag, { optional: true }))];
}

/** Whether a `Pick` left as written now has each of its keys among the props and variants, some named in the doc
 * comment; `className` is every component's. */
function pickedAll(
  type: string,
  shape: { props: readonly CatalogueProp[]; variants: object },
): boolean {
  const keys = /^Pick<.*,(?<keys>[^,>]+)>$/u.exec(type)?.groups?.["keys"]?.match(/[\w-]+/gu) ?? [];
  const listed = new Set([
    "className",
    ...shape.props.map((prop) => prop.name),
    ...Object.keys(shape.variants),
  ]);
  return keys.length > 0 && keys.every((key) => listed.has(key));
}

/** The catalogue entry of the component `name`, or `undefined` if it is no component. */
function componentEntry(
  module: PublicModule,
  { entity, name }: ExportedName,
  references: References,
): CatalogueComponent | undefined {
  const declaration = valueDeclaration(entity);
  const inFolder = module.componentFolders.some(
    (folder) => entity?.file.path.startsWith(folder) === true,
  );
  const shape =
    entity === undefined || !inFolder || !/^[A-Z]/u.test(name)
      ? undefined
      : componentProps(entity, references);
  if (entity === undefined || declaration === undefined || shape === undefined) {
    return undefined;
  }
  const doc = docComment(entity.file, declaration);
  const example = exampleOf(doc);
  const props = withNamedProps(shape.props, doc);
  return {
    extends: [...new Set(shape.extends)].filter(
      (type) => !pickedAll(type, { props, variants: shape.variants }),
    ),
    family: familyOf(entity.file.path),
    module: module.name,
    name,
    props: props.map((prop) => described(prop)),
    purpose: summary(doc),
    ...guidance(doc),
    variants: shape.variants,
    ...(example === undefined ? {} : { example }),
  };
}

function isIcon(entry: ExportedName): boolean {
  return entry.entity?.file.path.startsWith("src/vendor/lucide/") === true;
}

/** Each module's components and functions, in the order its entry exports them, its icons left out. */
function entriesOf(
  listed: readonly Listed[],
  references: References,
): { components: CatalogueComponent[]; functions: CatalogueFunction[] } {
  const components: CatalogueComponent[] = [];
  const functions: CatalogueFunction[] = [];
  for (const { module, names } of listed) {
    for (const entry of names.filter((name) => !name.isType && !isIcon(name))) {
      const component = componentEntry(module, entry, references);
      if (component === undefined) {
        functions.push(functionEntry(module, entry, references));
      } else {
        components.push(component);
      }
    }
  }
  return { components, functions };
}

/** The catalogue of the packages as their source holds them now. */
function buildCatalogue(): Catalogue {
  const references: References = new Map();
  const listed = publicModules.map((module) => ({ module, names: exportedNames(module) }));
  const { components, functions } = entriesOf(listed, references);
  const icons = listed.flatMap(({ names }) =>
    names.filter((name) => isIcon(name)).map(({ name }) => name),
  );
  return {
    components,
    format: "basis-ui-catalogue/2",
    functions,
    icons: icons.toSorted(),
    modules: publicModules.map((module) => ({
      name: module.name,
      purpose: module.purpose ?? headerOf(module),
    })),
    package: "@basis/ui",
    types: describeTypes(listed, components, references),
  };
}

/** The catalogue as catalogue.json holds it. */
function catalogueText(): string {
  return `${JSON.stringify(buildCatalogue(), undefined, 2)}\n`;
}

export { buildCatalogue, catalogueText };
export type {
  Catalogue,
  CatalogueComponent,
  CatalogueFunction,
  CatalogueProp,
  CatalogueType,
} from "./format.ts";
