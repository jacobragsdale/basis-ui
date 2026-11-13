/* The sign-in adapter: how the app shell learns who the user is, gets the JWT every request carries, and signs the user
 * out. The firm's system is Windows authentication, `windowsSignIn` (windows-sign-in.ts); `fakeSignIn` stands in for it
 * in tests, in development and in a fixture build, signing its tokens with the development key basis publishes, which every basis API accepts on a
 * developer's declared desktop and refuses anywhere else (basis's docs/contract.md, Identity). */

/** The signed-in user. `id` is the token's subject, its `sub` claim. `roles` are the token's roles, empty for an adapter
 * whose tokens hold none: a role decides what a page shows, and the API stays the judge of what the user may do. */
interface User {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly roles: readonly string[];
}

/** What `BasisApp` needs from a sign-in system. */
interface SignIn {
  /** The signed-in user, or `null` for an anonymous one. `BasisApp` calls it once, at start, and shows nothing of the
   * app until it settles; an adapter whose user must sign in first may send the page to the sign-in system instead. */
  readonly currentUser: () => Promise<User | null>;
  /** The user's JWT for the next request, renewed before it expires, or `null` while no one is signed in. `apiFetch`
   * calls it for every request and sends it as `Authorization: Bearer`. */
  readonly token: () => Promise<string | null>;
  /** Signs in a user who is anonymous or whose session has ended. An adapter may leave the page for the sign-in
   * system's; once it resolves, `BasisApp` asks `currentUser` again and asks again for what the page shows. */
  readonly signIn: () => Promise<void>;
  /** Ends the user's session. An adapter may leave the page for the sign-in system's; `BasisApp` then shows the app
   * as the anonymous user sees it. */
  readonly signOut: () => Promise<void>;
  /** Whether the app offers a sign-in at all: yes unless set. An app with no sign-in system, such as a ctzd dashboard,
   * uses `anonymousSignIn`, which sets it to `false`, and the shell then never asks the user to sign in. */
  readonly offersSignIn?: boolean;
  /** Whether the user menu offers a sign-out: yes unless set. `windowsSignIn` sets it to `false`, since it would sign
   * the user in again at once. */
  readonly offersSignOut?: boolean;
  /** Called when an API answered `invalid-token` to a request that carried `refused`: the adapter drops it and gets a
   * new token, resolving `true` when the request is worth sending once more with `token()`'s next answer. Without it,
   * or when it resolves `false`, the shell answers the `invalid-token` by signing the user out. It throws
   * `SessionEndedError` when the sign-in system refuses. */
  readonly renew?: (refused: string) => Promise<boolean>;
}

/** The private part of the development key, which a production build that still holds `fakeSignIn` carries: what
 * `vp run verify`'s build stage looks for. A plain string, so that a build without the fake drops it. */
const developmentKeyMark = "fKf0qhP6MC3WvrtHFG6hPj1_PuqLmI-xx_mfRylqjmQ";

/** basis's development key, as basis publishes it (`basis.api.tokens.DEVELOPMENT_KEY`): an ES256 key whose private
 * part anyone may read, so a token it signs proves nothing, and every API refuses it off a declared desktop. */
const developmentKey: JsonWebKey = {
  crv: "P-256",
  // oxlint-disable-next-line eslint/id-length -- a JWK names an EC key's private part `d` (RFC 7518, section 6.2.2.1).
  d: developmentKeyMark,
  kty: "EC",
  x: "Xgv3fh0kPSZcEDr60PmlPmZ8V5ytxOae1vtlhXqnhMI",
  y: "Hgxef-hOuDO-ouolTTf9PuIj_FWSZy0BWDmChTcI9EM",
};
const developmentKeyId = "basis-development";

/** How long a fake token lasts, and how long before it expires a new one is signed, in seconds. */
const tokenLifetime = 3600;
const renewalMargin = 60;
const millisecondsPerSecond = 1000;

