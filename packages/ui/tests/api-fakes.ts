/* Fakes for the API layer's tests: `fetch` stubbed with one answer, and the `ApiError` a call fails with. */

import { vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";

import { isApiError } from "#index.ts";
import type { ApiError, TokenSource } from "#index.ts";

/** `fetch`'s type, written out: the preset bans naming the global outside the client layer. */
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Stubs `fetch` to answer every request with `response`, and returns the stub so a test can read its requests. */
function answer(response: Response): Mock<Fetch> {
  const stub = vi.fn<Fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", stub);
  return stub;
}

/** The URL and headers of the first request the stub answered. */
function firstRequest(stub: Mock<Fetch>): { readonly headers: Headers; readonly url: unknown } {
  const [url, init] = stub.mock.calls[0] ?? [];
  return { headers: new Headers(init?.headers), url };
}

function json(status: number, body: unknown, contentType = "application/json"): Response {
  return Response.json(body, { headers: { "content-type": contentType }, status });
}

function tokenSource(token: string | null): TokenSource {
  return vi.fn<TokenSource>().mockResolvedValue(token);
}

/** The `ApiError` a call fails with. Fails the test if the call succeeds or throws anything else. */
async function failureOf(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (error) {
    if (isApiError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("The call succeeded, but it should have failed with an ApiError.");
}

/** A response as a server sends it: `body` under `contentType`, or under none. */
function sent(status: number, body: string | null, contentType?: string): Response {
  return new Response(body, {
    headers: contentType === undefined ? {} : { "content-type": contentType },
    status,
  });
}

export { answer, failureOf, firstRequest, json, sent, tokenSource };
export type { Fetch };
