/* A value a schema accepts, for a fixture's body and a scaffold's test: the schema's own `const`, `example`, `examples`
 * or `default` where it gives one, its first `enum` value, and otherwise the smallest value of its type that fits its
 * format, pattern and bounds, a number by its display format's kind. The value is checked against the schema after
 * (schema-check.ts), so a schema this cannot satisfy fails with the field at fault. */

import { objectOf, resolved } from "./api-operations.ts";
import type { Schema } from "./api-operations.ts";
import { textMatching } from "./schema-text.ts";

interface ExampleOptions {
  /** Whether an object holds every property it declares, as a response does to show them, or only those it requires,
   * as a form's request does. */
  readonly every: boolean;
  /** The name of the field the value is for, which text is made from. */
  readonly name: string;
}

/** The deepest an example nests, so a schema that refers to itself ends. */
const deepest = 6;

/** The values each format of text takes, as the client's Zod schemas check them. */
const formatted: Readonly<Record<string, string>> = {
  date: "2026-11-06",
  "date-time": "2026-11-06T14:30:00Z",
  email: "name@example.com",
  time: "14:30:00",
  uri: "https://example.com",
  url: "https://example.com",
  uuid: "019a5c3e-0000-7000-8000-000000000001",
};

/** A number of each display format's kind, as such a number reads: a rate as a fraction, a price near par. */
const byKind: Readonly<Record<string, number>> = {
  bps: 0.0525,
  money: 1_250_000,
  pct: 0.0525,
  price: 99.5,
  price32: 99.515625,
};
const plainNumber = 1234.5;
const plainInteger = 12;

/** The value the schema itself gives, if it gives one. */
function givenValue(schema: Schema): unknown {
  if ("const" in schema) {
    return schema["const"];
  }
  const examples = Array.isArray(schema["examples"]) ? schema["examples"] : [];
  const choices = Array.isArray(schema["enum"]) ? schema["enum"] : [];
  return schema["example"] ?? examples[0] ?? schema["default"] ?? choices[0];
}

