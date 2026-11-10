/* What the component catalogue reads of oxc's syntax tree, and of a file's doc comments. The catalogue is read from
 * the packages' source, and from the declarations of the libraries they build on, such as Base UI's, so it never
 * drifts from either; see build.ts. */

import { readFileSync } from "node:fs";

import { parseSync } from "oxc-parser";

/** A node of oxc's tree, as far as the catalogue reads it: its type, its offsets in the source, and its fields. */
interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

interface Comment {
  readonly type: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/** A package of this repo whose source the catalogue reads: its name, and its folder. */
interface SourcePackage {
  readonly name: string;
  readonly root: URL;
}

interface ParsedFile {
  readonly url: URL;
  /** The file's path for a message: from its package's folder, or from `node_modules`. */
  readonly path: string;
  /** The package of this repo the file belongs to, or `undefined` for a library's declarations. */
  readonly pkg: SourcePackage | undefined;
  readonly source: string;
  readonly program: Node;
  readonly comments: readonly Comment[];
}

/** The packages whose source the catalogue reads. */
const uiPackage: SourcePackage = { name: "@basis/ui", root: new URL("../../", import.meta.url) };
const parallaxPackage: SourcePackage = {
  name: "@basis/parallax",
  root: new URL("../../../parallax/", import.meta.url),
};
const sourcePackages = [uiPackage, parallaxPackage];

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value && "start" in value;
}

function child(node: Node | undefined, key: string): Node | undefined {
  const value = node?.[key];
  return isNode(value) ? value : undefined;
}

function children(node: Node | undefined, key: string): Node[] {
  const value = node?.[key];
  return Array.isArray(value) ? value.filter((item) => isNode(item)) : [];
}

/** The name an identifier or a string literal holds. */
function nameOf(node: Node | undefined): string | undefined {
  const value = node?.type === "Identifier" ? node["name"] : node?.["value"];
  return node !== undefined && typeof value === "string" ? value : undefined;
}

function packageOf(url: URL): SourcePackage | undefined {
  return url.pathname.includes("/node_modules/")
    ? undefined
    : sourcePackages.find((pkg) => url.pathname.startsWith(pkg.root.pathname));
}

function displayPath(url: URL, pkg: SourcePackage | undefined): string {
  const modules = url.pathname.lastIndexOf("/node_modules/");
  if (pkg !== undefined) {
    return url.pathname.slice(pkg.root.pathname.length);
  }
  return modules === -1 ? url.pathname : url.pathname.slice(modules + 1);
}

const parsed = new Map<string, ParsedFile>();

function langOf(url: URL): "dts" | "ts" | "tsx" {
  if (/\.d\.m?ts$/u.test(url.pathname)) {
    return "dts";
  }
  return url.pathname.endsWith(".tsx") ? "tsx" : "ts";
}

function readParsed(url: URL): ParsedFile {
  const pkg = packageOf(url);
  const path = displayPath(url, pkg);
  const source = readFileSync(url, "utf8");
  const result = parseSync(url.pathname, source, { lang: langOf(url) });
  const program: unknown = result.program;
  if (!isNode(program)) {
    throw new Error(`ERROR oxc gave no syntax tree for ${path}: fix the file's syntax.`);
  }
  return { comments: result.comments, path, pkg, program, source, url };
}

/** The file at `url`, parsed once. */
function parseFile(url: URL): ParsedFile {
  const file = parsed.get(url.href) ?? readParsed(url);
  parsed.set(url.href, file);
  return file;
}

/** The file at `path` from a package's `src/` folder, parsed once. */
function sourceFile(pkg: SourcePackage, path: string): ParsedFile {
  return parseFile(new URL(`src/${path}`, pkg.root));
}

/** The source text of `node`, on one line. */
function text(file: ParsedFile, node: Node): string {
  return file.source.slice(node.start, node.end).replaceAll(/\s+/gu, " ").trim();
}

/** The doc comment right before `node`, with only whitespace and `export` between, without its stars. */
function docComment(file: ParsedFile, node: Node): string {
  const last = file.comments
    .filter((comment) => comment.type === "Block" && comment.value.startsWith("*"))
    .findLast((comment) => comment.end <= node.start);
  const between = last === undefined ? "" : file.source.slice(last.end, node.start);
  if (last === undefined || !/^\s*(?:export\s+)?(?:declare\s+)?$/u.test(between)) {
    return "";
  }
  return last.value
    .slice(1)
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/u, ""))
    .join("\n")
    .trim();
}

/** A doc comment's text before its first tag, on one line. */
function summary(doc: string): string {
  const [untagged = ""] = doc.split(/^@/mu);
  return untagged.replaceAll(/\s+/gu, " ").trim();
}

/** The text of a doc comment's tag `name`, such as `@use` or `@default`, on one line, or `undefined`. */
function tagOf(doc: string, name: string): string | undefined {
  const match = new RegExp(`^@${name}\\b(?<body>[\\s\\S]*?)(?=^@\\w|(?![\\s\\S]))`, "mu").exec(doc);
  const body = match?.groups?.["body"]?.replaceAll(/\s+/gu, " ").trim();
  return body === undefined || body === "" ? undefined : body;
}

/** The names a doc comment's `@see` lists, comma-separated, or `undefined`. */
function seeOf(doc: string): string[] | undefined {
  const names = tagOf(doc, "see")
    ?.split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names === undefined || names.length === 0 ? undefined : names;
}

/** The props a doc comment names with `@prop {type} name description`, for one the catalogue cannot read from its
 * types, such as an element's prop that a `Pick` keeps. */
function propTagsOf(doc: string): { name: string; type: string; description: string }[] {
  const tags = doc.matchAll(
    /^@prop\s+\{(?<type>[^}]+)\}\s+(?<name>[\w-]+)\s+(?<body>[\s\S]*?)(?=^@\w|(?![\s\S]))/gmu,
  );
  return [...tags].map(({ groups }) => ({
    description: (groups?.["body"] ?? "").replaceAll(/\s+/gu, " ").trim(),
    name: groups?.["name"] ?? "",
    type: groups?.["type"] ?? "unknown",
  }));
}

/** The code of a doc comment's `@example`, without its fence, or `undefined`. */
function exampleOf(doc: string): string | undefined {
  const match = /^@example\s*\n(?<code>[\s\S]*?)(?=^@\w|(?![\s\S]))/mu.exec(doc);
  const code = match?.groups?.["code"];
  if (code === undefined) {
    return undefined;
  }
  return `${code
    .replace(/^```\w*\n/u, "")
    .replace(/\n```\s*$/u, "")
    .trimEnd()}\n`;
}

export {
  child,
  children,
  docComment,
  exampleOf,
  isNode,
  nameOf,
  parallaxPackage,
  parseFile,
  propTagsOf,
  seeOf,
  sourceFile,
  summary,
  tagOf,
  text,
  uiPackage,
};
export type { Comment, Node, ParsedFile, SourcePackage };
