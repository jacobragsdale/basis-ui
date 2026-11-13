/* What a response's `Content-Length` says of its body, from which a streamed load's rows are estimated. */

import { describe, expect, test } from "vite-plus/test";

import { contentLength } from "#engine/stream.ts";

/** A response with `headers`, as fetch answers it: `type` is `basic` from the page's own origin, `cors` from another. */
function answered(type: ResponseType, headers: Record<string, string>): Response {
  const response = new Response("", { headers });
  Object.defineProperty(response, "type", { value: type });
  return response;
}

describe(contentLength, () => {
  test("is the body's length from the page's own origin, unless the body is compressed", () => {
    expect(contentLength(answered("basic", { "content-length": "40" }))).toBe(40);
    const compressed = { "content-encoding": "gzip", "content-length": "40" };
    expect(contentLength(answered("basic", compressed))).toBeNull();
  });

  test("is unknown from another origin, whose Content-Encoding the page cannot read unless exposed", () => {
    expect(contentLength(answered("cors", { "content-length": "40" }))).toBeNull();
    const plain = { "content-encoding": "identity", "content-length": "40" };
    expect(contentLength(answered("cors", plain))).toBe(40);
  });
});
