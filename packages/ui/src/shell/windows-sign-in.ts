/* `windowsSignIn`: the sign-in adapter for the firm's system (docs/release-plan.md, decision 1). The browser signs the
 * user in to a token endpoint with their Windows account; the endpoint answers with a JWT holding the user's name and
 * roles; the adapter keeps it in local storage and gives it to every API request, so that the firm's backends share
 * one sign-in. The endpoint's address, the form of its answer and the claims' names are the firm's, so each is an
 * option, with defaults a port changes in `defaultClaims` and the defaults below. */

import type { Fetch } from "#api/token-endpoint.ts";

import type { SignIn } from "./sign-in.ts";
import { heldOf, signInAt } from "./windows-token.ts";
import type { Endpoint, Held, WindowsClaims } from "./windows-token.ts";

/** The claims' names a token holds unless `claims` says otherwise: the one place a port changes them. */
const defaultClaims = {
  email: "email",
  id: "sub",
  name: "name",
  roles: "roles",
} as const satisfies Required<WindowsClaims>;

/** Where the token is kept unless `storageKey` says otherwise. */
const defaultStorageKey = "basis-ui-token";

/** How long before a token expires it is renewed, in seconds, unless `renewBefore` says otherwise. */
const defaultRenewBefore = 300;

const millisecondsPerSecond = 1000;

type TokenStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

interface WindowsSignInOptions {
  /** The endpoint that signs the browser in with the user's Windows account and answers with the token. It may be on
   * another origin of the firm's, which then allows this app's origin with credentials. */
  readonly tokenUrl: string;
  /** The method the endpoint is asked with: `GET` by default. */
  readonly method?: "GET" | "POST";
  /** The field of a JSON answer that holds the token, tried before `token` and `access_token`. An answer of text is
   * the token itself. */
  readonly tokenField?: string;
  /** The claims' names in the token, each defaulting to `defaultClaims`'. */
  readonly claims?: WindowsClaims;
  /** The local storage key the token is kept under, so that a reload or another tab of the app signs in at once:
   * `basis-ui-token` by default. Apps on one origin that share it share the token. */
  readonly storageKey?: string;
  /** How many seconds before the token's `exp` it is renewed: 300 by default. A token with no `exp` is kept until an API
   * refuses it. */
  readonly renewBefore?: number;
  /** The `fetch` the endpoint is asked with: the browser's by default, a fake in a test. */
  readonly fetch?: Fetch;
  /** Where the token is kept: the browser's local storage by default, a fake in a test. */
  readonly storage?: TokenStorage;
}

/** Local storage, or a map in its place where the page has none, as a sandboxed frame may not. */
function browserStorage(): TokenStorage {
  try {
    return globalThis.localStorage;
  } catch {
    const items = new Map<string, string>();
    return {
      getItem: (key) => items.get(key) ?? null,
      removeItem: (key) => {
        items.delete(key);
      },
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
  }
}

/** The token the adapter holds, kept in storage: the stored one while it is fresh, otherwise one the endpoint answers,
 * asked once for however many callers wait. */
function tokenKeeper(options: WindowsSignInOptions): {
  readonly current: () => Promise<Held>;
  readonly again: () => Promise<Held>;
  readonly drop: (token?: string) => void;
  readonly holds: (token: string) => boolean;
} {
  const claims: Required<WindowsClaims> = { ...defaultClaims, ...options.claims };
  const endpoint: Endpoint = {
    claims,
    fetch: options.fetch,
    method: options.method ?? "GET",
    tokenField: options.tokenField,
    tokenUrl: options.tokenUrl,
  };
  const key = options.storageKey ?? defaultStorageKey;
  const renewBefore = (options.renewBefore ?? defaultRenewBefore) * millisecondsPerSecond;
  const storage = options.storage ?? browserStorage();
  let asking: Promise<Held> | null = null;
  const again = async (): Promise<Held> => {
    asking ??= signInAt(endpoint)
      .then((held) => {
        storage.setItem(key, held.token);
        return held;
      })
      .finally(() => {
        asking = null;
      });
    return asking;
  };
  const current = async (): Promise<Held> => {
    const token = storage.getItem(key);
    const held = token === null ? undefined : heldOf(token, claims);
    const fresh =
      held !== undefined && (held.expires === null || held.expires - renewBefore > Date.now());
    return fresh ? held : again();
  };
  return {
    again,
    current,
    drop: (token) => {
      if (token === undefined || storage.getItem(key) === token) {
        storage.removeItem(key);
      }
    },
    holds: (token) => storage.getItem(key) === token,
  };
}

/**
 * The sign-in adapter for Windows authentication: the browser signs the user in to `tokenUrl` with their Windows
 * account (the request goes with `credentials: "include"`, so the browser answers the endpoint's Negotiate or NTLM
 * challenge), and the JWT it answers with is kept in local storage and carried by every API request. Its payload is
 * read, never verified, for the user's id, name, email and roles, and its `exp`.
 *
 * `token()` answers the stored token until `renewBefore` seconds before it expires, then asks the endpoint again, once
 * for however many requests wait. When an API answers `invalid-token`, the token is dropped and the endpoint asked
 * again without a word to the user, and the request is sent once more. Only when the endpoint itself refuses does the
 * shell say the session has ended. The user menu offers no sign-out, since the adapter would sign the user in again at
 * once.
 *
 * @use For an app's production entry, with the firm's endpoint; `fakeSignIn()` in `vp dev` and a fixture build.
 * @see fakeSignIn, anonymousSignIn, BasisApp, useUser, SessionEndedError
 *
 * @example
 * ```ts
 * import { windowsSignIn } from "@basis/ui";
 *
 * const signIn = windowsSignIn({ tokenUrl: "https://sign-in.example.com/token" });
 * ```
 */
function windowsSignIn(options: WindowsSignInOptions): SignIn {
  const keeper = tokenKeeper(options);
  let signedOut = false;
  const held = async (): Promise<Held | null> => (signedOut ? null : keeper.current());
  return {
    currentUser: async () => {
      const now = await held();
      return now?.user ?? null;
    },
    offersSignOut: false,
    renew: async (refused) => {
      if (signedOut) {
        return false;
      }
      // A token another request's refusal renewed already is kept.
      const renewing = keeper.holds(refused);
      keeper.drop(refused);
      await (renewing ? keeper.again() : keeper.current());
      return true;
    },
    signIn: async () => {
      signedOut = false;
      keeper.drop();
      await keeper.again();
    },
    signOut: async () => {
      signedOut = true;
      keeper.drop();
      await Promise.resolve();
    },
    token: async () => {
      const now = await held();
      return now?.token ?? null;
    },
  };
}

export { defaultClaims, windowsSignIn };
export type { WindowsSignInOptions };
export type { WindowsClaims } from "./windows-token.ts";
