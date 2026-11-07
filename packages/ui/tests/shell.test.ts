/* The app shell's parts that need no page: the fake sign-in's tokens, the query client's retries, which problems are
 * sign-in problems, and the words an error is shown in. BasisApp itself, its answers to sign-in problems, ErrorAlert
 * and the error toast are tested in a browser, in packages/example and the gallery. */

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { ApiError, describeError, fakeSignIn } from "#index.ts";
import type { AnyProblem } from "#index.ts";
import { shouldRetry, shouldRetryMutation } from "#shell/query-client.ts";
import { signInProblem } from "#shell/sign-in-problems.ts";

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

  test("signs its user in again after a sign-out, and an anonymous one in as the placeholder user", async () => {
    const signedOut = fakeSignIn({ user: { id: "desk-head", name: "Desk Head" } });
    await signedOut.signOut();
    await signedOut.signIn();
    expect(await signedOut.currentUser()).toStrictEqual({ id: "desk-head", name: "Desk Head" });
    expect(await signedOut.token()).not.toBeNull();
    const anonymous = fakeSignIn({ user: null });
    await anonymous.signIn();
    const placeholder = await anonymous.currentUser();
    expect(placeholder?.id).toBe("dev-user");
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

describe(shouldRetryMutation, () => {
  const keysUnavailable = apiError(503, {
    status: 503,
    title: "The sign-in system's keys are unavailable",
    type: "keys-unavailable",
  });

  test("retries a keys-unavailable 503 twice, since basis refused it before any handler ran", () => {
    expect(shouldRetryMutation(0, keysUnavailable)).toBe(true);
    expect(shouldRetryMutation(1, keysUnavailable)).toBe(true);
    expect(shouldRetryMutation(2, keysUnavailable)).toBe(false);
  });

  test.each([
    ["another 503", apiError(503)],
    ["a 502", apiError(502, { type: "call-failed" })],
    ["a 504", apiError(504, { type: "deadline-exceeded" })],
    ["a 422", apiError(422)],
    ["a lost connection", new TypeError("Failed to fetch")],
  ])("never retries %s, which may have come after the write", (_name, error) => {
    expect(shouldRetryMutation(0, error)).toBe(false);
  });
});

describe(signInProblem, () => {
  test.each(["invalid-token", "sign-in-required"])("reads a 401 %s by its type", (type) => {
    expect(signInProblem(apiError(401, { status: 401, type }))).toBe(type);
  });

  test.each([
    ["a keys-unavailable 503", apiError(503, { type: "keys-unavailable" })],
    ["a 401 of another type", apiError(401, { type: "about:blank" })],
    ["a 403", apiError(403, { type: "invalid-token" })],
    ["a lost connection", new TypeError("Failed to fetch")],
  ])("finds none in %s, so it never signs the user out", (_name, error) => {
    expect(signInProblem(error)).toBeUndefined();
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
