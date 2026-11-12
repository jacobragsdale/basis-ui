/* The fields of a type inferred from a Zod schema, such as parallax's `LayoutInput`, which is
 * `z.input<typeof layoutSchema>`: read from the schema's `z.strictObject({ ... })`, each with its type written as
 * TypeScript, whether it may be left out, its default, and its doc comment. */

import { child, children, docComment, nameOf, summary, text } from "./ast.ts";
import type { Node, ParsedFile } from "./ast.ts";
import { declarations } from "./declarations.ts";
import type { CatalogueProp } from "./format.ts";
import { resolveName, valueDeclaration } from "./modules.ts";
import type { References } from "./references.ts";

/** Which side of a schema a type is: what it accepts (`z.input`) or what it gives (`z.output`, `z.infer`). */
type Side = "input" | "output";

interface ZodRead {
  readonly file: ParsedFile;
  readonly side: Side;
  readonly references: References;
  readonly depth: number;
  /** The reading itself, for a schema inside a schema. */
  readonly type: (node: Node, read: ZodRead) => string;
}

const maxDepth = 6;

/** A call's method name and the expression it is called on, as in `.nullable()` on `z.string()`. */
function callParts(node: Node): { method: string; target: Node | undefined; args: Node[] } {
  const callee = child(node, "callee");
  return {
    args: children(node, "arguments"),
    method: nameOf(child(callee, "property")) ?? "",
    target: child(callee, "object"),
  };
}

/** The schema a variable holds, as its initializer, with the file it is declared in. */
function schemaInit(file: ParsedFile, node: Node): { file: ParsedFile; init: Node } | undefined {
  const entity = resolveName(file, node);
  const declaration = valueDeclaration(entity);
  const init = child(children(declaration, "declarations")[0], "init");
  return entity === undefined || init === undefined ? undefined : { file: entity.file, init };
}

/** The type alias in `file` written as `z.input<typeof name>` or `z.output<typeof name>` for the side read. */
function aliasOf(file: ParsedFile, schema: string, side: Side): Node | undefined {
  const pattern =
    side === "input"
      ? /^z\.input<typeof (?<name>\w+)>$/u
      : /^z\.(?:output|infer)<typeof (?<name>\w+)>$/u;
  return [...declarations(file).values()].flat().find((node) => {
    const type = child(node, "typeAnnotation");
    return (
      node.type === "TSTypeAliasDeclaration" &&
      type !== undefined &&
      pattern.exec(text(file, type))?.groups?.["name"] === schema
    );
  });
}

function literalUnion(node: Node | undefined, file: ParsedFile): string | undefined {
  const values = children(node, "elements").map((element) => text(file, element));
  return values.length === 0 ? undefined : values.join(" | ");
}

/** The values of `z.enum(...)`: listed in place, or in a constant array declared `as const`. */
function enumType(arg: Node | undefined, read: ZodRead): string {
  if (arg?.type === "ArrayExpression") {
    return literalUnion(arg, read.file) ?? "string";
  }
  const found = arg === undefined ? undefined : schemaInit(read.file, arg);
  const values =
    found?.init.type === "TSAsExpression" ? child(found.init, "expression") : found?.init;
  return (
    (values === undefined ? undefined : literalUnion(values, found?.file ?? read.file)) ?? "string"
  );
}

function wrap(type: string): string {
  return /[|&]/u.test(type) ? `(${type})` : type;
}

const plain: Readonly<Record<string, string>> = {
  boolean: "boolean",
  int: "number",
  number: "number",
  string: "string",
  unknown: "unknown",
};

/** Whether a schema may be left out on the side read, and its default, from its chain of calls. */
function presence(node: Node, read: ZodRead): { optional: boolean; default?: string } {
  if (node.type !== "CallExpression") {
    return { optional: false };
  }
  const { args, method, target } = callParts(node);
  const [first] = args;
  if (method === "optional") {
    return { optional: true };
  }
  if (method === "default" && first !== undefined) {
    return { default: text(read.file, first), optional: read.side === "input" };
  }
  return target === undefined ? { optional: false } : presence(target, read);
}

/** The fields an object spread into a schema's shape holds, as `...cellFields` from `const cellFields = { ... }`, read
 * in the file that declares it. */
function spreadFields(
  entry: Node,
  read: ZodRead,
  fieldsOf: (shape: Node, read: ZodRead) => CatalogueProp[],
): CatalogueProp[] {
  const argument = child(entry, "argument");
  const found = argument?.type === "Identifier" ? schemaInit(read.file, argument) : undefined;
  return found?.init.type === "ObjectExpression"
    ? fieldsOf(found.init, { ...read, file: found.file })
    : [];
}

/** An object schema's shape, `{ name: schema, ... }`, as its fields. */
function zodObjectFields(shape: Node | undefined, read: ZodRead): CatalogueProp[] {
  return children(shape, "properties").flatMap((entry) => {
    if (entry.type === "SpreadElement") {
      return spreadFields(entry, read, zodObjectFields);
    }
    const name = nameOf(child(entry, "key"));
    const value = child(entry, "value");
    if (name === undefined || value === undefined) {
      return [];
    }
    const { default: fallback, optional } = presence(value, read);
    return [
      {
        ...(fallback === undefined ? {} : { default: fallback }),
        description: summary(docComment(read.file, entry)),
        name,
        optional,
        type: read.depth > maxDepth ? "unknown" : read.type(value, read),
      },
    ];
  });
}

