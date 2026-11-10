/* What `vp run docs` reads, from the app's installed packages: each one's README, as pages, the whole and each of its
 * sections, its changelog, and `@basis/ui`'s catalogue. */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

import { catalogueSchema } from "#catalogue/format.ts";
import type { Catalogue } from "#catalogue/format.ts";

import { TaskError } from "./task-error.ts";

/** The packages whose README is the docs, by the short name a page starts with. */
const documented = [
  { name: "@basis/ui", short: "ui" },
  { name: "@basis/parallax", short: "parallax" },
];

const fence = "```";
const sectionHeading = /^## (?<title>.+)$/u;

/** A page: a README whole, one of its sections, or a changelog. */
interface Page {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

/** An installed package's README and changelog, with its version and where it is. */
interface Readme {
  readonly short: string;
  readonly label: string;
  readonly text: string;
  readonly changelog: string | undefined;
}

/** A section's heading as the last part of its page's id: `Calling the API` as `calling-the-api`. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

/** Where the package `name` is installed for the app at `root`, or `undefined` when it is not. */
function manifestOf(root: string, name: string): string | undefined {
  try {
    return createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
  } catch {
    return undefined;
  }
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

/** The README of the package `name`, installed for the app at `root`, or `undefined` when it is not installed. */
async function readmeOf(root: string, name: string, short: string): Promise<Readme | undefined> {
  const manifest = manifestOf(root, name);
  const text =
    manifest === undefined
      ? undefined
      : await readOptional(path.join(path.dirname(manifest), "README.md"));
  if (manifest === undefined || text === undefined) {
    return undefined;
  }
  const { version } = z
    .object({ version: z.string() })
    .parse(JSON.parse(await readFile(manifest, "utf8")));
  return {
    changelog: await readOptional(path.join(path.dirname(manifest), "CHANGELOG.md")),
    label: `${name} ${version}, node_modules/${name}/README.md`,
    short,
    text,
  };
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

function pagesOfReadme(readme: Readme): Page[] {
  const changelog =
    readme.changelog === undefined
      ? []
      : [
          {
            id: `${readme.short}/changelog`,
            text: readme.changelog.trimEnd(),
            title: "What changed, version by version",
          },
        ];
  return [
    { id: readme.short, text: readme.text.trimEnd(), title: "The whole README" },
    ...sectionsOf(readme),
    ...changelog,
  ];
}

/** The installed catalogue, which `@basis/ui` ships beside its README. */
async function catalogueOf(root: string): Promise<Catalogue> {
  const manifest = manifestOf(root, "@basis/ui") ?? "";
  const file = path.join(path.dirname(manifest), "catalogue.json");
  const parsed = catalogueSchema.safeParse(JSON.parse((await readOptional(file)) ?? "null"));
  if (!parsed.success) {
    throw new TaskError(
      `ERROR the installed @basis/ui has no catalogue this task can read at ${file}: run vp install, then vp run upgrade if it repeats.`,
    );
  }
  return parsed.data;
}

/** What the docs read: the installed READMEs, their pages, and the catalogue. */
interface Docs {
  readonly readmes: readonly Readme[];
  readonly pages: readonly Page[];
  readonly catalogue: Catalogue;
  readonly installed: ReadonlySet<string>;
}

async function docsOf(root: string): Promise<Docs> {
  const found = await Promise.all(
    documented.map(async ({ name, short }) => readmeOf(root, name, short)),
  );
  const readmes = found.filter((readme) => readme !== undefined);
  if (readmes.length === 0) {
    throw new TaskError(
      "ERROR @basis/ui is not installed, and its README is the docs: run vp install.",
    );
  }
  const installed = new Set(
    documented.flatMap(({ name }) => (manifestOf(root, name) === undefined ? [] : [name])),
  );
  return {
    catalogue: await catalogueOf(root),
    installed,
    pages: readmes.flatMap((readme) => pagesOfReadme(readme)),
    readmes,
  };
}

export { docsOf };
export type { Docs, Page, Readme };
