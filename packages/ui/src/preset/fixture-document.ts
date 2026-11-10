/* Whether each fixture fits the API it stands in for, by the app's `openapi.json`: its operation exists, its method and
 * path are that operation's, its body's media type is one the operation answers that status with, and a JSON body is
 * one the status's schema accepts, read as the generated client reads it (schema-check.ts). A dataset
 * route's success must be Arrow, since basis-ui's client asks a dataset route only for Arrow. A fixture that a pull of
 * a newer document has left behind fails here, rather than serving answers the API no longer gives. */

import { z } from "zod";

import { arrowStream } from "#api/fetch.ts";
import { fixtureProblem } from "#fixtures/load.ts";
import type { LoadedFixture } from "#fixtures/record.ts";

import { camel, objectOf } from "./api-operations.ts";
import { schemaIssues } from "./schema-check.ts";

/** What fixture mode reads of an operation in the document: its id, and the media types of each status. */
const mediaTypesSchema = z.record(z.string(), z.unknown());
const responseSchema = z.object({ content: mediaTypesSchema.optional() });
const operationSchema = z.object({
  operationId: z.string(),
  responses: z.record(z.string(), responseSchema),
});
const pathItemSchema = z.record(z.string(), z.unknown());
const documentSchema = z.object({ paths: z.record(z.string(), pathItemSchema) });

/** The methods an OpenAPI path item holds operations under, as a record's request names them. */
const methods = new Map([
  ["delete", "DELETE"],
  ["get", "GET"],
  ["patch", "PATCH"],
  ["post", "POST"],
  ["put", "PUT"],
]);

/** An operation, as a fixture is checked against it. */
interface Operation {
  readonly id: string;
  readonly method: string;
  readonly template: string;
  /** The paths the template matches, such as `/bonds/US91282CRF04` for `/bonds/{security}`. */
  readonly pattern: RegExp;
  /** Each status the operation declares, with the media types it answers it in. */
  readonly responses: Readonly<Record<string, readonly string[]>>;
  /** Whether its success lists Arrow, so the generated client asks it for Arrow. */
  readonly dataset: boolean;
  /** Each JSON body's schema, by its status and media type. */
  readonly schemas: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** The document the operation is in, whose components its schemas refer to. */
  readonly document: Readonly<Record<string, unknown>>;
}

/** A path template as a pattern: each `{parameter}` one segment, the rest as written. */
function patternOf(template: string): RegExp {
  const parts = template
    .split(/\{[^}]+\}/u)
    .map((part) => part.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`));
  return new RegExp(`^${parts.join("[^/]+")}$`, "u");
}

/** Each response's schemas, by its status and media type. */
function schemasOf(
  responses: Readonly<
    Record<string, { readonly content?: Readonly<Record<string, unknown>> | undefined }>
  >,
): Operation["schemas"] {
  return Object.fromEntries(
    Object.entries(responses).map(([status, { content = {} }]) => [
      status,
      Object.fromEntries(
        Object.entries(content).map(([type, media]) => [type, objectOf(media)["schema"]]),
      ),
    ]),
  );
}

/** The document's operations by their ids, or `undefined` when it is not an OpenAPI document. */
function operationsOf(document: unknown): ReadonlyMap<string, Operation> | undefined {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) {
    return undefined;
  }
  const operations = Object.entries(parsed.data.paths).flatMap(([template, item]) =>
    Object.entries(item).flatMap(([key, candidate]) => {
      const method = methods.get(key);
      const operation = operationSchema.safeParse(candidate);
      if (method === undefined || !operation.success) {
        return [];
      }
      const { operationId: id, responses } = operation.data;
      const mediaTypes = Object.fromEntries(
        Object.entries(responses).map(([status, { content = {} }]) => [
          status,
          Object.keys(content),
        ]),
      );
      const dataset = mediaTypes["200"]?.includes(arrowStream) === true;
      const held = objectOf(document);
      const schemas = schemasOf(responses);
      return [
        {
          dataset,
          document: held,
          id,
          method,
          pattern: patternOf(template),
          responses: mediaTypes,
          schemas,
          template,
        },
      ];
    }),
  );
  return new Map(operations.map((operation) => [operation.id, operation]));
}

/** The media type a fixture's response is served in, or `undefined` for one with no body. */
function mediaTypeOf({ record }: LoadedFixture): string | undefined {
  return "media_type" in record.response ? record.response.media_type : undefined;
}

/** Why the fixture's body does not fit its operation, if it does not. */
function bodyMisfit(fixture: LoadedFixture, operation: Operation): string | undefined {
  const mediaType = mediaTypeOf(fixture);
  const { status } = fixture.record.response;
  // A 2xx: its status in hundreds is 2.
  const success = Math.floor(status / 100) === 2;
  if (operation.dataset && success && mediaType !== arrowStream) {
    return `answers dataset operation ${operation.id} with ${mediaType ?? "no body"}, but basis-ui's client asks a dataset route only for Arrow: its response is the Arrow IPC stream, as body_base64 with media_type ${arrowStream}`;
  }
  const declared = operation.responses[String(status)] ?? [];
  if (mediaType !== undefined && declared.length > 0 && !declared.includes(mediaType)) {
    return `answers ${String(status)} as ${mediaType}, but operation ${operation.id} answers ${String(status)} as ${declared.join(" or ")}`;
  }
  return undefined;
}