/** An object schema written in place, as a type literal. */
function objectType(shape: Node | undefined, read: ZodRead): string {
  const fields = zodObjectFields(shape, { ...read, depth: read.depth + 1 });
  const members = fields.map((field) => `${field.name}${field.optional ? "?" : ""}: ${field.type}`);
  return `{ ${members.join("; ")} }`;
}

/** The type a call on `z` itself makes, such as `z.array(name)`. */
function baseType(method: string, args: readonly Node[], read: ZodRead): string {
  const [first, second] = args;
  const typeOf = (node: Node | undefined): string =>
    node === undefined ? "unknown" : read.type(node, read);
  const builders: Readonly<Record<string, () => string>> = {
    array: () => `${wrap(typeOf(first))}[]`,
    enum: () => enumType(first, read),
    literal: () => (first === undefined ? "unknown" : text(read.file, first)),
    object: () => objectType(first, read),
    record: () => `Record<string, ${typeOf(second)}>`,
    strictObject: () => objectType(first, read),
    // A discriminated union's members follow its key, as `z.discriminatedUnion("kind", [...])`.
    discriminatedUnion: () =>
      children(second, "elements")
        .map((element) => typeOf(element))
        .join(" | "),
    union: () =>
      children(first, "elements")
        .map((element) => typeOf(element))
        .join(" | "),
  };
  return plain[method] ?? builders[method]?.() ?? `z.${method}(…)`;
}

/** A schema held by a variable: the type alias its file names it by, recorded so the catalogue defines it, or its
 * own type. */
function namedType(node: Node, read: ZodRead): string {
  const found = schemaInit(read.file, node);
  const schema = nameOf(node) ?? "";
  const alias = found === undefined ? undefined : aliasOf(found.file, schema, read.side);
  const name = nameOf(child(alias, "id"));
  if (alias !== undefined && found !== undefined && name !== undefined) {
    const key = `${found.file.url.href}#${String(alias.start)}`;
    read.references.set(key, { declaration: alias, file: found.file, name });
    return name;
  }
  return found === undefined || read.depth > maxDepth
    ? schema
    : read.type(found.init, { ...read, depth: read.depth + 1, file: found.file });
}

/** The type a method call on a schema makes of the schema's type: `.nullable()` adds `null`, and every other, such as
 * `.min()`, `.optional()` or `.default()`, keeps it, `presence` reading the last two. */
function modified(method: string, inner: string, read: ZodRead): string {
  if (method === "nullable") {
    return `${inner} | null`;
  }
  return method === "transform" && read.side === "output" ? "unknown" : inner;
}

/** A Zod schema's type, written as TypeScript. */
function zodType(node: Node, read: ZodRead): string {
  if (node.type === "Identifier") {
    return namedType(node, read);
  }
  if (node.type !== "CallExpression") {
    return "unknown";
  }
  const { args, method, target } = callParts(node);
  if (target?.type === "Identifier" && nameOf(target) === "z") {
    return baseType(method, args, read);
  }
  return target === undefined ? "unknown" : modified(method, zodType(target, read), read);
}

/** The fields of `z.input<typeof schema>` or `z.output<typeof schema>`, or `undefined` when it is no such type. */
function zodFields(
  file: ParsedFile,
  reference: Node,
  references: References,
): CatalogueProp[] | undefined {
  const side =
    text(file, child(reference, "typeName") ?? reference) === "z.input" ? "input" : "output";
  const [argument] = children(child(reference, "typeArguments"), "params");
  const query = argument?.type === "TSTypeQuery" ? child(argument, "exprName") : undefined;
  const found = query === undefined ? undefined : schemaInit(file, query);
  if (found?.init.type !== "CallExpression") {
    return undefined;
  }
  const { args, method } = callParts(found.init);
  const read: ZodRead = { depth: 0, file: found.file, references, side, type: zodType };
  return ["object", "strictObject"].includes(method) ? zodObjectFields(args[0], read) : undefined;
}

/** The schema `reference`, `z.input<typeof schema>` or its kin, names, with the side it reads; `undefined` when it is
 * no such type. */
function schemaOf(
  file: ParsedFile,
  reference: Node,
): { readonly found: { file: ParsedFile; init: Node }; readonly side: Side } | undefined {
  const name = text(file, child(reference, "typeName") ?? reference);
  if (!/^z\.(?:input|output|infer)$/u.test(name)) {
    return undefined;
  }
  const [argument] = children(child(reference, "typeArguments"), "params");
  const query = argument?.type === "TSTypeQuery" ? child(argument, "exprName") : undefined;
  const found = query === undefined ? undefined : schemaInit(file, query);
  return found === undefined ? undefined : { found, side: name === "z.input" ? "input" : "output" };
}

/** `z.input<typeof schema>` or `z.output<typeof schema>` of a schema that is not an object, such as a discriminated
 * union, written as TypeScript; `undefined` when `reference` is no such type. */
function zodDefinition(
  file: ParsedFile,
  reference: Node,
  references: References,
): string | undefined {
  const schema = schemaOf(file, reference);
  if (schema === undefined) {
    return undefined;
  }
  const { found, side } = schema;
  return zodType(found.init, { depth: 0, file: found.file, references, side, type: zodType });
}

export { zodDefinition, zodFields };
