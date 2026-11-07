import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { z } from "zod";

import {
  ApiError,
  apiFetch,
  arrowStream,
  fieldErrors,
  isApiError,
  pointerPath,
  setTokenSource,
  type ApiResponse,
} from "../src/index.ts";

interface Call {
  readonly url: string;
  readonly headers: Headers;
}

let calls: Call[] = [];

function answer(response: Response): void {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, headers: new Headers(init.headers) });
    return response;
  });
}

function json(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

beforeEach(() => {
  calls = [];
  setTokenSource(async () => null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const position = z.object({ id: z.string(), quantity: z.number() });

describe("apiFetch", () => {
  test("keeps the request under /api and sends no token for an anonymous user", async () => {
    answer(json(200, { id: "p1", quantity: 5 }));
    await apiFetch("/positions/p1", { schema: position });
    expect(calls[0]?.url).toBe("/api/positions/p1");
    expect(calls[0]?.headers.has("authorization")).toBe(false);
  });

  test("attaches the signed-in user's token", async () => {
    setTokenSource(async () => "a.b.c");
    answer(json(200, { id: "p1", quantity: 5 }));
    await apiFetch("/positions/p1", { schema: position });
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer a.b.c");
  });

  test("parses the body by its schema, dropping fields the schema does not know", async () => {
    answer(json(200, { id: "p1", quantity: 5, added: "by a newer API" }));
    const response = await apiFetch<ApiResponse<unknown>>("/positions/p1", { schema: position });
    expect(response.data).toEqual({ id: "p1", quantity: 5 });
    expect(response.status).toBe(200);
  });

  test("refuses a body its schema rejects", async () => {
    answer(json(200, { id: "p1", quantity: "five" }));
    await expect(apiFetch("/positions/p1", { schema: position })).rejects.toThrowError(z.ZodError);
  });

  test("reads Arrow as bytes when the request asks for it", async () => {
    answer(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": arrowStream },
      }),
    );
    const response = await apiFetch<ApiResponse<Blob>>("/exposures", {
      headers: { accept: arrowStream },
    });
    expect(response.data).toBeInstanceOf(Blob);
    expect(new Uint8Array(await response.data.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("throws problem details as an ApiError", async () => {
    answer(
      json(
        404,
        { type: "https://example.com/not-found", title: "No such position", status: 404 },
        "application/problem+json",
      ),
    );
    const error: unknown = await apiFetch("/positions/x").catch((caught: unknown) => caught);
    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).problem.title).toBe("No such position");
    expect((error as ApiError).message).toBe("No such position");
  });

  test("turns a response that is not problem details into one", async () => {
    answer(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const error = (await apiFetch("/positions").catch((caught: unknown) => caught)) as ApiError;
    expect(error.problem).toEqual({ type: "about:blank", title: "Bad Gateway", status: 502 });
  });

  test("reads a 422's field errors", async () => {
    answer(
      json(
        422,
        {
          title: "The request is not valid",
          status: 422,
          errors: [
            { detail: "Must be positive", pointer: "#/legs/0/price" },
            { detail: "Must be a business day", pointer: "#/trade_date" },
            { detail: "Must be positive", pointer: "#/legs/0/price" },
            { detail: "Unknown account", parameter: "account" },
            { detail: "The body is empty", pointer: "#" },
          ],
        },
        "application/problem+json",
      ),
    );
    const error = (await apiFetch("/orders", { method: "POST" }).catch(
      (caught: unknown) => caught,
    )) as ApiError;
    expect(Object.fromEntries(fieldErrors(error.problem))).toEqual({
      "legs.0.price": ["Must be positive", "Must be positive"],
      trade_date: ["Must be a business day"],
      account: ["Unknown account"],
      "": ["The body is empty"],
    });
  });
});

test("fieldErrors ignores an errors member of another shape", () => {
  expect(fieldErrors({ type: "about:blank", errors: ["not", "fields"] }).size).toBe(0);
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
