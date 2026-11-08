/* What the component catalogue reads of oxc's syntax tree, and of a file's doc comments. The catalogue is read from
 * the package's source, so it never drifts from it; see build.ts. */

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

interface ParsedFile {
  /** The file's path from src/, such as `components/button.tsx`. */
  readonly path: string;
  readonly source: string;
  readonly program: Node;
  readonly comments: readonly Comment[];
}

/** The package's src/ folder, which every path the catalogue names is relative to. */
const sourceRoot = new URL("../", import.meta.url);

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value && "start" in value;
}

function child(node: Node, key: string): Node | undefined {
  const value = node[key];
  return isNode(value) ? value : undefined;
}

function children(node: Node, key: string): Node[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter((item) => isNode(item)) : [];
}

/** The name an identifier or a string literal holds. */
function nameOf(node: Node | undefined): string | undefined {
  const value = node?.type === "Identifier" ? node["name"] : node?.["value"];
  return node !== undefined && typeof value === "string" ? value : undefined;
}

const parsed = new Map<string, ParsedFile>();

/** The file at `path` from src/, parsed. */
function readParsed(path: string): ParsedFile {
  const source = readFileSync(new URL(path, sourceRoot), "utf8");
  const result = parseSync(path, source, { lang: path.endsWith(".tsx") ? "tsx" : "ts" });
  const program: unknown = result.program;
  if (!isNode(program)) {
    throw new Error(`ERROR oxc gave no syntax tree for src/${path}: fix the file's syntax.`);
  }
  return { comments: result.comments, path, program, source };
}

/** The file at `path` from src/, parsed once. */
function parseFile(path: string): ParsedFile {
  const file = parsed.get(path) ?? readParsed(path);
  parsed.set(path, file);
  return file;
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
  if (last === undefined || !/^\s*(?:export\s+)?$/u.test(file.source.slice(last.end, node.start))) {
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
  parseFile,
  sourceRoot,
  summary,
  text,
};
export type { Comment, Node, ParsedFile };
