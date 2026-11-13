/* The API layer at the HTTP boundary, as a real server and ingress behave: bodies that are empty or not the JSON they
 * claim, error pages with no status text, problems of shapes the contract does not name, and a request that never
 * reached the API. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { apiFetch, arrowResponse, describeError, NetworkError, setTokenSource } from "#index.ts";
import type { ApiResponse } from "#index.ts";
import { shouldRetry } from "#shell/query-client.ts";

import { answer, failureOf, json, sent, tokenSource } from "./api-fakes.ts";
import type { Fetch } from "./api-fakes.ts";

beforeEach(() => {
  setTokenSource(tokenSource(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Responses as FastAPI and an ingress send them: FastAPI answers a 204 with `content-type: application/json` and no
 * body, an ingress answers over HTTP/2, which has no status text, with an HTML page or nothing, and a body cut short
 * still says it is JSON. */
describe("responses as a server and an ingress send them", () => {
  test.each([
    ["a 204 that says it is JSON", sent(204, null, "application/json")],
    ["a 204 with no content type", sent(204, null)],
    ["a 205", sent(205, null, "application/json")],
    ["a 200 that says it is JSON with no body", sent(200, "", "application/json")],
    ["a 202 of empty text", sent(202, "", "text/plain; charset=utf-8")],
  ])("%s succeeds with no data", async (_name, response) => {
    answer(response);
    const result = await apiFetch<ApiResponse<unknown>>("/positions/p1", { method: "DELETE" });
    expect(result.data).toBeUndefined();
    expect(result.status).toBe(response.status);
  });

  test.each([
    ["an empty 502 that says it is JSON", sent(502, "", "application/json"), 502],
    [
      "an invalid-token 401 cut short",
      sent(401, '{"type":"invalid-token","sta', "application/problem+json"),
      401,
    ],
    ["a 500 whose JSON is plain text", sent(500, "Internal Server Error", "application/json"), 500],
    ["an empty 503 with no content type", sent(503, ""), 503],
  ])("%s fails with an ApiError holding its status", async (_name, response, status) => {
    answer(response);
    const error = await failureOf(apiFetch("/positions"));
    expect(error.status).toBe(status);
    expect(error.problem.status).toBe(status);
  });

  test("an empty 502 is retried, as any 502 is", async () => {
    answer(sent(502, "", "application/json"));
    const error = await failureOf(apiFetch("/positions"));
    expect(shouldRetry(0, error)).toBe(true);
  });

  test("a dataset's empty 504 that says it is JSON fails with an ApiError", async () => {
    answer(sent(504, "", "application/json"));
    const error = await failureOf(arrowResponse("/trades"));
    expect(error.status).toBe(504);
  });

  test.each([
    [403, "You do not have access to this"],
    [404, "Not found"],
    [503, "The request failed with status 503"],
  ])("an HTML %i with no status text keeps its status in its title", async (status, title) => {
    answer(sent(status, "<html><body>nginx</body></html>", "text/html"));
    const error = await failureOf(apiFetch("/positions"));
    expect(describeError(error).title).toBe(title);
    expect(error.message).toBe(`Request failed with status ${String(status)}`);
  });

  test("a 422 that is not the validation shape keeps its title and detail", async () => {
    answer(
      json(
        422,
        { detail: "The book is closed.", status: 422, title: "Cannot book", type: "book-closed" },
        "application/problem+json",
      ),
    );
    const error = await failureOf(apiFetch("/orders", { method: "POST" }));
    expect(describeError(error)).toStrictEqual({
      detail: "The book is closed.",
      fields: [],
      title: "Cannot book",
    });
  });

  test("a 422 with an error of a kind the contract does not name keeps the rest, and that one's detail", async () => {
    answer(
      json(
        422,
        {
          errors: [
            { detail: "Must be positive", pointer: "#/price" },
            { detail: "Missing", header: "x-request-id" },
          ],
          status: 422,
          title: "The request is not valid",
        },
        "application/problem+json",
      ),
    );
    const error = await failureOf(apiFetch("/orders", { method: "POST" }));
    expect(describeError(error)).toStrictEqual({
      fields: [
        { detail: "Must be positive", field: "price" },
        { detail: "Missing", field: "" },
      ],
      title: "The request is not valid",
    });
  });
});

/* Only a `fetch` that failed is a network failure; a `TypeError` from the page's own code is a bug. */
describe("a request that never reached the API", () => {
  test("is retried and described as the network, when fetch itself failed", async () => {
    vi.stubGlobal("fetch", vi.fn<Fetch>().mockRejectedValue(new TypeError("Failed to fetch")));
    const failed: unknown = await apiFetch("/positions").catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(NetworkError);
    expect(failed).toBeInstanceOf(TypeError);
    expect(failed).toHaveProperty("cause", expect.any(TypeError));
    expect(shouldRetry(0, failed)).toBe(true);
    expect(describeError(failed).title).toBe("The server could not be reached");
  });

  test("is not what a TypeError from the page's code is: neither retried nor blamed on the network", async () => {
    const bug = new TypeError("x.map is not a function");
    expect(shouldRetry(0, bug)).toBe(false);
    expect(describeError(bug)).toStrictEqual({
      detail: "x.map is not a function",
      fields: [],
      title: "Something went wrong",
    });
    setTokenSource(
      vi
        .fn<() => Promise<string | null>>()
        .mockRejectedValue(
          new TypeError("Cannot read properties of undefined (reading 'session')"),
        ),
    );
    answer(json(200, {}));
    const failed: unknown = await apiFetch("/positions").catch((error: unknown) => error);
    expect(shouldRetry(0, failed)).toBe(false);
    expect(describeError(failed).title).toBe("Something went wrong");
  });

  test("a dataset whose fetch failed is a network failure too", async () => {
    vi.stubGlobal("fetch", vi.fn<Fetch>().mockRejectedValue(new TypeError("Failed to fetch")));
    const failed: unknown = await arrowResponse("/trades").catch((error: unknown) => error);
    expect(shouldRetry(0, failed)).toBe(true);
  });
});
