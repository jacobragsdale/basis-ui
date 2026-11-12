/* The one place an app's generated client calls `fetch`. orval's generated hooks call `apiFetch` as their mutator;
 * it attaches the signed-in user's JWT, keeps every request on the page's origin under `/api`, parses each response by
 * the Zod schema orval passes, reads Arrow as bytes, and turns every failure into an `ApiError` holding problem details.
 * Spike 0.2 (docs/spikes/orval.md) found the configuration that drives it. */

import type { ZodType } from "zod";

import { problemSchema, validationProblemSchema } from "./problem.ts";
import type { Problem, ValidationProblem } from "./problem.ts";

/** The ingress routes `/api` to the API and the rest to the UI, so the browser makes no cross-origin calls. */
const apiPrefix = "/api";

/** The media type basis's contract returns datasets in. */
const arrowStream = "application/vnd.apache.arrow.stream";

/** The status of a request that fails validation, whose problem details name each field at fault. */
const unprocessableContent = 422;

/** Supplies the signed-in user's JWT, or `null` for an anonymous user. The sign-in adapter provides it. */
type TokenSource = () => Promise<string | null>;

/** Where `apiFetch` gets the user's token. Until the app shell sets one, every request is anonymous. */
let tokenSource: TokenSource | null = null;

/** Sets where `apiFetch` gets the user's token. The app shell calls it once, at startup. */
function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

/** A request as orval passes it: `RequestInit`, plus the response's Zod schema when its configuration asks for it. */
interface ApiRequestInit extends RequestInit {
  readonly schema?: ZodType;
}

/** A response as orval's hooks return it. */
interface ApiResponse<TData> {
  readonly data: TData;
  readonly status: number;
  readonly headers: Headers;
}

type AnyProblem = Problem | ValidationProblem;

/** What a failed call throws, so TanStack Query's `error` holds the parsed problem details. */
class ApiError<TProblem = AnyProblem> extends Error {
  public readonly status: number;
  public readonly problem: TProblem;

  public constructor(status: number, problem: TProblem, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/** The error type orval reads from this module: each hook's error is `ErrorType<the operation's problem types>`. */
type ErrorType<TProblem> = ApiError<TProblem>;

/** Whether `error` is the `ApiError` a generated hook fails with, holding the API's status and problem details. */
function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** The request's headers, with the signed-in user's token when there is one. */
async function headersFor(request: RequestInit): Promise<Headers> {
  const headers = new Headers(request.headers);
  const token = tokenSource === null ? null : await tokenSource();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/** JSON first, since a failed Arrow request still answers with problem details. */
async function readBody(response: Response, wantsArrow: boolean): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    const body: unknown = await response.json();
    return body;
  }
  if (wantsArrow || contentType.startsWith(arrowStream)) {
    return response.blob();
  }
  return response.text();
}

/** A 422 names its fields. Anything that is not problem details, such as a proxy's HTML error page, becomes one. */
function toProblem(response: Response, body: unknown): AnyProblem {
  const parsed =
    response.status === unprocessableContent
      ? validationProblemSchema.safeParse(body)
      : problemSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    status: response.status,
    title: response.statusText || "Request failed",
    type: "about:blank",
  };
}

/** The `ApiError` a failed response's body becomes. */
function failure(response: Response, body: unknown): ApiError {
  const problem = toProblem(response, body);
  return new ApiError(
    response.status,
    problem,
    problem.title ?? `Request failed with status ${String(response.status)}`,
  );
}

/** The mutator orval's generated client calls for every operation. */
async function apiFetch<TResponse>(url: string, init: ApiRequestInit = {}): Promise<TResponse> {
  const { schema, ...request } = init;
  const headers = await headersFor(request);
  const response = await fetch(`${apiPrefix}${url}`, { ...request, headers });
  const body = await readBody(response, headers.get("accept") === arrowStream);
  if (!response.ok) {
    throw failure(response, body);
  }
  const data = schema === undefined ? body : schema.parse(body);
  const result: ApiResponse<unknown> = { data, headers: response.headers, status: response.status };
  // The mutator contract orval expects is generic in the response type; the schema above makes the data that type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller names the type, so no guard can narrow to it.
  return result as TResponse;
}

/** A dataset route's response, its Arrow body unread, for `@basis/parallax`'s `useDataset` to stream batch by batch:
 * `useDataset("trades", async () => arrowResponse(getTradesUrl()))`, with the URL from the generated client. It asks
 * for Arrow under `/api` with the user's token, as the generated call does, whose `Blob` has arrived whole before the
 * engine sees a byte; a failure throws the same `ApiError`. */
async function arrowResponse(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = await headersFor(init);
  headers.set("Accept", arrowStream);
  const response = await fetch(`${apiPrefix}${url}`, { ...init, headers });
  if (!response.ok) {
    throw failure(response, await readBody(response, false));
  }
  return response;
}

export { ApiError, apiFetch, apiPrefix, arrowResponse, arrowStream, isApiError, setTokenSource };
export type { AnyProblem, ApiRequestInit, ApiResponse, ErrorType, TokenSource };
