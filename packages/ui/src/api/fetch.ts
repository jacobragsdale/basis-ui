/* The one place an app's generated client calls `fetch`. orval's generated hooks call `apiFetch` as their mutator;
 * it attaches the signed-in user's JWT, keeps every request on the page's origin under `/api`, parses each response by
 * the Zod schema orval passes, reads Arrow as bytes, and turns every failure into an `ApiError` holding problem details.
 * Spike 0.2 (docs/spikes/orval.md) found the configuration that drives it. */

import type { ZodType } from "zod";

import { NetworkError } from "./network-error.ts";
import { problemSchema, validationProblemSchema } from "./problem.ts";
import type { Problem, ValidationProblem } from "./problem.ts";

/** The ingress routes `/api` to the API and the rest to the UI, so the browser makes no cross-origin calls. */
const apiPrefix = "/api";

/** The media type basis's contract returns datasets in. */
const arrowStream = "application/vnd.apache.arrow.stream";

/** The status of a request that fails validation, whose problem details name each field at fault. */
const unprocessableContent = 422;

/** The status of a request the API would not accept the token of, or that needs one. */
const unauthorized = 401;

/** Supplies the signed-in user's JWT, or `null` for an anonymous user. The sign-in adapter provides it. */
type TokenSource = () => Promise<string | null>;

/** Drops a token an API answered `invalid-token` to and gets a new one, resolving `true` when the request is worth
 * sending once more. The sign-in adapter's `renew` provides it. */
type TokenRenewal = (refused: string) => Promise<boolean>;

/** Where `apiFetch` gets the user's token, and how it renews one an API refused. Until the app shell sets them, every
 * request is anonymous. */
let tokenSource: TokenSource | null = null;
let tokenRenewal: TokenRenewal | null = null;

/** Sets where `apiFetch` gets the user's token, and how it renews one an API answered `invalid-token` to, sending the
 * request once more. The app shell calls it once, at startup. */
function setTokenSource(source: TokenSource, renew?: TokenRenewal): void {
  tokenSource = source;
  tokenRenewal = renew ?? null;
}

/** Runs a request outside TanStack Query, named by its URL: once, until the app shell sets its own, which retries,
 * reports and answers its failure as a query's (src/shell/outside-queries.ts). */
type RequestRunner = <TResult>(request: () => Promise<TResult>, name: string) => Promise<TResult>;

async function runOnce<TResult>(request: () => Promise<TResult>): Promise<TResult> {
  return request();
}

/** How a request outside TanStack Query runs. */
let requestRunner: RequestRunner = runOnce;

/** Sets how a request outside TanStack Query, such as `arrowResponse`'s, runs. The app shell calls it while it is
 * mounted; the returned function puts back the one before. */
