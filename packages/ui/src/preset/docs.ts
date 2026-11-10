/* The docs of the installed version, which an agent reads rather than a page on the web that may describe another:
 *
 *   vp run docs                  the pages, the modules, and each family's main component
 *   vp run docs NAME             one component, hook, function, type or module from the installed catalogue,
 *                                @basis/ui/catalogue.json, such as `Select`, `numberText`, `DataTableColumn` or `dates`;
 *                                or a page: a README whole, as `ui` or `parallax`, one of its sections, as `ui/SLUG` or
 *                                SLUG alone, or the changelog, as `ui/changelog`
 *   vp run docs --search WORDS   the entries and pages whose name or purpose holds every word, best first
 *
 * `--json` prints any of them as JSON. */

import type { Catalogue } from "#catalogue/format.ts";

import { cut, entryJson, entryText, width, wrap } from "./docs-entry.ts";
import { docsOf } from "./docs-read.ts";
import type { Docs, Page } from "./docs-read.ts";
import { entryNamed, search, suggestions } from "./docs-search.ts";
import { TaskError } from "./task-error.ts";

/** Each family's main component, the one its example is on, with what it is for. */
function familyLines(catalogue: Catalogue): string[] {
  const mains = catalogue.components.filter((component) => component.example !== undefined);
  const nameWidth = Math.max(...mains.map((component) => component.name.length));
  return mains.map((component) =>
    cut(`  ${component.name.padEnd(nameWidth)}  ${component.purpose}`, width),
  );
}

/** The list `vp run docs` prints. */
function listing({ catalogue, pages, readmes }: Docs): string {
  const idWidth = Math.max(...pages.map((page) => page.id.length));
  const pageLines = readmes.flatMap((readme) => [
    "",
    `${readme.label}:`,
    ...pages
      .filter((page) => page.id === readme.short || page.id.startsWith(`${readme.short}/`))
      .map((page) => `  ${page.id.padEnd(idWidth)}  ${page.title}`),
  ]);
  return [
    ...pageLines.slice(1),
    "",
    ...wrap(`Modules: ${catalogue.modules.map((module) => module.name).join(", ")}.`),
    "",
    "Components, each family's main one:",
    ...familyLines(catalogue),
    "",
    ...wrap(
      "Print one with vp run docs NAME: a component, hook, function, type, module or page, such as vp run docs Select, vp run docs numberText or vp run docs ui/calling-the-api. Find one by what it does with vp run docs --search WORDS, such as vp run docs --search date range. Add --json for JSON.",
    ),
  ].join("\n");
}

function listingJson({ catalogue, pages }: Docs): string {
  const families = Map.groupBy(
    catalogue.components,
    (component) => `${component.module} ${component.family}`,
  );
  return JSON.stringify(
    {
      families: [...families.values()].map((members) => ({
        members: members.map((member) => member.name),
        module: members[0]?.module,
        name: members[0]?.family,
      })),
      modules: catalogue.modules,
      pages: pages.map(({ id, title }) => ({ id, title })),
    },
    undefined,
    2,
  );
}

/** The width of a search result's kind, the longest being `component`. */
const kindWidth = 9;

/** The error for a name the docs do not have, with the closest names they do. */
function unknownName(known: Docs, name: string): TaskError {
  const close = suggestions(known.catalogue, known.pages, name);
  const offer =
    close.length === 0
      ? "run vp run docs --search WORDS to find one by what it does, or vp run docs to list the pages and components"
      : `did you mean ${close.join(", ")}? Run vp run docs NAME with one, or vp run docs --search WORDS to find one by what it does`;
  return new TaskError(`ERROR there is no ${name} in the installed catalogue or docs: ${offer}.`);
}

/** An entry from a package the app has not installed says so first. */
function notInstalled(known: Docs, module: string): string {
  const pkg = module.startsWith("@basis/parallax") ? "@basis/parallax" : "@basis/ui";
  return known.installed.has(pkg)
    ? ""
    : `${pkg} is not installed in this app: add it with vp add ${pkg} to use this.\n\n`;
}

/** The page `name` names: by its id, or by its section's slug when only one package has that section. */
function pageNamed(pages: readonly Page[], name: string): Page | undefined {
  const bySlug = pages.filter((page) => page.id.endsWith(`/${name}`));
  return bySlug.length === 1 ? bySlug[0] : undefined;
}

/** `vp run docs NAME`. */
function lookUp(known: Docs, name: string, json: boolean): string {
  const exactPage = known.pages.find((page) => page.id === name);
  const entry = exactPage === undefined ? entryNamed(known.catalogue, name) : undefined;
  if (entry !== undefined) {
    const module = entry.kind === "module" ? entry.entry.name : entry.entry.module;
    return json
      ? entryJson(known.catalogue, entry)
      : `${notInstalled(known, module)}${entryText(known.catalogue, entry)}`;
  }
  const page = exactPage ?? pageNamed(known.pages, name);
  if (page === undefined) {
    throw unknownName(known, name);
  }
  return json ? JSON.stringify({ kind: "page", ...page }, undefined, 2) : page.text;
}

/** `vp run docs --search WORDS`. */
function searchFor(known: Docs, text: string, json: boolean): string {
  const found = search(known.catalogue, known.pages, text);
  if (found.length === 0) {
    throw new TaskError(
      `ERROR nothing in the installed catalogue or docs matches every word of "${text}": search with fewer or other words, or run vp run docs to list the pages and components.`,
    );
  }
  if (json) {
    const results = found.map(({ item, score }) => ({
      kind: item.kind,
      module: item.module,
      name: item.name,
      purpose: item.purpose,
      score,
    }));
    return JSON.stringify({ query: text, results }, undefined, 2);
  }
  const nameWidth = Math.max(...found.map(({ item }) => item.name.length));
  return [
    ...found.map(({ item }) =>
      cut(
        `  ${item.name.padEnd(nameWidth)}  ${item.kind.padEnd(kindWidth)}  ${item.purpose}`,
        width,
      ),
    ),
    "",
    "Print one with vp run docs NAME.",
  ].join("\n");
}

const usage =
  "run vp run docs, vp run docs NAME or vp run docs --search WORDS, each with --json if wanted";

/** The words after `--search`, which a search needs at least one of. */
function searchWords(words: readonly string[]): string {
  const text = words.join(" ").trim();
  if (text === "") {
    throw new TaskError(`ERROR vp run docs --search needs the words to find: ${usage}.`);
  }
  return text;
}

/** What the arguments ask for: the listing, a name, or a search, and whether as JSON. */
function parse(args: readonly string[]): { json: boolean; name?: string; search?: string } {
  const json = args.includes("--json");
  const rest = args.filter((arg) => arg !== "--json");
  const [first, ...more] = rest;
  if (first === "--search") {
    return { json, search: searchWords(more) };
  }
  const flag = rest.find((arg) => arg.startsWith("--"));
  if (flag !== undefined || more.length > 0) {
    throw new TaskError(
      `ERROR vp run docs takes one name at most${flag === undefined ? "" : ` and no ${flag}`}: ${usage}.`,
    );
  }
  return first === undefined ? { json } : { json, name: first };
}

/** `vp run docs [NAME | --search WORDS] [--json]`. */
async function docs(root: string, args: readonly string[]): Promise<string> {
  const asked = parse(args);
  const found = await docsOf(root);
  if (asked.search !== undefined) {
    return searchFor(found, asked.search, asked.json);
  }
  if (asked.name !== undefined) {
    return lookUp(found, asked.name, asked.json);
  }
  return asked.json ? listingJson(found) : listing(found);
}

export { docs };