/** A field's name as words, as `Security id` for `security_id`. */
function wordsOf(name: string): string {
  const words = name
    .replaceAll(/(?<before>[\da-z])(?<after>[A-Z])/gu, "$<before> $<after>")
    .replaceAll(/[^\dA-Za-z]+/gu, " ")
    .trim()
    .toLowerCase();
  return words === "" ? "text" : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function textFor(schema: Schema, name: string): string | undefined {
  const { format, pattern, minLength, maxLength } = schema;
  if (typeof format === "string" && format in formatted) {
    return formatted[format];
  }
  if (format === "binary") {
    return undefined;
  }
  if (typeof pattern === "string") {
    return textMatching(pattern);
  }
  const shortest = typeof minLength === "number" ? minLength : 0;
  const longest = typeof maxLength === "number" ? maxLength : Number.POSITIVE_INFINITY;
  return `${wordsOf(name)} 1`.padEnd(shortest, "x").slice(0, longest);
}

function numberOrNothing(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** The lower and upper bound a number's schema sets, either `undefined` when unset. */
function boundsOf(schema: Schema): {
  readonly lower: number | undefined;
  readonly upper: number | undefined;
} {
  return {
    lower: numberOrNothing(schema["exclusiveMinimum"]) ?? numberOrNothing(schema["minimum"]),
    upper: numberOrNothing(schema["exclusiveMaximum"]) ?? numberOrNothing(schema["maximum"]),
  };
}

function numberFor(schema: Schema, integer: boolean): number {
  const { kind } = objectOf(schema["x-basis-format"]);
  const wanted = integer
    ? plainInteger
    : (byKind[typeof kind === "string" ? kind : ""] ?? plainNumber);
  const { lower, upper } = boundsOf(schema);
  const above = lower === undefined || wanted > lower;
  const below = upper === undefined || wanted < upper;
  if (above && below) {
    return wanted;
  }
  const middle =
    lower !== undefined && upper !== undefined
      ? (lower + upper) / 2
      : (lower ?? upper ?? 0) + (lower === undefined ? -1 : 1);
  return integer ? Math.ceil(middle) : middle;
}

function typeOf(schema: Schema): string | undefined {
  const { type } = schema;
  if (Array.isArray(type)) {
    return type.map(String).find((one) => one !== "null");
  }
  if (typeof type === "string") {
    return type;
  }
  return "properties" in schema ? "object" : undefined;
}

/** Where an example is being made: what it is for, and how deep in the schema. */
interface State extends ExampleOptions {
  readonly depth: number;
}

type Example = (schema: Schema, state: State) => unknown;

function objectFor(example: Example, schema: Schema, state: State): unknown {
  const required = new Set(Array.isArray(schema["required"]) ? schema["required"].map(String) : []);
  const entries = Object.entries(objectOf(schema["properties"])).flatMap(([name, property]) => {
    if (!state.every && !required.has(name)) {
      return [];
    }
    const value = example(objectOf(property), { ...state, depth: state.depth + 1, name });
    if (value === undefined) {
      return required.has(name) ? [[name, null] as const] : [];
    }
    return [[name, value] as const];
  });
  return Object.fromEntries(entries);
}

function arrayFor(example: Example, schema: Schema, state: State): unknown {
  const fewest = typeof schema["minItems"] === "number" ? Math.max(1, schema["minItems"]) : 1;
  const item = example(objectOf(schema["items"]), { ...state, depth: state.depth + 1 });
  return item === undefined ? [] : Array.from({ length: fewest }, () => item);
}

/** The first member of a union that is not `null` and gives a value. */
function memberFor(example: Example, members: readonly unknown[], state: State): unknown {
  return members
    .map((member) => objectOf(member))
    .filter((member) => member["type"] !== "null")
    .map((member) => example(member, state))
    .find((value) => value !== undefined);
}

/** An object each part of an `allOf` adds its fields to. */
function allOfFor(example: Example, parts: readonly unknown[], state: State): unknown {
  const merged: Record<string, unknown> = {};
  for (const part of parts) {
    const value = example(objectOf(part), state);
    Object.assign(merged, objectOf(value));
  }
  return merged;
}

/** A value of a type that holds others: a list or an object. */
function containerFor(example: Example, schema: Schema, state: State): unknown {
  return typeOf(schema) === "array"
    ? arrayFor(example, schema, state)
    : objectFor(example, schema, state);
}

/** A value of the schema's type. */
function typedFor(example: Example, schema: Schema, state: State): unknown {
  const type = typeOf(schema) ?? "";
  if (type === "array" || type === "object") {
    return containerFor(example, schema, state);
  }
  if (type === "integer" || type === "number") {
    return numberFor(schema, type === "integer");
  }
  if (type === "string") {
    return textFor(schema, state.name);
  }
  if (type === "boolean") {
    return true;
  }
  return type === "null" ? null : undefined;
}

function exampleIn(document: Schema): Example {
  const example: Example = (given, state) => {
    const schema = resolved(document, given);
    const own = givenValue(schema);
    if (own !== undefined || state.depth > deepest) {
      return own;
    }
    const deeper = { ...state, depth: state.depth + 1 };
    const members = schema["anyOf"] ?? schema["oneOf"];
    if (Array.isArray(members)) {
      return memberFor(example, members, deeper);
    }
    return Array.isArray(schema["allOf"])
      ? allOfFor(example, schema["allOf"], deeper)
      : typedFor(example, schema, state);
  };
  return example;
}

/** A value `schema` accepts, or `undefined` where it accepts nothing this can make, such as bytes. */
function exampleOf(document: Schema, schema: Schema, options: ExampleOptions): unknown {
  return exampleIn(document)(schema, { ...options, depth: 0 });
}

export { exampleOf, wordsOf };
export type { ExampleOptions };
