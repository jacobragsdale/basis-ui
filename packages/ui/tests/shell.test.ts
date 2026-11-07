/* The app shell's parts that need no page: the fake sign-in's tokens, the query client's retries, and the words an
 * error is shown in. BasisApp itself, ErrorAlert and the error toast are tested in a browser, in packages/example and
 * the gallery. */

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { ApiError, describeError, fakeSignIn } from "#index.ts";
import type { AnyProblem } from "#index.ts";
import { shouldRetry } from "#shell/query-client.ts";

/** basis's development key's public part, as basis publishes it. */
const developmentPublicKey: JsonWebKey = {
  crv: "P-256",
  kty: "EC",
  x: "Xgv3fh0kPSZcEDr60PmlPmZ8V5ytxOae1vtlhXqnhMI",
  y: "Hgxef-hOuDO-ouolTTf9PuIj_FWSZy0BWDmChTcI9EM",
};

function bytesOf(part: string): Uint8Array<ArrayBuffer> {
  const binary = atob(part.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
}

function jsonOf(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(bytesOf(part)));
}

/** Whether `token`'s signature verifies with basis's development key. */
async function verifies(token: string): Promise<boolean> {
  const [header = "", payload = "", signature = ""] = token.split(".");
  const key = await crypto.subtle.importKey(
    "jwk",
    developmentPublicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { hash: "SHA-256", name: "ECDSA" },
    key,
    bytesOf(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

function apiError(status: number, problem?: AnyProblem): ApiError {
  return new ApiError(status, problem ?? { type: "about:blank" }, "failed");
}

describe(fakeSignIn, () => {
  test("signs in its user at once, with a token basis's development key signed", async () => {
    const signIn = fakeSignIn({ audience: "positions", claims: { desk: "Rates" }, issuer: "dev" });
    expect(await signIn.currentUser()).toStrictEqual({
      email: "dev.user@example.com",
      id: "dev-user",
      name: "Dev User",
    });
    const token = (await signIn.token()) ?? "";
    expect(await verifies(token)).toBe(true);
    const [header = "", payload = ""] = token.split(".");
    expect(jsonOf(header)).toStrictEqual({ alg: "ES256", kid: "basis-development", typ: "JWT" });
    const claims = z.object({ exp: z.number(), iat: z.number() }).loose().parse(jsonOf(payload));
    expect(claims).toMatchObject({
      aud: "positions",
      desk: "Rates",
      email: "dev.user@example.com",
      iss: "dev",
      name: "Dev User",
      sub: "dev-user",
    });
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test("gives the same token until it nears its expiry", async () => {
    const signIn = fakeSignIn();
    expect(await signIn.token()).toBe(await signIn.token());
  });

  test("an anonymous user, or one signed out, has no token", async () => {
    expect(await fakeSignIn({ user: null }).token()).toBeNull();
    const signIn = fakeSignIn();
    await signIn.signOut();
    expect(await signIn.currentUser()).toBeNull();
    expect(await signIn.token()).toBeNull();
  });
});

describe(shouldRetry, () => {
  test.each([400, 401, 403, 404, 409, 422, 429, 500])("never retries a %i", (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(false);
  });

  test.each([502, 503, 504])("retries a %i twice", (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(true);
    expect(shouldRetry(1, apiError(status))).toBe(true);
    expect(shouldRetry(2, apiError(status))).toBe(false);
  });

  test("retries a request that never reached the API, but not a response its schema refused", () => {
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(0, z.number().safeParse("five").error)).toBe(false);
    expect(shouldRetry(0, new Error("a bug"))).toBe(false);
  });
});

describe(describeError, () => {
  test("reads a problem's title, detail, fields and reference", () => {
    const error = apiError(422, {
      detail: "Two fields are not valid.",
      errors: [
        { detail: "Must be positive", pointer: "#/legs/0/price" },
        { detail: "Unknown book", parameter: "book" },
      ],
      instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000001",
      status: 422,
      title: "The request is not valid",
      type: "invalid-request",
    });
    expect(describeError(error)).toStrictEqual({
      detail: "Two fields are not valid.",
      fields: [
        { detail: "Must be positive", field: "legs[0].price" },
        { detail: "Unknown book", field: "book" },
      ],
      reference: "019a5c3e-0000-7000-8000-000000000001",
      title: "The request is not valid",
    });
  });

  test("a problem with no title or detail takes its title from its status", () => {
    expect(describeError(apiError(404, { detail: null, type: "about:blank" }))).toStrictEqual({
      fields: [],
      title: "Not found",
    });
    expect(describeError(apiError(418)).title).toBe("The request failed with status 418");
  });

  test.each([
    [z.number().safeParse("five").error, "The response was not in the form this page expects"],
    [new TypeError("Failed to fetch"), "The server could not be reached"],
    [new Error("Cannot read properties of undefined"), "Something went wrong"],
    ["a thrown string", "Something went wrong"],
  ])("names a failure the API did not answer: %s", (failure, title) => {
    expect(describeError(failure).title).toBe(title);
  });
});
