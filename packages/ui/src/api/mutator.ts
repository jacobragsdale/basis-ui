/* `@basis/ui/mutator`: the module an app's generated client imports `apiFetch` and `ErrorType` from. It ships as
 * TypeScript, not built, because orval reads it while it generates: it looks for `export type ErrorType` in the file's
 * text, to type each hook's error, and parses `apiFetch`'s declaration for its two parameters, to pass each call's
 * request options. It delegates to `@basis/ui`'s own `apiFetch`, so the generated client and the app shell share one
 * token source and one `ApiError` class. */

import { apiFetch as sharedFetch } from "@basis/ui";
import type { ApiError, ApiRequestInit } from "@basis/ui";

/** The mutator orval's generated client calls for every operation: `@basis/ui`'s `apiFetch`. */
async function apiFetch<TResponse>(url: string, init?: ApiRequestInit): Promise<TResponse> {
  return sharedFetch<TResponse>(url, init);
}

/** What a generated hook's error is: `ApiError`, holding the operation's problem details. */
export type ErrorType<TProblem> = ApiError<TProblem>;

export { apiFetch };
