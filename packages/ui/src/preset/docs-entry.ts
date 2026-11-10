/* How `vp run docs NAME` prints one entry of the installed catalogue: a component in about 60 lines, with what it is
 * for, when to use it, what goes with it, its props, its variants and its family's example; a hook, function or type
 * with its signature or fields; a module with what it exports. `--json` prints the same as JSON. */

import type {
  Catalogue,
  CatalogueComponent,
  CatalogueFunction,
  CatalogueModule,
  CatalogueProp,
  CatalogueType,
} from "#catalogue/format.ts";

/** An entry of the catalogue, by its kind. */
type Entry =
  | { readonly kind: "component"; readonly entry: CatalogueComponent }
  | { readonly kind: "function"; readonly entry: CatalogueFunction }
  | { readonly kind: "type"; readonly entry: CatalogueType }
  | { readonly kind: "module"; readonly entry: CatalogueModule };

const width = 118;
/** The width of a prop's name and type, before its description. */
const signatureWidth = 54;
const maxFamily = 14;

/** `text` cut to `length` characters, with an ellipsis where it was cut. */
function cut(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}…`;
}

/** `text` wrapped into lines of at most `width` characters, each starting with `indent`. */
function wrap(text: string, indent = ""): string[] {
  const lines: string[] = [];
  let line = indent;
  for (const word of text.split(/\s+/u).filter((part) => part !== "")) {
    if (line.length + word.length + 1 > width && line.trim() !== "") {
      lines.push(line.trimEnd());
      line = indent;
    }
    line += `${word} `;
  }
  return line.trim() === "" ? lines : [...lines, line.trimEnd()];
}

/** A description's first sentence. */
function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/u.exec(text)?.[0] ?? text;
}

/** A type as the docs print it: on one line, without the `| undefined` an optional prop adds. */
function shownType(type: string): string {
  return type.replace(/\s*\|\s*undefined$/u, "");
}

/** One line of a prop or field: its name, its type and its description's first sentence. */
function propLine(prop: CatalogueProp): string {
  const signature = cut(
    `${prop.name}${prop.optional ? "?" : ""}: ${shownType(prop.type)}`,
    signatureWidth,
  );
  const fallback = prop.default === undefined ? "" : ` Default ${prop.default}.`;
  const about = `${firstSentence(prop.description)}${fallback}`.trim();
  return cut(`  ${signature.padEnd(signatureWidth)}  ${about}`, width);
}

/** The props, own first, then those taken from a library, with a line saying which library. */
function propLines(props: readonly CatalogueProp[]): string[] {
  const own = props.filter((prop) => prop.from === undefined);
  const inherited = props.filter((prop) => prop.from !== undefined);
  const [library] = new Set(inherited.map((prop) => prop.from));
  return [
    ...own.map((prop) => propLine(prop)),
    ...(inherited.length === 0 ? [] : [`  From ${library ?? "its library"}:`]),
    ...inherited.map((prop) => propLine(prop)),
  ];
}

/** The names of the catalogue's types an entry's types name, so the agent can print each. */
function namedTypes(catalogue: Catalogue, sources: readonly string[]): CatalogueType[] {
  const named = new Set(sources.flatMap((source) => source.match(/\b[A-Z]\w*(?:\.\w+)*/gu) ?? []));
  return catalogue.types.filter((type) => named.has(type.name));
}

function typesLine(types: readonly CatalogueType[]): string[] {
  return types.length === 0
    ? []
    : [
        "",
        ...wrap(
          `Types: ${types.map((type) => type.name).join(", ")}. Print one with vp run docs TYPE.`,
        ),
      ];
}

function exampleLines(example: string | undefined): string[] {
  return example === undefined
    ? []
    : [
        "",
        "Example:",
        ...example
          .trimEnd()
          .split("\n")
          .map((line) => `  ${line}`),
      ];
}

function guidanceLines(use: string | undefined, goesWith: readonly string[]): string[] {
  const shown =
    goesWith.length > maxFamily
      ? [...goesWith.slice(0, maxFamily), `and ${String(goesWith.length - maxFamily)} more`]
      : goesWith;
  return [
    ...(use === undefined ? [] : wrap(`Use: ${use}`)),
    ...(shown.length === 0 ? [] : wrap(`Goes with: ${shown.join(", ")}.`)),
  ];
}

/** The family's other members, then what its doc comment says goes with it. */
function companions(catalogue: Catalogue, component: CatalogueComponent): string[] {
  const family = catalogue.components.filter(
    (other) =>
      other.family === component.family &&
      other.module === component.module &&
      other.name !== component.name,
  );
  const main = family.find((other) => other.example !== undefined);
  return [
    ...new Set([...family.map((other) => other.name), ...(component.with ?? main?.with ?? [])]),
  ];
}

function variantLines(component: CatalogueComponent): string[] {
  const variants = Object.entries(component.variants).map(
    ([name, variant]) =>
      `${name}: ${variant.options.join(", ")}${variant.default === null ? "" : ` (default ${variant.default})`}`,
  );
  return variants.length === 0 ? [] : ["", ...wrap(`Variants: ${variants.join("; ")}.`)];
}

function componentText(catalogue: Catalogue, component: CatalogueComponent): string[] {
  const family = catalogue.components.filter(
    (other) => other.family === component.family && other.module === component.module,
  );
  const main = family.find((other) => other.example !== undefined);
  const extended =
    component.extends.length === 0
      ? []
      : wrap(`Also takes: ${component.extends.join(", ")}.`, "  ");
  return [
    `${component.name}, a component from ${component.module}: import { ${component.name} } from "${component.module}";`,
    ...wrap(component.purpose),
    ...guidanceLines(component.use ?? main?.use, companions(catalogue, component)),
    "",
    component.props.length === 0 ? "Props: none of its own." : "Props:",
    ...propLines(component.props),
    ...extended,
    ...variantLines(component),
    ...exampleLines(component.example ?? main?.example),
    ...typesLine(
      namedTypes(
        catalogue,
        component.props.map((prop) => prop.type),
      ),
    ),
  ];
}

function functionText(catalogue: Catalogue, fn: CatalogueFunction): string[] {
  return [
    `${fn.name}, a ${fn.kind} from ${fn.module}: import { ${fn.name} } from "${fn.module}";`,
    ...wrap(fn.signature, "  "),
    ...wrap(fn.purpose),
    ...guidanceLines(fn.use, fn.with ?? []),
    ...exampleLines(fn.example),
    ...typesLine(namedTypes(catalogue, [fn.signature])),
  ];
}

function typeText(catalogue: Catalogue, type: CatalogueType): string[] {
  const importLine = type.exported
    ? `: import type { ${type.name} } from "${type.module}";`
    : `, declared in ${type.module} and not exported`;
  const fields = type.fields ?? [];
  return [
    `${type.name}${type.parameters ?? ""}, a type${importLine}`,
    ...wrap(type.purpose),
    ...(type.definition === undefined ? [] : ["", ...wrap(`= ${type.definition}`, "  ")]),
    ...(fields.length === 0 ? [] : ["", "Fields:", ...fields.map((field) => propLine(field))]),
    ...(type.extends === undefined ? [] : wrap(`Also has: ${type.extends.join(", ")}.`, "  ")),
    ...typesLine(
      namedTypes(catalogue, [...fields.map((field) => field.type), type.definition ?? ""]).filter(
        (other) => other.name !== type.name,
      ),
    ),
  ];
}

function moduleText(catalogue: Catalogue, module: CatalogueModule): string[] {
  const names = (entries: readonly { readonly module: string; readonly name: string }[]): string =>
    entries
      .filter((entry) => entry.module === module.name)
      .map((entry) => entry.name)
      .join(", ");
  const sections = [
    ["Components", names(catalogue.components)],
    ["Hooks, functions and constants", names(catalogue.functions)],
    ["Types", names(catalogue.types.filter((type) => type.exported))],
  ].filter(([, list]) => list !== "");
  const lines = [`${module.name}, a module`, ...wrap(module.purpose)];
  for (const [title = "", list = ""] of sections) {
    lines.push("", ...wrap(`${title}: ${list}.`));
  }
  return lines;
}

/** What `vp run docs NAME` prints for an entry. */
function entryText(catalogue: Catalogue, found: Entry): string {
  if (found.kind === "component") {
    return componentText(catalogue, found.entry).join("\n");
  }
  if (found.kind === "function") {
    return functionText(catalogue, found.entry).join("\n");
  }
  if (found.kind === "module") {
    return moduleText(catalogue, found.entry).join("\n");
  }
  return typeText(catalogue, found.entry).join("\n");
}

/** What `vp run docs NAME --json` prints for an entry: the entry, and the catalogue's types it names. */
function entryJson(catalogue: Catalogue, found: Entry): string {
  const sources =
    found.kind === "component"
      ? found.entry.props.map((prop) => prop.type)
      : [found.kind === "function" ? found.entry.signature : JSON.stringify(found.entry)];
  const family =
    found.kind === "component"
      ? catalogue.components
          .filter(
            (other) => other.family === found.entry.family && other.module === found.entry.module,
          )
          .map((other) => other.name)
      : undefined;
  const types = namedTypes(catalogue, sources).filter((type) => type.name !== found.entry.name);
  return JSON.stringify(
    {
      kind: found.kind,
      ...found.entry,
      ...(family === undefined ? {} : { familyMembers: family }),
      types,
    },
    undefined,
    2,
  );
}

export { cut, entryJson, entryText, width, wrap };
export type { Entry };
