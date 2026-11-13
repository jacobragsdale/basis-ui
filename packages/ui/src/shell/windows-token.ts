/* What `windowsSignIn` reads: the token in the endpoint's answer, and the user and expiry in the token's payload, read
 * and never verified, since the API verifies it. */

import { ApiError } from "#api/fetch.ts";
import { requestToken } from "#api/token-endpoint.ts";
import type { Fetch } from "#api/token-endpoint.ts";

import { SessionEndedError } from "./session-ended.ts";
import type { User } from "./sign-in.ts";

/** The claims the user is read from, by their names in the token. */
interface WindowsClaims {
  /** The user's id, unique and stable: `sub` by default. */
  readonly id?: string;
  /** The name the user menu shows: `name` by default, and the id when the token holds none. */
  readonly name?: string;
  /** The user's email: `email` by default. */
  readonly email?: string;
  /** The user's roles, a list or one string: `roles` by default. */
  readonly roles?: string;
}

/** Where to ask for a token, and how to read it. */
interface Endpoint {
  readonly tokenUrl: string;
  readonly method: "GET" | "POST";
  readonly tokenField: string | undefined;
  readonly claims: Required<WindowsClaims>;
  readonly fetch: Fetch | undefined;
}

/** A token, and what its payload says. */
interface Held {
  readonly token: string;
  readonly user: User;
  /** When it expires, in milliseconds, or `null` for a token with no `exp`. */
  readonly expires: number | null;
}

/** The fields of the endpoint's JSON answer that hold the token, after the one `tokenField` names. */
const tokenFields = ["token", "access_token"] as const;

const millisecondsPerSecond = 1000;
const unauthorized = 401;
const forbidden = 403;
const jwtParts = 3;
const base64Block = 4;

function decodePart(part: string): unknown {
  const base64 = part.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / base64Block) * base64Block, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.codePointAt(0) ?? 0);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** An object's members, or `undefined` for anything else. */
function membersOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

/** The token's payload, or `undefined` for one that is not a JWT of a JSON object. */
function payloadOf(token: string): Readonly<Record<string, unknown>> | undefined {
  const parts = token.split(".");
  if (parts.length !== jwtParts) {
    return undefined;
  }
  try {
    return membersOf(decodePart(parts[1] ?? ""));
  } catch {
    return undefined;
  }
}

function textClaim(payload: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The roles a claim holds: a list of strings, or one string as one role. */
function rolesClaim(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return value === "" ? [] : [value];
  }
  return Array.isArray(value)
    ? value.filter((role): role is string => typeof role === "string")
    : [];
}

/** What the adapter holds for `token`, read with `claims`, or `undefined` for a token it cannot read a user from. */
function heldOf(token: string, claims: Required<WindowsClaims>): Held | undefined {
  const payload = payloadOf(token);
  const id = payload === undefined ? undefined : textClaim(payload, claims.id);
  if (payload === undefined || id === undefined) {
    return undefined;
  }
  const email = textClaim(payload, claims.email);
  const { exp } = payload;
  return {
    expires: typeof exp === "number" ? exp * millisecondsPerSecond : null,
    token,
    user: {
      id,
      name: textClaim(payload, claims.name) ?? id,
      roles: rolesClaim(payload[claims.roles]),
      ...(email === undefined ? {} : { email }),
    },
  };
}

/** The token a JSON answer holds: a JSON string, or a string under `field` or one of `tokenFields`. */
function jsonToken(answer: unknown, field: string | undefined): string | undefined {
  if (typeof answer === "string") {
    return answer;
  }
  const members = membersOf(answer) ?? {};
  const found = [field, ...tokenFields].flatMap((name) => {
    const value = name === undefined ? undefined : members[name];
    return typeof value === "string" && value !== "" ? [value] : [];
  });
  return found[0];
}

/** The token the endpoint's answer holds: text, or JSON as `jsonToken` reads it. */
async function tokenOf(response: Response, field: string | undefined): Promise<string | undefined> {
  const text = await response.text();
  const body = text.trim();
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    return body === "" ? undefined : body;
  }
  return jsonToken(JSON.parse(body), field);
}

/** Throws for an answer that is not a token: a refusal, a 401 or a 403, ends the session; any other failure is an
 * `ApiError` with its status, which the shell retries as it would an API's. */
function refuseFailure(response: Response, tokenUrl: string): void {
  const { status } = response;
  if (status === unauthorized || status === forbidden) {
    throw new SessionEndedError(
      `The sign-in endpoint ${tokenUrl} refused to sign you in (${String(status)}): sign in to Windows as a user it allows, then sign in again.`,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      status,
      { status, type: "about:blank" },
      `The sign-in endpoint ${tokenUrl} failed with status ${String(status)}`,
    );
  }
}

/** Asks the endpoint for a token and reads the user from it. */
async function signInAt(endpoint: Endpoint): Promise<Held> {
  const { tokenUrl, method, tokenField, claims } = endpoint;
  const response = await requestToken(tokenUrl, method, endpoint.fetch);
  refuseFailure(response, tokenUrl);
  const token = await tokenOf(response, tokenField);
  if (token === undefined) {
    throw new Error(
      `The sign-in endpoint ${tokenUrl} answered no token: give windowsSignIn the tokenField its answer holds the token under, or have it answer the token as text.`,
    );
  }
  const held = heldOf(token, claims);
  if (held === undefined) {
    throw new Error(
      `The sign-in endpoint ${tokenUrl} answered a token whose payload names no user by the claim ${claims.id}: give windowsSignIn the claims its tokens use, as { claims: { id: "upn" } }.`,
    );
  }
  return held;
}

export { heldOf, signInAt };
export type { Endpoint, Held, WindowsClaims };
