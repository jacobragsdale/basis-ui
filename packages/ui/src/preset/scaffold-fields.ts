/* The fields a scaffold lays out, read from an object schema: each property's name, its label, the kind of value it
 * holds, and the display format the API declares for it, as the generated client's `displayFormats` holds it. A
 * property that holds an object or a list is left out, and named in the page's opening comment. Also the code a
 * scaffold writes values in: an identifier or a property's access, and a value as a TypeScript literal. */

import { componentName, objectOf, resolved } from "./api-operations.ts";
import type { Schema } from "./api-operations.ts";
import { displayFormatsOf } from "./display-formats.ts";
import { wordsOf } from "./schema-example.ts";

type FieldKind = "boolean" | "choice" | "date" | "instant" | "number" | "text";

interface Field {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  /** Whether the API may send `null` for it. */
  readonly nullable: boolean;
  /** A choice's values, in the schema's order. */
  readonly options: readonly string[];
  /** The code of its display format, as `displayFormats.CouponRow.interest`, if the API declares one. */
  readonly format: string | undefined;
  readonly description: string | undefined;
}

interface Fields {
  readonly fields: readonly Field[];
  /** The properties left out, which hold an object or a list. */
  readonly skipped: readonly string[];
}

/** A property's schema and whether it allows `null`, a nullable union unwrapped to its other member. */
function unwrapped(
  document: Schema,
  property: unknown,
): { readonly schema: Schema; readonly nullable: boolean } {
  const schema = resolved(document, property);
  const members: unknown = schema["anyOf"] ?? schema["oneOf"];
  if (Array.isArray(members)) {
    const others: unknown[] = members.filter((member) => objectOf(member)["type"] !== "null");
    return others.length === 1 && others.length < members.length
      ? { nullable: true, schema: { ...schema, ...resolved(document, others[0]) } }
      : { nullable: false, schema };
  }
  const { type } = schema;
  return Array.isArray(type) && type.includes("null")
    ? { nullable: true, schema: { ...schema, type: type.find((one) => one !== "null") } }
    : { nullable: schema["nullable"] === true, schema };
}

/** The kind of a string's field: a date, an instant, or text. */
function textKind({ format }: Schema): FieldKind {
  if (format === "date") {
    return "date";
  }
  return format === "date-time" ? "instant" : "text";
}

function kindOf(schema: Schema): FieldKind | undefined {
  const { type } = schema;
  const choices: unknown = schema["enum"];
  if (type === "number" || type === "integer") {
    return "number";
  }
  if (type === "boolean") {
    return "boolean";
  }
  if (Array.isArray(choices) && choices.length > 0) {
    return choices.every((choice) => typeof choice === "string") ? "choice" : undefined;
  }
  return type === "string" ? textKind(schema) : undefined;
}

/** A name as an identifier's part, or a quoted key where it is not one. */
function access(name: string): string {
  return /^[$A-Z_a-z][\w$]*$/u.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
}

/** Where a scaffold reads fields: the document, and the component whose display formats they take. */
interface Source {
  readonly document: Schema;
  readonly component: string | undefined;
  readonly required: ReadonlySet<string>;
}

/** The field a property is, or `undefined` for one that holds an object or a list. */
function fieldOf(
  { document, component, required }: Source,
  name: string,
  property: unknown,
): Field | undefined {
  const { schema, nullable } = unwrapped(document, property);
  const kind = kindOf(schema);
  if (kind === undefined) {
    return undefined;
  }
  const { title, description } = schema;
  const formats = component === undefined ? {} : (displayFormatsOf(document)[component] ?? {});
  const choices: unknown = schema["enum"];
  return {
    description: typeof description === "string" ? description.split("\n").join(" ") : undefined,
    format:
      component !== undefined && name in formats
        ? `displayFormats${access(component)}${access(name)}`
        : undefined,
    kind,
    label: wordsOf(typeof title === "string" ? title : name),
    name,
    nullable,
    options: Array.isArray(choices) ? choices.map(String) : [],
    required: required.has(name),
  };
}

/** The fields of the object `given` describes, by the document's components. */
function fieldsOf(document: Schema, given: Schema): Fields {
  const schema = resolved(document, given);
  const listed: unknown = schema["required"];
  const source = {
    component: componentName(given),
    document,
    required: new Set(Array.isArray(listed) ? listed.map(String) : []),
  };
  const read = Object.entries(objectOf(schema["properties"])).map(
    ([name, property]) => [name, fieldOf(source, name, property)] as const,
  );
  return {
    fields: read.flatMap(([, field]) => field ?? []),
    skipped: read.flatMap(([name, field]) => (field === undefined ? [name] : [])),
  };
}

/** An integer's digits in groups of three, as the lint's numeric-separators-style writes them once there are five
 * or more; a fraction's digits stay as they are. */
function grouped(digits: string): string {
  const fewest = 5;
  return digits.length < fewest ? digits : digits.replaceAll(/\B(?=(?:\d{3})+$)/gu, "_");
}

/** A number as a TypeScript literal, its digits grouped. */
function numberLiteral(value: number): string {
  const text = String(value);
  const parts = /^(?<sign>-?)(?<whole>\d+)(?<fraction>\.\d+)?$/u.exec(text)?.groups;
  if (parts === undefined) {
    return text;
  }
  const { sign = "", whole = "", fraction = "" } = parts;
  return `${sign}${grouped(whole)}${fraction}`;
}

/** A JSON value as a TypeScript literal, keys unquoted where they are identifiers. */
function literalOf(value: unknown): string {
  if (typeof value === "number") {
    return numberLiteral(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => literalOf(item)).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([key, held]) =>
        `${access(key).startsWith(".") ? key : JSON.stringify(key)}: ${literalOf(held)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export { access, fieldsOf, literalOf, unwrapped };
export type { Field, FieldKind, Fields };
