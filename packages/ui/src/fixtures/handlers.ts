/* Fixture mode's answer to every request under `/api`, in one MSW handler, tried in this order:
 *
 *   1. the records exported into `.fixtures/`;
 *   2. the synthetic responses the app commits in `fixtures/`;
 *   3. orval's generated handlers.
 *
 * Within the first two, the first fixture whose method, path and query match the request answers, in the order of
 * the files' names. A request for Arrow that no fixture answers gets a problem rather than orval's random bytes, which
 * are not Arrow, and so does a request nothing answers. Each answer is reported through telemetry, as the event
 * `fixture.answered`, with the source that gave it and, when nothing answered, the problem's detail as `problem`, and
 * named on the response, in the headers answered-by.ts names. */

import { HttpResponse, getResponse, http, passthrough } from "msw";
import type { RequestHandler } from "msw";

import { apiPrefix, arrowStream } from "#api/fetch.ts";
import { consoleTelemetry } from "#shell/telemetry.ts";
import type { Telemetry, TelemetryAttributes } from "#shell/telemetry.ts";

import { bodyFilesPath, fileHeader, sourceHeader } from "./answered-by.ts";
import type { AnswerSource } from "./answered-by.ts";
import { bodyFileOf } from "./record.ts";
import type { FixtureRecord, FixtureResponse, LoadedFixture } from "./record.ts";

/** The status fixture mode answers a request with when nothing it holds can: the request is fine, the fixtures lack it. */
const notImplemented = 501;

/** What answers fixture mode's requests. */
interface FixtureHandlersOptions {
  /** The records exported into `.fixtures/`, in the order to try them. */
  readonly records: readonly LoadedFixture[];
  /** The synthetic responses in `fixtures/`, in the order to try them. */
  readonly fixtures: readonly LoadedFixture[];
  /** orval's generated handlers, one for each operation, for what no fixture answers. */
  readonly generated: readonly RequestHandler[];
  /** Where each answer is reported; the console by default. */
  readonly telemetry?: Telemetry;
  /** Reads the file a fixture's `body_file` names, by its path from the app's root, as a response whose body streams;
   * by default, from where `vp dev` serves it, `bodyFilesPath` under `/`. */
  readonly bodyFiles?: BodyFiles;
}

/** Reads a body file, by its path from the app's root. */
type BodyFiles = (file: string) => Promise<Response>;

/** Reads body files from where fixture mode serves them, `bodyFilesPath` under the app's `base`, as `/`. */
function servedBodyFiles(base: string): BodyFiles {
  return async (file) => {
    const encoded = file
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    // oxlint-disable-next-line basis/no-fetch -- fixture mode reads its own files from beside the page, no API.
    return fetch(`${base}${bodyFilesPath}${encoded}`);
  };
}

/** A request as fixture mode matches it: its method, its path without `/api`, and its query. */
interface RequestKey {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
}

/** A path as a URL holds it, percent-encoded the way the browser encodes a request's. */
function normalPath(path: string): string {
  return new URL(path, "http://fixture.invalid").pathname;
}

/** Whether `query` holds exactly `expected`'s keys, each with its values in the same order. */
function sameQuery(
  expected: Readonly<Record<string, readonly string[]>>,
  query: URLSearchParams,
): boolean {
  const keys = Object.keys(expected);
  if (new Set(query.keys()).size !== keys.length) {
    return false;
  }
  return keys.every((key) => {
    const values = query.getAll(key);
    const wanted = expected[key] ?? [];
    return (
      values.length === wanted.length && values.every((value, index) => value === wanted[index])
    );
  });
}

function matches(record: FixtureRecord, key: RequestKey): boolean {
  const { method, path, query = {} } = record.request;
  return method === key.method && normalPath(path) === key.path && sameQuery(query, key.query);
}

/** The bytes of a base64 body, as RFC 4648 writes them. */
function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0);
}

/** What fixture mode gives for a request: the response, what answered it, and, when nothing did, what to add. */
interface Answer {
  readonly response: Response;
  readonly source: AnswerSource;
  readonly problem?: string;
}

/** The problem response that says no fixture answers the request, with `detail` saying what to add. */
function missingResponse(detail: string): Response {
  const problem = {
    detail,
    status: notImplemented,
    title: "No fixture answers this request",
    type: "fixture-missing",
  };
  return new HttpResponse(JSON.stringify(problem), {
    headers: { "content-type": "application/problem+json" },
    status: notImplemented,
  });
}

/** The problem fixture mode answers when nothing it holds answers the request, saying what to add. */
function missing(detail: string): Answer {
  return { problem: detail, response: missingResponse(detail), source: "none" };
}

/** A body file's response, streamed as it is read, with its length; or, when it cannot be read, the problem that says
 * so. */
