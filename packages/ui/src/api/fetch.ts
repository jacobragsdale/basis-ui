// The one place an app's generated client calls `fetch`. orval's generated hooks call `apiFetch` as their mutator;
// it attaches the signed-in user's JWT, keeps every request on the page's origin under `/api`, parses each response by
// the Zod schema orval passes, reads Arrow as bytes, and turns every failure into an `ApiError` holding problem details.
// Spike 0.2 (docs/spikes/orval.md) found the configuration that drives it.

import type { ZodType } from "zod";

import {
  problemSchema,
  validationProblemSchema,
  type Problem,
  type ValidationProblem,
} from "./problem.ts";

/** The ingress routes `/api` to the API and the rest to the UI, so the browser makes no cross-origin calls. */
export const apiPrefix = "/api";

/** The media type basis's contract returns datasets in. */
export const arrowStream = "application/vnd.apache.arrow.stream";

/** Supplies the signed-in user's JWT, or `null` for an anonymous user. The sign-in adapter provides it. */
export type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource = async () => null;

/** Sets where `apiFetch` gets the user's token. The app shell calls it once, at startup. */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

/** A request as orval passes it: `RequestInit`, plus the response's Zod schema when its configuration asks for it. */
export interface ApiRequestInit extends RequestInit {
  readonly schema?: ZodType;
}

/** A response as orval's hooks return it. */
export interface ApiResponse<TData> {
  readonly data: TData;
  readonly status: number;
  readonly headers: Headers;
}

export type AnyProblem = Problem | ValidationProblem;

/** What a failed call throws, so TanStack Query's `error` holds the parsed problem details. */
export class ApiError<TProblem = AnyProblem> extends Error {
  readonly status: number;
  readonly problem: TProblem;

  constructor(status: number, problem: TProblem, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/** orval reads this export and types each hook's error as `ErrorType<the operation's problem types>`. */
export type ErrorType<TProblem> = ApiError<TProblem>;

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
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
    response.status === 422
      ? validationProblemSchema.safeParse(body)
      : problemSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    type: "about:blank",
    title: response.statusText || "Request failed",
    status: response.status,
  };
}

/** The mutator orval's generated client calls for every operation. */
export async function apiFetch<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const { schema, ...request } = init;
  const headers = new Headers(request.headers);
  const token = await tokenSource();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${apiPrefix}${url}`, { ...request, headers });
  const body = await readBody(response, headers.get("accept") === arrowStream);
  if (!response.ok) {
    const problem = toProblem(response, body);
    throw new ApiError(
      response.status,
      problem,
      problem.title ?? `Request failed with status ${String(response.status)}`,
    );
  }
  const data = schema === undefined ? body : schema.parse(body);
  const result: ApiResponse<unknown> = { data, status: response.status, headers: response.headers };
  // orval's mutator contract is generic in the response type; the schema above is what makes the data that type.
  return result as T;
}