/** Why the fixture's JSON body is not one its status's schema accepts, one line for each field at fault. */
function bodyProblems(fixture: LoadedFixture, operation: Operation): string[] {
  const { response } = fixture.record;
  const mediaType = mediaTypeOf(fixture);
  const schema =
    mediaType === undefined ? undefined : operation.schemas[String(response.status)]?.[mediaType];
  if (!("body" in response) || schema === undefined) {
    return [];
  }
  const status = String(response.status);
  const reason = (issue: string): string =>
    `response.body is not what operation ${operation.id} answers ${status} with in openapi.json: ${issue}`;
  return schemaIssues(operation.document, objectOf(schema), response.body).map((issue) =>
    fixture.source === "fixture"
      ? `ERROR ${fixture.file}: ${reason(issue)}; correct the body, or replace the file with one vp run fixtures new ${operation.id} --status ${status} writes.`
      : fixtureProblem(fixture.source, fixture.file, reason(issue)),
  );
}

/** Why the fixture does not fit the document's operations, one line for each thing wrong. */
function documentProblems(
  fixture: LoadedFixture,
  operations: ReadonlyMap<string, Operation>,
): string[] {
  const { operation_id: id, request } = fixture.record;
  const problem = (reason: string): string => fixtureProblem(fixture.source, fixture.file, reason);
  const operation = operations.get(id);
  if (operation === undefined) {
    return [
      problem(
        `operation_id ${id} is not an operation in openapi.json, whose operations are ${[...operations.keys()].toSorted().join(", ")}`,
      ),
    ];
  }
  if (request.method !== operation.method || !operation.pattern.test(request.path)) {
    const hint = request.path.startsWith("/api/") ? ", and a path leaves out /api" : "";
    return [
      problem(
        `${request.method} ${request.path} is not operation ${id}, which is ${operation.method} ${operation.template}${hint}`,
      ),
    ];
  }
  const misfit = bodyMisfit(fixture, operation);
  return misfit === undefined ? bodyProblems(fixture, operation) : [problem(misfit)];
}

/** A path segment's value, as the route's parameter takes it. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The values a fixture's path gives its operation's path parameters, each under its name in the API, as `book_id`,
 * and the name orval and `vp run new` give it, as `bookId`: `{ security: "US91282CRF04" }` for
 * `GET /bonds/US91282CRF04` of `/bonds/{security}`. Empty for a fixture of no operation in the document. */
function pathParameters(
  fixture: LoadedFixture,
  operations: ReadonlyMap<string, Operation>,
): Readonly<Record<string, string>> {
  const { operation_id: id, request } = fixture.record;
  const operation = operations.get(id);
  if (operation === undefined || !operation.pattern.test(request.path)) {
    return {};
  }
  const names = operation.template.split("/");
  const values = request.path.split("/");
  return Object.fromEntries(
    names.flatMap((segment, index) => {
      const name = /^\{(?<name>[^}]+)\}$/u.exec(segment)?.groups?.["name"];
      const value = values[index];
      if (name === undefined || value === undefined) {
        return [];
      }
      const decoded = decodedSegment(value);
      return [...new Set([name, camel(name)])].map((key) => [key, decoded]);
    }),
  );
}

export { documentProblems, operationsOf, pathParameters };
export type { Operation };
