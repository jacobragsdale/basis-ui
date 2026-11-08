/* The docs of the installed version, which an agent reads rather than a page on the web that may describe another:
 *
 *   vp run docs          lists the pages: each installed package's README whole, as `ui` or `parallax`, and each of
 *                        its sections, as `ui/SLUG`, such as `ui/calling-the-api`
 *   vp run docs PAGE     prints one, named in full or by its section's slug alone when one package has it */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

import { TaskError } from "./shot-options.ts";

/** The packages whose README is the docs, by the short name a page starts with. */
const documented = [
  { name: "@basis/ui", short: "ui" },
  { name: "@basis/parallax", short: "parallax" },
];

const fence = "```";
const sectionHeading = /^## (?<title>.+)$/u;

/** A page: a README whole, or one of its sections. */
interface Page {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

/** An installed package's README, with its version and where it is. */
interface Readme {
  readonly short: string;
  readonly label: string;
  readonly text: string;
}

/** A section's heading as the last part of its page's id: `Calling the API` as `calling-the-api`. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

/** The README of the package `name`, installed for the app at `root`, or `undefined` when it is not installed. */
async function readmeOf(root: string, name: string, short: string): Promise<Readme | undefined> {
  try {
    const manifest = createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
    const { version } = z
      .object({ version: z.string() })
      .parse(JSON.parse(await readFile(manifest, "utf8")));
    const file = path.join(path.dirname(manifest), "README.md");
    return {
      label: `${name} ${version}, node_modules/${name}/README.md`,
      short,
      text: await readFile(file, "utf8"),
    };
  } catch {
    return undefined;
  }
}

/** Each `## ` section of a README, a heading inside a code block left alone, as a page. */
function sectionsOf(readme: Readme): readonly Page[] {
  const pages: { id: string; title: string; lines: string[] }[] = [];
  let inCode = false;
  for (const line of readme.text.split("\n")) {
    inCode = line.trimStart().startsWith(fence) ? !inCode : inCode;
    const title = inCode ? undefined : sectionHeading.exec(line)?.groups?.["title"];
    if (title !== undefined) {
      pages.push({ id: `${readme.short}/${slugOf(title)}`, lines: [], title });
    }
    pages.at(-1)?.lines.push(line);
  }
  return pages.map(({ id, lines, title }) => ({ id, text: lines.join("\n").trimEnd(), title }));
}

/** Every page of the installed packages' docs, each package's README first, with what to print beside it. */
async function pagesOf(
  root: string,
): Promise<{ readonly readmes: readonly Readme[]; readonly pages: readonly Page[] }> {
  const found = await Promise.all(
    documented.map(async ({ name, short }) => readmeOf(root, name, short)),
  );
  const readmes = found.filter((readme) => readme !== undefined);
  const pages = readmes.flatMap((readme) => [
    { id: readme.short, text: readme.text.trimEnd(), title: "The whole README" },
    ...sectionsOf(readme),
  ]);
  return { pages, readmes };
}

/** The list `vp run docs` prints. */
function listing(readmes: readonly Readme[], pages: readonly Page[]): string {
  const width = Math.max(...pages.map((page) => page.id.length));
  const lines = readmes.flatMap((readme) => [
    "",
    `${readme.label}:`,
    ...pages
      .filter((page) => page.id === readme.short || page.id.startsWith(`${readme.short}/`))
      .map((page) => `  ${page.id.padEnd(width)}  ${page.title}`),
  ]);
  return [
    ...lines.slice(1),
    "",
    "Print one with vp run docs PAGE, such as vp run docs ui/calling-the-api, or vp run docs calling-the-api.",
  ].join("\n");
}

/** The page `name` names: by its id, or by its section's slug when only one package has that section. */
function pageNamed(pages: readonly Page[], name: string): Page {
  const exact = pages.find((page) => page.id === name);
  const bySlug = pages.filter((page) => page.id.endsWith(`/${name}`));
  const [only] = bySlug;
  const page = exact ?? (bySlug.length === 1 ? only : undefined);
  if (page === undefined) {
    throw new TaskError(
      `ERROR there is no docs page ${name}${bySlug.length > 1 ? " in one package alone" : ""}: run vp run docs to list the pages, then vp run docs PAGE with one of them.`,
    );
  }
  return page;
}

/** `vp run docs [PAGE]`. */
async function docs(root: string, args: readonly string[]): Promise<string> {
  const { pages, readmes } = await pagesOf(root);
  if (readmes.length === 0) {
    throw new TaskError(
      "ERROR @basis/ui is not installed, and its README is the docs: run vp install.",
    );
  }
  const [name, ...extra] = args;
  if (extra.length > 0) {
    throw new TaskError(
      "ERROR vp run docs takes one page at most: run vp run docs to list them, then vp run docs PAGE.",
    );
  }
  return name === undefined ? listing(readmes, pages) : pageNamed(pages, name).text;
}

export { docs };
