/* `vp run fixtures`, the app's fixtures in `fixtures/`:
 *
 *   vp run fixtures [check]                              checks every fixture against openapi.json, as verify does
 *   vp run fixtures new OPERATION [--status N] [--force]   writes fixtures/OPERATION[-N].json, a body the schema accepts
 *
 * A new fixture asks what the operation's examples say, or the smallest values its schema accepts, and answers its
 * first success, or the status `--status` names: a success with a body made from its schema, an error with a problem
 * details body named by the type the response's description gives. Every failure is one ERROR line ending in its fix. */

import { STATUS_CODES } from "node:http";

import { arrowStream } from "#api/fetch.ts";

import { operationNamed, readApi, successOf } from "./api-operations.ts";
import type { ApiDocument, ApiOperation, ApiParameter, ApiResponse } from "./api-operations.ts";
import { checkFixtures, sameRequest } from "./fixture-files.ts";
import { exampleOf } from "./schema-example.ts";
import { schemaIssues } from "./schema-check.ts";
import { textMatching } from "./schema-text.ts";
import { formatFiles, writeNew } from "./scaffold-files.ts";
import { TaskError } from "./task-error.ts";

interface FixtureRequest {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, readonly string[]>>;
  readonly body?: unknown;
}

/** A fixture record, as `fixtures/` holds one. */
interface NewFixture {
  readonly format: "basis-ui-fixture/1";
  readonly operation_id: string;
  readonly recorded_at: string;
  readonly request: FixtureRequest;
  readonly response: Readonly<Record<string, unknown>>;
}

const usage =
  "run vp run fixtures check, or vp run fixtures new OPERATION, with --status N for a status other than the first success and --force to replace a file";

const lowestError = 400;

/** A parameter's value: its own example, else one its schema accepts; `other` makes a second, such as a missing bond's
 * id, where the schema's pattern allows. */
function parameterValue(api: ApiDocument, parameter: ApiParameter, other: boolean): string {
  const { pattern } = parameter.schema;
  const otherText = typeof pattern === "string" ? textMatching(pattern, true) : "missing";
  const own =
    parameter.example ??
    exampleOf(api.document, parameter.schema, { every: false, name: parameter.name });
  const value = other ? (otherText ?? own) : own;
  return typeof value === "string" ? value : JSON.stringify(value ?? parameter.name);
}

/** The request a fixture of `operation` matches: its path with each parameter filled, the query it requires, and its
 * body. An error's path parameters differ from a success's, so the two fixtures answer different requests. */
function requestFor(api: ApiDocument, operation: ApiOperation, other: boolean): FixtureRequest {
  const value = (parameter: ApiParameter): string => parameterValue(api, parameter, other);
  let filled = operation.template;
  for (const parameter of operation.parameters.filter(({ in: place }) => place === "path")) {
    filled = filled.replaceAll(`{${parameter.name}}`, encodeURIComponent(value(parameter)));
  }
  const query = operation.parameters
    .filter((parameter) => parameter.in === "query" && parameter.required)
    .map((parameter) => [parameter.name, [value(parameter)]] as const);
  const body =
    operation.body === undefined
      ? undefined
      : exampleOf(api.document, operation.body, { every: false, name: "body" });
  return {
    method: operation.method,
    path: filled,
    ...(query.length === 0 ? {} : { query: Object.fromEntries(query) }),
    ...(body === undefined ? {} : { body }),
  };
}

/** A problem details body for an error status: its type and title from the response's description, which basis
 * writes as `unknown-bond: No bond has that ISIN`, and what the schema requires besides. */
function problemBody(
  api: ApiDocument,
  response: ApiResponse,
  schema: Readonly<Record<string, unknown>>,
): unknown {
  const status = Number(response.status);
  const named = /^(?<type>[\w-]+): (?<title>[^;]+)/u.exec(response.description)?.groups ?? {};
  const { type = "about:blank", title = STATUS_CODES[status] ?? "Error" } = named;
  const required = exampleOf(api.document, schema, { every: false, name: "problem" });
  return {
    ...(typeof required === "object" && required !== null ? required : {}),
    detail: `${title}.`,
    instance: `urn:uuid:019a5c3e-0000-7000-8000-000000000${response.status}`,
    status,
    title,
    type,
  };
}

/** The JSON media type a response answers in, or a failure for one with only bytes. */
function jsonTypeOf(operation: ApiOperation, response: ApiResponse): string {
  const types = Object.keys(response.content);
  const json = types.find((type) => type === "application/json" || type.endsWith("+json"));
  if (types.includes(arrowStream) && Number(response.status) < lowestError) {
    throw new TaskError(
      `ERROR operation ${operation.id} answers ${response.status} with Arrow, which basis-ui's client asks a dataset route for, and a fixture holds Arrow as bytes: export one with basis records export, or write the IPC stream's bytes in base64 as body_base64 with media_type ${arrowStream}.`,
    );
  }
  if (json === undefined) {
    throw new TaskError(
      `ERROR operation ${operation.id} answers ${response.status} with ${types.join(" or ")}, not JSON, and vp run fixtures new writes only a JSON body: write the bytes in base64 as body_base64 with their media_type.`,
    );
  }
  return json;
}

