import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";
import { z } from "zod";

import {
  apiFetch,
  arrowStream,
  fieldErrors,
  isApiError,
  pointerPath,
  setTokenSource,
} from "#index.ts";
import type { ApiError, ApiResponse, TokenSource } from "#index.ts";

type Fetch = typeof fetch;

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

beforeEach(() => {
  setTokenSource(tokenSource(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const position = z.object({ id: z.string(), quantity: z.number() });

describe("apiFetch", () => {
  test("keeps the request under /api and sends no token for an anonymous user", async () => {
    const stub = answer(json(200, { id: "p1", quantity: 5 }));
    await apiFetch("/positions/p1", { schema: position });
    expect(firstRequest(stub).url).toBe("/api/positions/p1");
    expect(firstRequest(stub).headers.has("authorization")).toBe(false);
  });

  test("attaches the signed-in user's token", async () => {
    setTokenSource(tokenSource("a.b.c"));
    const stub = answer(json(200, { id: "p1", quantity: 5 }));
    await apiFetch("/positions/p1", { schema: position });
    expect(firstRequest(stub).headers.get("authorization")).toBe("Bearer a.b.c");
  });

  test("parses the body by its schema, dropping fields the schema does not know", async () => {
    answer(json(200, { added: "by a newer API", id: "p1", quantity: 5 }));
    const response = await apiFetch<ApiResponse<unknown>>("/positions/p1", { schema: position });
    expect(response.data).toEqual({ id: "p1", quantity: 5 });
    expect(response.status).toBe(200);
  });

  test("refuses a body its schema rejects", async () => {
    answer(json(200, { id: "p1", quantity: "five" }));
    await expect(apiFetch("/positions/p1", { schema: position })).rejects.toThrow(z.ZodError);
  });

  test("reads Arrow as bytes when the request asks for it", async () => {
    answer(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": arrowStream },
        status: 200,
      }),
    );
    const response = await apiFetch<ApiResponse<Blob>>("/exposures", {
      headers: { accept: arrowStream },
    });
    expect(response.data).toBeInstanceOf(Blob);
    expect(new Uint8Array(await response.data.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("apiFetch's failures", () => {
  test("throws problem details as an ApiError", async () => {
    answer(
      json(
        404,
        { status: 404, title: "No such position", type: "https://example.com/not-found" },
        "application/problem+json",
      ),
    );
    const error = await failureOf(apiFetch("/positions/x"));
    expect(error.status).toBe(404);
    expect(error.problem.title).toBe("No such position");
    expect(error.message).toBe("No such position");
  });

  test("turns a response that is not problem details into one", async () => {
    answer(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const error = await failureOf(apiFetch("/positions"));
    expect(error.problem).toEqual({ status: 502, title: "Bad Gateway", type: "about:blank" });
  });

  test("reads a 422's field errors", async () => {
    answer(
      json(
        422,
        {
          errors: [
            { detail: "Must be positive", pointer: "#/legs/0/price" },
            { detail: "Must be a business day", pointer: "#/trade_date" },
            { detail: "Must be positive", pointer: "#/legs/0/price" },
            { detail: "Unknown account", parameter: "account" },
            { detail: "The body is empty", pointer: "#" },
          ],
          status: 422,
          title: "The request is not valid",
        },
        "application/problem+json",
      ),
    );
    const error = await failureOf(apiFetch("/orders", { method: "POST" }));
    expect(Object.fromEntries(fieldErrors(error.problem))).toEqual({
      "": ["The body is empty"],
      account: ["Unknown account"],
      "legs.0.price": ["Must be positive", "Must be positive"],
      trade_date: ["Must be a business day"],
    });
  });
});

test("fieldErrors ignores an errors member of another shape", () => {
  expect(fieldErrors({ errors: ["not", "fields"], type: "about:blank" }).size).toBe(0);
  expect(fieldErrors({ type: "about:blank" }).size).toBe(0);
});

describe("pointerPath", () => {
  test.each([
    ["#", []],
    ["#/legs/0/price", ["legs", 0, "price"]],
    ["#/a~1b/c~0d", ["a/b", "c~d"]],
    ["#/%20space", [" space"]],
    ["#/007", ["007"]],
    ["/legs/0", undefined],
    ["#legs", undefined],
  ] as const)("%s names %o", (pointer, path) => {
    expect(pointerPath(pointer)).toEqual(path);
  });
});
