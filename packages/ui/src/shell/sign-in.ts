/* The sign-in adapter: how the app shell learns who the user is, gets the JWT every request carries, and signs the user
 * out. The firm's sign-in system gets its own adapter (roadmap step 1.9); `fakeSignIn` stands in for it in tests and in
 * development, signing its tokens with the development key basis publishes, which every basis API accepts on a
 * developer's declared desktop and refuses anywhere else (basis's docs/contract.md, Identity). */

/** The signed-in user. `id` is the token's subject, its `sub` claim. */
interface User {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
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
}

/** basis's development key, as basis publishes it (`basis.api.tokens.DEVELOPMENT_KEY`): an ES256 key whose private
 * part anyone may read, so a token it signs proves nothing, and every API refuses it off a declared desktop. */
const developmentKey: JsonWebKey = {
  crv: "P-256",
  // oxlint-disable-next-line eslint/id-length -- a JWK names an EC key's private part `d` (RFC 7518, section 6.2.2.1).
  d: "fKf0qhP6MC3WvrtHFG6hPj1_PuqLmI-xx_mfRylqjmQ",
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
const fakeUser: User = { email: "dev.user@example.com", id: "dev-user", name: "Dev User" };

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
  readonly user?: User | null;
  /** The token's `iss`, which must be the API's `BASIS_IDENTITY__ISSUER`. `basis-development` by default. */
  readonly issuer?: string;
  /** The token's `aud`, which must be the API's `BASIS_IDENTITY__AUDIENCE`. `basis-development` by default. */
  readonly audience?: string;
  /** Further claims the API's user declares, such as `{ desk: "Rates" }`. */
  readonly claims?: Readonly<Record<string, unknown>>;
}

/** A sign-in adapter for tests and development: `user` is signed in at once, and each token is a JWT for them, signed
 * with basis's development key, with their `name` and `email` as claims. A basis API on a developer's desktop whose
 * settings verify with the development key, such as `basis dev`'s, accepts it; any other refuses it with a 401.
 * `signOut` makes the user anonymous, and `signIn` signs them in again at once. */
function fakeSignIn({
  user = fakeUser,
  issuer = developmentKeyId,
  audience = developmentKeyId,
  claims = {},
}: FakeSignInOptions = {}): SignIn {
  let current = user;
  let signed: { readonly token: string; readonly expires: number } | null = null;
  return {
    currentUser: async () => Promise.resolve(current),
    signIn: async () => {
      current = user ?? fakeUser;
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
          sub: current.id,
          ...(current.email === undefined ? {} : { email: current.email }),
        };
        signed = { expires, token: await signWithDevelopmentKey({ ...claims, ...identity }) };
      }
      return signed.token;
    },
  };
}

export { fakeSignIn, fakeUser };
export type { FakeSignInOptions, SignIn, User };