function setRequestRunner(runner: RequestRunner): () => void {
  const before = requestRunner;
  requestRunner = runner;
  return () => {
    requestRunner = before;
  };
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

/** What a generated hook's `error` is: whatever `apiFetch` throws. orval names the operation's declared problems, but
 * any status may answer, a 502 from an ingress as well as the 422 an operation declares, and a request may never reach
 * the API, so the error is an `ApiError` of the declared problems or of any other, or another `Error`: a
 * `NetworkError`, or the `ZodError` of a response its schema refused. Narrow it with `isApiError` before reading its
 * problem, and read a 422's fields with `fieldErrors`, which reads any problem. */
type ErrorType<TProblem> = ApiError<TProblem | AnyProblem> | Error;

/** Whether `error` is the `ApiError` a generated hook fails with, holding the API's status and problem details. */
function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** `fetch`, its own failure thrown as a `NetworkError`. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiPrefix}${url}`, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError(error.message, { cause: error });
    }
    throw error;
  }
}

/** The request's headers, with `token` when there is one. */
function headersWith(request: RequestInit, token: string | null): Headers {
  const headers = new Headers(request.headers);
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/** Whether `response` is an API's `invalid-token`: a 401 whose problem details say so. Read from a copy, so the body
 * stays for the failure it becomes. */
async function refusesToken(response: Response): Promise<boolean> {
  if (response.status !== unauthorized) {
    return false;
  }
  try {
    const body: unknown = await response.clone().json();
    return problemSchema.safeParse(body).data?.type === "invalid-token";
  } catch {
    return false;
  }
}

/** Sends the request with the user's token, and, when the API answers `invalid-token` and the adapter renews the
 * token, once more with the new one. */
async function sendSigned(url: string, request: RequestInit): Promise<Response> {
  const token = tokenSource === null ? null : await tokenSource();
  const response = await send(url, { ...request, headers: headersWith(request, token) });
  if (token === null || tokenRenewal === null || !(await refusesToken(response))) {
    return response;
  }
  if (!(await tokenRenewal(token))) {
    return response;
  }
  const renewed = tokenSource === null ? null : await tokenSource();
  return send(url, { ...request, headers: headersWith(request, renewed) });
}

/** The statuses that never carry a body, whatever the headers say. */
const noContentStatus = 204;
const resetContentStatus = 205;
const noContent = new Set([noContentStatus, resetContentStatus]);

/** JSON as the content type says, read from the text so that an empty body is none: FastAPI answers a 204 with
 * `content-type: application/json` and no body. A failure's body that is not the JSON it claims, such as an ingress's
 * error page or a body cut short, is kept as text, so that it still becomes an `ApiError` with its status; a success's
 * throws, since its data cannot be read. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    const body: unknown = JSON.parse(text);
    return body;
  } catch (error) {
    if (response.ok) {
      throw error;
    }
    return text;
  }
}

/** A response's body: none for a 204, a 205 or an empty body, whatever its content type; JSON first, since a failed
 * Arrow request still answers with problem details; Arrow as bytes; otherwise text. */
async function readBody(response: Response, wantsArrow: boolean): Promise<unknown> {
  if (noContent.has(response.status)) {
    return undefined;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return readJson(response);
  }
  if (wantsArrow || contentType.startsWith(arrowStream)) {
    return response.blob();
  }
  const text = await response.text();
  return text === "" ? undefined : text;
}

/** A 422 names its fields, and is still problem details when it does not. Anything that is not problem details, such
 * as a proxy's HTML error page, becomes one with no title, so that the status's own words show: over HTTP/2 there is no
 * status text to borrow. */
function toProblem(response: Response, body: unknown): AnyProblem {
  if (response.status === unprocessableContent) {
    const validation = validationProblemSchema.safeParse(body);
    if (validation.success) {
      return validation.data;
    }
  }
  const parsed = problemSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return { status: response.status, type: "about:blank" };
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
  const response = await sendSigned(url, request);
  const body = await readBody(response, new Headers(request.headers).get("accept") === arrowStream);
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
 * `useDataset("trades", async ({ signal }) => arrowResponse(getTradesUrl(), { signal }))`, with the URL from the
 * generated client, and the signal that aborts the request once no component waits for the load. It asks
 * for Arrow under `/api` with the user's token, as the generated call does, whose `Blob` has arrived whole before the
 * engine sees a byte; a failure throws the same `ApiError`. Inside `BasisApp` it goes through the shell as a query does:
 * a failure that may pass is asked again, and the last is reported to telemetry and its sign-in problem answered. */
async function arrowResponse(url: string, init: RequestInit = {}): Promise<Response> {
  return requestRunner(async () => {
    const headers = new Headers(init.headers);
    headers.set("Accept", arrowStream);
    const response = await sendSigned(url, { ...init, headers });
    if (!response.ok) {
      throw failure(response, await readBody(response, false));
    }
    return response;
  }, url);
}

export {
  ApiError,
  apiFetch,
  apiPrefix,
  arrowResponse,
  arrowStream,
  isApiError,
  setRequestRunner,
  setTokenSource,
};
export type {
  AnyProblem,
  ApiRequestInit,
  ApiResponse,
  ErrorType,
  RequestRunner,
  TokenRenewal,
  TokenSource,
};
