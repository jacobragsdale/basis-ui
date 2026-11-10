/* The app's `openapi.json` as the scaffolds and `vp run fixtures new` read it: each operation's id, method and path, its
 * parameters, its request body's schema and each response's schemas, every `$ref` followed. The names orval gives
 * what it generates are derived here too, as orval derives them, so a scaffold imports what the client exports. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { distance } from "./docs-search.ts";
import { documentFile } from "./orval-options.ts";
import { TaskError } from "./task-error.ts";

/** A JSON Schema, as a document holds it: an object of keywords, or `true` or `false`. */
type Schema = Readonly<Record<string, unknown>>;

interface ApiParameter {
  readonly name: string;
  readonly in: string;
  readonly required: boolean;
  readonly schema: Schema;
  /** The parameter's own example, if the document gives one. */
  readonly example: unknown;
}

interface ApiResponse {
  readonly status: string;
  readonly description: string;
  /** Each media type the status answers in, with its schema, `{}` where none is given. */
  readonly content: Readonly<Record<string, Schema>>;
}

interface ApiOperation {
  readonly id: string;
  readonly method: string;
  readonly template: string;
  readonly summary: string | undefined;
  readonly parameters: readonly ApiParameter[];
  /** The request body's JSON schema, if the operation takes one. */
  readonly body: Schema | undefined;
  readonly responses: readonly ApiResponse[];
}

interface ApiDocument {
  readonly document: Schema;
  readonly operations: ReadonlyMap<string, ApiOperation>;
}

const recordSchema = z.record(z.string(), z.unknown());
const methods = ["get", "put", "post", "delete", "patch"];

/** `value` as an object of keywords, or `{}` when it is none. */
function objectOf(value: unknown): Schema {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** The schema `schema` stands for, its `$ref`s followed within the document. */
function resolved(document: Schema, schema: unknown, seen: readonly string[] = []): Schema {
  const held = objectOf(schema);
  const reference = held["$ref"];
  if (typeof reference !== "string" || !reference.startsWith("#/") || seen.includes(reference)) {
    return held;
  }
  let target: unknown = document;
  for (const part of reference.slice(2).split("/")) {
    target = objectOf(target)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return resolved(document, target, [...seen, reference]);
}

/** The component name a schema's `$ref` names, as `DayCount` for `#/components/schemas/DayCount`. */
function componentName(schema: unknown): string | undefined {
  const reference = objectOf(schema)["$ref"];
  const prefix = "#/components/schemas/";
  return typeof reference === "string" && reference.startsWith(prefix)
    ? reference.slice(prefix.length)
    : undefined;
}

function parameterOf(document: Schema, value: unknown): ApiParameter | undefined {
  const held = resolved(document, value);
  const { name, in: place, required, schema, example } = held;
  if (typeof name !== "string" || typeof place !== "string") {
    return undefined;
  }
  const examples = Object.values(objectOf(held["examples"]));
  return {
    example: example ?? objectOf(examples[0])["value"],
    in: place,
    name,
    required: required === true,
    schema: objectOf(schema),
  };
}

function responseOf(document: Schema, status: string, value: unknown): ApiResponse {
  const held = resolved(document, value);
  const content = Object.fromEntries(
    Object.entries(objectOf(held["content"])).map(([type, media]) => [
      type,
      objectOf(objectOf(media)["schema"]),
    ]),
  );
  const { description } = held;
  return { content, description: typeof description === "string" ? description : "", status };
}

/** `value` as a list, or `[]` when it is none. */
function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Where an operation is: its path's template, its method, and the path item that holds it. */
interface Place {
  readonly template: string;
  readonly method: string;
  readonly item: Schema;
}

function operationOf(
  document: Schema,
  { template, method, item }: Place,
): ApiOperation | undefined {
  const held = objectOf(item[method]);
  const { operationId: id, summary } = held;
  if (typeof id !== "string") {
    return undefined;
  }
  const declared = [...listOf(item["parameters"]), ...listOf(held["parameters"])];
  const parameters = declared.flatMap((value) => parameterOf(document, value) ?? []);
  const body = objectOf(resolved(document, held["requestBody"])["content"])["application/json"];
  return {
    body: body === undefined ? undefined : objectOf(objectOf(body)["schema"]),
    id,
    method: method.toUpperCase(),
    parameters: [...new Map(parameters.map((one) => [`${one.in} ${one.name}`, one])).values()],
    responses: Object.entries(objectOf(held["responses"])).map(([status, value]) =>
      responseOf(document, status, value),
    ),
    summary: typeof summary === "string" ? summary : undefined,
    template,
  };
}

/** The document's operations by id. */
function operationsIn(document: Schema): ReadonlyMap<string, ApiOperation> {
  const operations = Object.entries(objectOf(document["paths"])).flatMap(([template, item]) =>
    methods.flatMap(
      (method) => operationOf(document, { item: objectOf(item), method, template }) ?? [],
    ),
  );
  return new Map(operations.map((operation) => [operation.id, operation]));
}

/** The app's `openapi.json`, read, or a failure that says how to get it. */
function readApi(root: string): ApiDocument {
  let document: Schema = {};
  try {
    const text = readFileSync(path.join(root, documentFile), "utf8");
    document = objectOf(JSON.parse(text));
  } catch {
    throw new TaskError(
      `ERROR ${documentFile} is missing or not JSON, and the operations are read from it: copy the API's document with vp run client-pull PATH TAG, or vp run client-pull URL.`,
    );
  }
  return { document, operations: operationsIn(document) };
}

const maxSuggestions = 3;

/** The operation `id` names, or a failure that names the closest ids the document has. */
function operationNamed(api: ApiDocument, id: string): ApiOperation {
  const operation = api.operations.get(id);
  if (operation !== undefined) {
    return operation;
  }
  const wanted = id.toLowerCase();
  const editsTo = (candidate: string): number => distance(wanted, candidate.toLowerCase());
  const close = [...api.operations.keys()]
    .map((candidate) => ({ candidate, edits: editsTo(candidate) }))
    .toSorted(
      (one, other) => one.edits - other.edits || one.candidate.localeCompare(other.candidate),
    )
    .slice(0, maxSuggestions)
    .map(({ candidate }) => candidate);
  const offer =
    close.length === 0
      ? `it has none: copy the API's document with vp run client-pull PATH TAG`
      : `did you mean ${close.join(", ")}? Run it again with one of them`;
  throw new TaskError(`ERROR ${id} is not an operation in ${documentFile}: ${offer}.`);
}

/** A name in PascalCase, as orval writes one: each run of letters and digits, its first letter capitalized. */
function pascal(name: string): string {
  const words = /^[^a-z]+$/u.test(name) ? name.toLowerCase() : name;
  return (words.match(/[\dA-Za-zÀ-ſ]+/gu) ?? [])
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
}

/** A name in camelCase, as orval writes an operation's function and a path parameter's argument. */
function camel(name: string): string {
  const cased = pascal(name);
  return `${cased.charAt(0).toLowerCase()}${cased.slice(1)}`;
}

/** The name orval gives the model of a component schema. */
function modelName(component: string): string {
  return component.replaceAll(/[^\w$]/gu, "");
}

/** The first success an operation declares, a 2xx, or `undefined`. */
function successOf(operation: ApiOperation): ApiResponse | undefined {
  return operation.responses.find(({ status }) => /^2\d\d$/u.test(status));
}

export {
  camel,
  componentName,
  modelName,
  objectOf,
  operationNamed,
  pascal,
  readApi,
  resolved,
  successOf,
};
export type { ApiDocument, ApiOperation, ApiParameter, ApiResponse, Schema };