/** The user `fakeSignIn` signs in when it is given none. */
const fakeUser: User = {
  email: "dev.user@example.com",
  id: "dev-user",
  name: "Dev User",
  roles: [],
};

/** A user as `fakeSignIn` takes one: its roles may be left out, for none. */
type FakeUser = Omit<User, "roles"> & { readonly roles?: readonly string[] };

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** A JWT signed with basis's development key, holding `claims`. */
async function signWithDevelopmentKey(claims: Readonly<Record<string, unknown>>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    developmentKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const input = `${encodeJson({ alg: "ES256", kid: developmentKeyId, typ: "JWT" })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    { hash: "SHA-256", name: "ECDSA" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

interface FakeSignInOptions {
  /** Who is signed in at the start: a placeholder user by default, or `null` for an anonymous one, whom `signIn`
   * signs in as the placeholder user. */
  readonly user?: FakeUser | null;
  /** The token's `iss`, which must be the API's `BASIS_IDENTITY__ISSUER`. `basis-development` by default. */
  readonly issuer?: string;
  /** The token's `aud`, which must be the API's `BASIS_IDENTITY__AUDIENCE`. `basis-development` by default. */
  readonly audience?: string;
  /** Further claims the API's user declares, such as `{ desk: "Rates" }`. */
  readonly claims?: Readonly<Record<string, unknown>>;
}

/** A sign-in adapter for tests and development: `user` is signed in at once, and each token is a JWT for them, signed
 * with basis's development key, with their `name`, `email` and `roles` as claims. A basis API on a developer's desktop whose
 * settings verify with the development key, such as `basis dev`'s, accepts it; any other refuses it with a 401.
 * `signOut` makes the user anonymous, and `signIn` signs them in again at once. */
function fakeSignIn({
  user = fakeUser,
  issuer = developmentKeyId,
  audience = developmentKeyId,
  claims = {},
}: FakeSignInOptions = {}): SignIn {
  const given: User | null = user === null ? null : { ...user, roles: user.roles ?? [] };
  let current = given;
  let signed: { readonly token: string; readonly expires: number } | null = null;
  return {
    currentUser: async () => Promise.resolve(current),
    signIn: async () => {
      current = given ?? fakeUser;
      signed = null;
      await Promise.resolve();
    },
    signOut: async () => {
      current = null;
      signed = null;
      await Promise.resolve();
    },
    token: async () => {
      if (current === null) {
        return null;
      }
      const now = Math.floor(Date.now() / millisecondsPerSecond);
      if (signed === null || signed.expires - renewalMargin <= now) {
        const expires = now + tokenLifetime;
        const identity = {
          aud: audience,
          exp: expires,
          iat: now,
          iss: issuer,
          name: current.name,
          roles: current.roles,
          sub: current.id,
          ...(current.email === undefined ? {} : { email: current.email }),
        };
        signed = { expires, token: await signWithDevelopmentKey({ ...claims, ...identity }) };
      }
      return signed.token;
    },
  };
}

/** What `anonymousSignIn`'s `signIn` rejects with, and the shell says when an API asks for a user anyway. */
const noSignInMessage =
  "This app has no sign-in (anonymousSignIn), and the API asked for a signed-in user: let the API's route allow anonymous users, or give BasisApp the firm's sign-in adapter.";

/** The sign-in adapter of an app with no sign-in system: every user is anonymous, requests carry no token, and the
 * shell offers no sign-in. `<BasisApp signIn={anonymousSignIn()} />`. */
function anonymousSignIn(): SignIn {
  return {
    currentUser: async () => Promise.resolve(null),
    offersSignIn: false,
    signIn: async () => Promise.reject(new Error(noSignInMessage)),
    signOut: async () => Promise.resolve(),
    token: async () => Promise.resolve(null),
  };
}

export { anonymousSignIn, developmentKeyMark, fakeSignIn, fakeUser, noSignInMessage };
export type { FakeSignInOptions, FakeUser, SignIn, User };