async function bodyFileAnswer(
  fixture: LoadedFixture,
  file: string,
  { bodyFiles, headers }: { readonly bodyFiles: BodyFiles; readonly headers: Headers },
): Promise<Answer> {
  const read = await bodyFiles(file).catch((error: unknown) => error);
  if (!(read instanceof Response) || !read.ok) {
    const reason = read instanceof Response ? `answered ${String(read.status)}` : String(read);
    return missing(
      `${fixture.file} answers with the body file ${file}, which could not be read (${reason}): write it, as the app's own task for its data says, or correct body_file.`,
    );
  }
  const length = read.headers.get("content-length");
  if (length !== null) {
    headers.set("content-length", length);
  }
  const { status } = fixture.record.response;
  return { response: new HttpResponse(read.body, { headers, status }), source: fixture.source };
}

/** The body a fixture holds in itself: its JSON, its base64 bytes, or none. */
function heldBody(response: FixtureResponse): BodyInit | null {
  if ("body" in response) {
    return JSON.stringify(response.body);
  }
  return "body_base64" in response ? bytesOf(response.body_base64) : null;
}

/** The response a fixture holds, with its headers, and its body under its media type, a body file's streamed. */
async function responseOf(fixture: LoadedFixture, bodyFiles: BodyFiles): Promise<Answer> {
  const { response } = fixture.record;
  const headers = new Headers(response.headers);
  if ("media_type" in response) {
    headers.set("content-type", response.media_type);
  }
  const file = bodyFileOf(fixture);
  if (file !== undefined) {
    return bodyFileAnswer(fixture, file, { bodyFiles, headers });
  }
  const body = heldBody(response);
  return {
    response: new HttpResponse(body, { headers, status: response.status }),
    source: fixture.source,
  };
}

/** The request's key, or `undefined` for one outside `/api`. */
function keyOf(request: Request): RequestKey | undefined {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${apiPrefix}/`)) {
    return undefined;
  }
  return {
    method: request.method.toUpperCase(),
    path: url.pathname.slice(apiPrefix.length),
    query: url.searchParams,
  };
}

/** How the request reads in a report: `GET /bonds/US91282CRF04?settle=2026-11-06`. */
function described(key: RequestKey): string {
  const search = key.query.size === 0 ? "" : `?${key.query.toString()}`;
  return `${key.method} ${key.path}${search}`;
}

/** The answer orval's handlers give, or the problem that says no fixture does: they make random bytes for Arrow, which
 * no reader takes, so a request for Arrow is answered only by a fixture. */
async function generatedAnswer(
  request: Request,
  key: RequestKey,
  generated: readonly RequestHandler[],
): Promise<Answer> {
  if (request.headers.get("accept")?.includes(arrowStream) === true) {
    return missing(
      `${described(key)} asks for Arrow, which orval's generated handlers cannot make: add a fixture of it to fixtures/, with its Arrow bytes as body_base64, or in a file beside it as body_file.`,
    );
  }
  const response = await getResponse([...generated], request);
  if (response !== undefined) {
    return { response, source: "generated" };
  }
  return missing(
    `No fixture or generated handler answers ${described(key)}: add a fixture of it to fixtures/, or run vp run client-pull if the API has gained the route.`,
  );
}

/** `response`, with headers naming its source and the file that holds it, if any. A generated handler's response can
 * hold headers that may not change, so its parts are copied into a new one. */
function named(response: Response, source: AnswerSource, file: string | undefined): Response {
  const headers = new Headers(response.headers);
  headers.set(sourceHeader, source);
  if (file !== undefined) {
    headers.set(fileHeader, file);
  }
  const { body, status, statusText } = response;
  return new Response(body, { headers, status, statusText });
}

/** The MSW handlers of fixture mode: one, for every request under `/api`. */
function fixtureHandlers({
  records,
  fixtures,
  generated,
  telemetry = consoleTelemetry,
  bodyFiles = servedBodyFiles("/"),
}: FixtureHandlersOptions): RequestHandler[] {
  const held = [...records, ...fixtures];
  return [
    http.all(`*${apiPrefix}/*`, async ({ request }) => {
      const key = keyOf(request);
      // The pattern also matches a module's own address, such as /src/api/client.ts, which goes to the server.
      if (key === undefined) {
        return passthrough();
      }
      const fixture = held.find(({ record }) => matches(record, key));
      const answer: Answer =
        fixture === undefined
          ? await generatedAnswer(request, key, generated)
          : await responseOf(fixture, bodyFiles);
      const attributes: TelemetryAttributes = {
        request: described(key),
        source: answer.source,
        status: answer.response.status,
        ...(fixture === undefined ? {} : { file: fixture.file }),
        ...(answer.problem === undefined ? {} : { problem: answer.problem }),
      };
      telemetry.event("fixture.answered", attributes);
      return named(answer.response, answer.source, fixture?.file);
    }),
  ];
}

export { fixtureHandlers, servedBodyFiles };
export type { BodyFiles, FixtureHandlersOptions };