/** The response a fixture answers with, its body checked against its schema. */
function responseFor(
  api: ApiDocument,
  operation: ApiOperation,
  response: ApiResponse,
): Readonly<Record<string, unknown>> {
  const status = Number(response.status);
  if (Object.keys(response.content).length === 0) {
    return { status };
  }
  const mediaType = jsonTypeOf(operation, response);
  const schema = response.content[mediaType] ?? {};
  const body =
    status >= lowestError
      ? problemBody(api, response, schema)
      : (exampleOf(api.document, schema, { every: true, name: "value" }) ?? null);
  const issues = schemaIssues(api.document, schema, body);
  if (issues.length > 0) {
    throw new TaskError(
      `ERROR the body made from operation ${operation.id}'s ${response.status} schema fails it at ${issues.join("; ")}: give the field an example in the API's document, or write the fixture by hand.`,
    );
  }
  return { body, media_type: mediaType, status };
}

/** The response `status` names, or the operation's first success. */
function responseNamed(operation: ApiOperation, status: string | undefined): ApiResponse {
  const response =
    status === undefined
      ? successOf(operation)
      : operation.responses.find((candidate) => candidate.status === status);
  if (response === undefined) {
    const declared = operation.responses.map((candidate) => candidate.status).join(", ");
    throw new TaskError(
      `ERROR operation ${operation.id} declares no ${status ?? "success"} response: name one it declares, ${declared}, with --status.`,
    );
  }
  return response;
}

/** A fixture of `operation` answering `status`, or its first success. */
function fixtureFor(api: ApiDocument, operation: ApiOperation, status?: string): NewFixture {
  const response = responseNamed(operation, status);
  const other = Number(response.status) >= lowestError;
  return {
    format: "basis-ui-fixture/1",
    operation_id: operation.id,
    recorded_at: new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
    request: requestFor(api, operation, other),
    response: responseFor(api, operation, response),
  };
}

/** What writing a fixture prints: the file and its request, and any other fixture answering the same request. */
function writtenLine(root: string, fixture: NewFixture, file: string): string {
  const status = String(fixture.response["status"]);
  const lines = [
    `Wrote ${file}: ${fixture.request.method} ${fixture.request.path} answered ${status}.`,
  ];
  const shadows = sameRequest(root, fixture, file);
  if (shadows.length > 0) {
    lines.push(
      `${shadows.join(", ")} answer${shadows.length === 1 ? "s" : ""} the same request; vp dev serves the first of them by name.`,
    );
  }
  return lines.join("\n");
}

/** The file a new fixture goes in: the operation's id in kebab case, and the status unless it is the first success. */
function fixtureFile(operation: ApiOperation, status: string | undefined): string {
  const base = operation.id.replaceAll(/[^\dA-Za-z]+/gu, "-").toLowerCase();
  const suffix =
    status === undefined || status === successOf(operation)?.status ? "" : `-${status}`;
  return `fixtures/${base}${suffix}.json`;
}

interface NewArgs {
  readonly operation: string;
  readonly status: string | undefined;
  readonly force: boolean;
}

/** The flag at `at` of `rest`, `--status N` or `--force`, and how many arguments it takes. */
function flagAt(
  rest: readonly string[],
  at: number,
): { readonly status?: string; readonly force?: true; readonly width: number } {
  const arg = rest[at] ?? "";
  const next = rest[at + 1] ?? "";
  if (arg === "--force") {
    return { force: true, width: 1 };
  }
  if (arg !== "--status") {
    throw new TaskError(`ERROR vp run fixtures new takes no ${arg}: ${usage}.`);
  }
  if (!/^\d{3}$/u.test(next)) {
    throw new TaskError(`ERROR --status takes an HTTP status, such as 404: ${usage}.`);
  }
  return { status: next, width: 2 };
}

/** What follows `vp run fixtures new OPERATION`: `--status N` and `--force`, in any order. */
function flagsOf(rest: readonly string[]): Omit<NewArgs, "operation"> {
  const found: { status: string | undefined; force: boolean } = { force: false, status: undefined };
  for (let at = 0; at < rest.length;) {
    const { width, ...flag } = flagAt(rest, at);
    Object.assign(found, flag);
    at += width;
  }
  return found;
}

function newArgsOf(args: readonly string[]): NewArgs {
  const [operation, ...rest] = args;
  if (operation === undefined || operation.startsWith("-")) {
    throw new TaskError(`ERROR vp run fixtures new needs the operation's id: ${usage}.`);
  }
  return { ...flagsOf(rest), operation };
}

/** `vp run fixtures new OPERATION [--status N] [--force]`. */
function newFixture(root: string, args: readonly string[]): string {
  const { operation: id, status, force } = newArgsOf(args);
  const api = readApi(root);
  const operation = operationNamed(api, id);
  const fixture = fixtureFor(api, operation, status);
  const file = fixtureFile(operation, status);
  writeNew(root, [{ file, text: `${JSON.stringify(fixture, undefined, 2)}\n` }], {
    force,
    task: "vp run fixtures new",
  });
  formatFiles(root, [file]);
  return writtenLine(root, fixture, file);
}

/** `vp run fixtures`, `check` or `new`. */
async function fixturesTask(root: string, args: readonly string[]): Promise<string> {
  const [verb, ...rest] = args;
  if (verb === "new") {
    return newFixture(root, rest);
  }
  if (verb === undefined || verb === "check") {
    if (rest.length > 0) {
      throw new TaskError(`ERROR vp run fixtures check takes no ${rest.join(" ")}: ${usage}.`);
    }
    return checkFixtures(root, []);
  }
  throw new TaskError(`ERROR ${verb} is no command of vp run fixtures: ${usage}.`);
}

export { fixtureFor, fixturesTask, parameterValue, requestFor };
export type { FixtureRequest, NewFixture };
