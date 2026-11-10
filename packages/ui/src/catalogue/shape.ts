/* What the component catalogue's walk over a type collects, and what it carries as it goes: the props found, the types
 * left as written, the variants, the file it is in, the type parameters in scope, and where the named types it meets are
 * recorded. The walk's own `collect` rides along, so that each part of it can recurse into the others. */

import { child, docComment, nameOf, summary, tagOf, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import type { CatalogueProp, CatalogueVariant } from "./format.ts";
import { recordReferences } from "./references.ts";
import type { References } from "./references.ts";

interface PropsShape {
  readonly props: CatalogueProp[];
  readonly extends: string[];
  readonly variants: Record<string, CatalogueVariant>;
}

type Collect = (node: Node, walk: Walk) => void;

interface Walk {
  readonly file: ParsedFile;
  readonly shape: PropsShape;
  readonly depth: number;
  /** Each type parameter in scope, with the argument it stands for, as written. */
  readonly arguments: ReadonlyMap<string, string>;
  /** Where the named types the props refer to are recorded. */
  readonly references: References;
  /** The walk itself, for a part of it that meets a type inside a type. */
  readonly collect: Collect;
}

/** How deep a type's references are followed before it is listed as written. */
const maxDepth = 14;

function emptyShape(): PropsShape {
  return { extends: [], props: [], variants: {} };
}

function deeper(walk: Walk, changes: Partial<Walk> = {}): Walk {
  return { ...walk, depth: walk.depth + 1, ...changes };
}

/** `source` with each type parameter in `args` replaced by its argument. */
function substitute(source: string, args: ReadonlyMap<string, string>): string {
  let result = source;
  for (const [parameter, argument] of args) {
    result = result.replaceAll(
      new RegExp(`(?<![\\w.'"])${parameter}(?![\\w'"])`, "gu"),
      () => argument,
    );
  }
  return result;
}

function typeText(walk: Walk, node: Node): string {
  return substitute(text(walk.file, node), walk.arguments);
}

/** The library a file of declarations belongs to, such as `@base-ui/react`, or `undefined` for this repo's source. */
function libraryOf(file: ParsedFile): string | undefined {
  if (file.pkg !== undefined) {
    return undefined;
  }
  const [scope = "", name = ""] = file.path.replace(/^node_modules\//u, "").split("/");
  return scope.startsWith("@") ? `${scope}/${name}` : scope;
}

function propOf(member: Node, walk: Walk): CatalogueProp | undefined {
  const name = nameOf(child(member, "key"));
  const type = child(child(member, "typeAnnotation"), "typeAnnotation");
  if (member.type !== "TSPropertySignature" || name === undefined) {
    return undefined;
  }
  if (type !== undefined) {
    recordReferences(walk.file, type, walk.references);
  }
  const doc = docComment(walk.file, member);
  const defaultValue = tagOf(doc, "default");
  const from = libraryOf(walk.file);
  return {
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    // A library's description keeps its first paragraph: Base UI's run to several, with lists and examples.
    description: summary(from === undefined ? doc : (doc.split(/\n\s*\n/u)[0] ?? "")),
    ...(from === undefined ? {} : { from }),
    name,
    optional: member["optional"] === true,
    type: type === undefined ? "unknown" : typeText(walk, type),
  };
}

/** Adds `props` to `shape`: a prop the shape holds already stays, unless it came from a library and this one is own,
 * and takes the description of one that has it when it had none, as one member of a union may describe a prop. */
function addProps(shape: PropsShape, props: readonly CatalogueProp[]): void {
  for (const prop of props) {
    const index = shape.props.findIndex((known) => known.name === prop.name);
    const known = shape.props[index];
    if (known === undefined) {
      shape.props.push(prop);
    } else if (known.from !== undefined && prop.from === undefined) {
      shape.props[index] = prop;
    } else if (known.description === "" && prop.description !== "") {
      shape.props[index] = { ...known, description: prop.description };
    }
  }
}

function addMembers(members: readonly Node[], walk: Walk): void {
  addProps(
    walk.shape,
    members.flatMap((member) => propOf(member, walk) ?? []),
  );
}

export { addMembers, addProps, deeper, emptyShape, libraryOf, maxDepth, typeText };
export type { Collect, PropsShape, Walk };
