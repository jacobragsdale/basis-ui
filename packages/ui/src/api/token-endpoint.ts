/* The one request the client makes outside `/api`: the sign-in adapter's, to the token endpoint that signs the browser
 * in with the user's Windows account (src/shell/windows-sign-in.ts). It goes with the browser's credentials, so that
 * the browser answers the endpoint's Negotiate or NTLM challenge, and carries no token. */

import { NetworkError } from "./network-error.ts";

/** `fetch`'s type, written out. */
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The browser's `fetch`, called as a function of the page's. */
async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/** Asks `tokenUrl` for a token with the browser's credentials, through `given` in a test. A request that never reached
 * it is a `NetworkError`. */
async function requestToken(
  tokenUrl: string,
  method: "GET" | "POST",
  given: Fetch = browserFetch,
): Promise<Response> {
  try {
    return await given(tokenUrl, {
      credentials: "include",
      headers: { Accept: "application/json, text/plain" },
      method,
    });
  } catch (error) {
    throw error instanceof TypeError ? new NetworkError(error.message, { cause: error }) : error;
  }
}

export { requestToken };
export type { Fetch };
