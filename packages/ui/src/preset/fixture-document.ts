/* Whether each fixture fits the API it stands in for, by the app's `openapi.json`: its operation exists, its method and
 * path are that operation's, and its body's media type is one the operation answers that status with. A dataset
 * route's success must be Arrow, since basis-ui's client asks a dataset route only for Arrow. A fixture that a pull of
 * a newer document has left behind fails here, rather than serving answers the API no longer gives. */

import { z } from "zod";

import { arrowStream } from "#api/fetch.ts";
import { fixtureProblem } from "#fixtures/load.ts";
import type { LoadedFixture } from "#fixtures/record.ts";

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
}

/** A path template as a pattern: each `{parameter}` one segment, the rest as written. */
function patternOf(template: string): RegExp {
  const parts = template
    .split(/\{[^}]+\}/u)
    .map((part) => part.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`));
  return new RegExp(`^${parts.join("[^/]+")}$`, "u");
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
      return [
        { dataset, id, method, pattern: patternOf(template), responses: mediaTypes, template },
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
  return misfit === undefined ? [] : [problem(misfit)];
}

export { documentProblems, operationsOf };
export type { Operation };
