/* The error a request that never reached the API fails with, apart from the `TypeError` the page's own code throws. */

/** What a request that never reached the API fails with: the `TypeError` `fetch` itself threw, for a lost
 * connection, a refused one, or a redirect the browser would not follow, as its `cause`, with its message. Only it is a
 * network failure, which the query client retries and the shell says could not reach the server: a `TypeError` thrown
 * by the page's own code, in a `select` or a token source, is a bug that asking again would not mend. */
class NetworkError extends TypeError {
  public constructor(message = "Failed to fetch", options?: ErrorOptions) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** Whether `error` is a request that never reached the API, as `apiFetch` and `arrowResponse` throw it. */
function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export { isNetworkError, NetworkError };
