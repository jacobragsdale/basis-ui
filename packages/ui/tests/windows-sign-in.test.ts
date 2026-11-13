/* `windowsSignIn` against a fake token endpoint: the first sign-in, a stored token, renewal before expiry, one sign-in
 * for many waiting requests, an `invalid-token` renewed and its request sent again, an endpoint that refuses, and
 * tokens whose claims are not the defaults'. No test reaches a real endpoint: the adapter takes its `fetch` and its
 * storage as options. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";

import { apiFetch, SessionEndedError, setTokenSource, windowsSignIn } from "#index.ts";
import type { ApiResponse, SignIn, WindowsSignInOptions } from "#index.ts";
import { signInProblem } from "#shell/sign-in-problems.ts";

import type { Fetch } from "./api-fakes.ts";

const tokenUrl = "https://sign-in.example.com/token";
const now = Date.UTC(2026, 10, 13, 12);
const nowSeconds = now / 1000;

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** A JWT holding `claims`, its signature a stand-in, since the adapter never verifies one. */
function jwt(claims: Readonly<Record<string, unknown>>): string {
  return `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url(claims)}.signature`;
}

const claims = {
  email: "a.trader@example.com",
  exp: nowSeconds + 3600,
  name: "A Trader",
  roles: ["trader", "viewer"],
  sub: "a.trader",
};

/** Local storage as a map, which a test reads. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** A token endpoint that answers each sign-in with the next of `answers`, the last again once they run out. */
function endpoint(...answers: readonly (() => Response)[]): {
  readonly fetch: Mock<Fetch>;
  readonly calls: () => number;
} {
  let index = 0;
  const fake = vi.fn<Fetch>(async (): Promise<Response> => {
    const answer =
      answers[Math.min(index, answers.length - 1)] ??
      ((): Response => new Response(null, { status: 500 }));
    index += 1;
    return Promise.resolve(answer());
  });
  return { calls: () => fake.mock.calls.length, fetch: fake };
}

const text =
  (token: string): (() => Response) =>
  (): Response =>
    new Response(token, { headers: { "content-type": "text/plain" } });

function adapter(options: Partial<WindowsSignInOptions> & Pick<WindowsSignInOptions, "fetch">): {
  readonly signIn: SignIn;
  readonly storage: Pick<Storage, "getItem" | "removeItem" | "setItem">;
} {
  const storage = options.storage ?? memoryStorage();
  return { signIn: windowsSignIn({ storage, tokenUrl, ...options }), storage };
}

beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe(windowsSignIn, () => {
  test("signs in at the endpoint with the browser's Windows credentials, and reads the user from the token", async () => {
    const token = jwt(claims);
    const fake = endpoint(text(token));
    const { signIn, storage } = adapter({ fetch: fake.fetch });
    expect(await signIn.currentUser()).toStrictEqual({
      email: "a.trader@example.com",
      id: "a.trader",
      name: "A Trader",
      roles: ["trader", "viewer"],
    });
    expect(await signIn.token()).toBe(token);
    const [url, init] = fake.fetch.mock.calls[0] ?? [];
    expect(url).toBe(tokenUrl);
    expect(init).toMatchObject({ credentials: "include" });
    expect(storage.getItem("basis-ui-token")).toBe(token);
    expect(fake.calls()).toBe(1);
  });

  test("a stored token signs in a reload or another tab with no request", async () => {
    const storage = memoryStorage();
    storage.setItem("basis-ui-token", jwt(claims));
    const fake = endpoint(text(jwt({ ...claims, sub: "someone.else" })));
    const { signIn } = adapter({ fetch: fake.fetch, storage });
    const user = await signIn.currentUser();
    expect(user?.id).toBe("a.trader");
    expect(fake.calls()).toBe(0);
  });

  test("asks again renewBefore seconds before the token expires, once for however many requests wait", async () => {
    const storage = memoryStorage();
    storage.setItem("basis-ui-token", jwt({ ...claims, exp: nowSeconds + 200 }));
    const renewed = jwt({ ...claims, exp: nowSeconds + 3600 });
    const fake = endpoint(text(renewed));
    const { signIn } = adapter({ fetch: fake.fetch, renewBefore: 300, storage });
    const tokens = await Promise.all([
      signIn.token(),
      signIn.token(),
      signIn.token(),
      signIn.token(),
    ]);
    expect(tokens).toStrictEqual([renewed, renewed, renewed, renewed]);
    expect(fake.calls()).toBe(1);
    expect(await signIn.token()).toBe(renewed);
    expect(fake.calls()).toBe(1);
  });

  test("keeps a token with no exp until an API refuses it", async () => {
    const storage = memoryStorage();
    const lasting = jwt({ name: "A Trader", sub: "a.trader" });
    storage.setItem("basis-ui-token", lasting);
    const fake = endpoint(text(jwt({ ...claims, exp: nowSeconds + 366 * 86_400 })));
    const { signIn } = adapter({ fetch: fake.fetch, storage });
    vi.setSystemTime(now + 365 * 86_400_000);
    expect(await signIn.token()).toBe(lasting);
    expect(await signIn.renew?.(lasting)).toBe(true);
    expect(await signIn.token()).not.toBe(lasting);
    expect(fake.calls()).toBe(1);
  });

  test("an endpoint that refuses ends the session, which the shell answers as invalid-token", async () => {
    const fake = endpoint((): Response => new Response("Unauthorized", { status: 401 }));
    const { signIn } = adapter({ fetch: fake.fetch });
    const refused: unknown = await signIn.currentUser().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(SessionEndedError);
    expect(signInProblem(refused)).toBe("invalid-token");
  });

  test("an endpoint that fails is not a refusal: a 503 is an ApiError the shell retries", async () => {
    const fake = endpoint((): Response => new Response("", { status: 503 }));
    const { signIn } = adapter({ fetch: fake.fetch });
    await expect(signIn.currentUser()).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });

  test("signing out drops the token, and signing in asks the endpoint again", async () => {
    const first = jwt(claims);
    const second = jwt({ ...claims, exp: nowSeconds + 7200 });
    const fake = endpoint(text(first), text(second));
    const { signIn, storage } = adapter({ fetch: fake.fetch });
    await signIn.currentUser();
    await signIn.signOut();
    expect([
      storage.getItem("basis-ui-token"),
      await signIn.token(),
      await signIn.currentUser(),
    ]).toStrictEqual([null, null, null]);
    await signIn.signIn();
    expect(await signIn.token()).toBe(second);
    expect(signIn.offersSignOut).toBe(false);
  });
});

describe("the endpoint's answer and the token's claims", () => {
  test.each([
    ["the token as text", (): Response => new Response(` ${jwt(claims)}\n`)],
    ["JSON holding token", (): Response => Response.json({ token: jwt(claims) })],
    [
      "JSON holding access_token",
      (): Response => Response.json({ access_token: jwt(claims), token_type: "Bearer" }),
    ],
    ["a JSON string", (): Response => Response.json(jwt(claims))],
  ])("reads %s", async (_name, answer) => {
    const { signIn } = adapter({ fetch: endpoint(answer).fetch });
    expect(await signIn.token()).toBe(jwt(claims));
  });

  test("reads the field tokenField names", async () => {
    const { signIn } = adapter({
      fetch: endpoint((): Response => Response.json({ jwt: jwt(claims) })).fetch,
      tokenField: "jwt",
    });
    expect(await signIn.token()).toBe(jwt(claims));
  });

  test("refuses an answer that holds no token, saying what it read", async () => {
    const { signIn } = adapter({
      fetch: endpoint((): Response => Response.json({ ok: true })).fetch,
    });
    await expect(signIn.currentUser()).rejects.toThrow(
      `The sign-in endpoint ${tokenUrl} answered no token: give windowsSignIn the tokenField its answer holds the token under, or have it answer the token as text.`,
    );
  });

  test("reads the claims claims names, roles as a list or as one string, and a name from the id when none", async () => {
    const odd = jwt({
      exp: "soon",
      groups: "Rates Desk",
      mail: "x@example.com",
      upn: "x.user@example.com",
    });
    const { signIn } = adapter({
      claims: { email: "mail", id: "upn", roles: "groups" },
      fetch: endpoint(text(odd)).fetch,
    });
    expect(await signIn.currentUser()).toStrictEqual({
      email: "x@example.com",
      id: "x.user@example.com",
      name: "x.user@example.com",
      roles: ["Rates Desk"],
    });
  });

  test("refuses a token with no id, or a payload that is not JSON", async () => {
    for (const token of [jwt({ name: "Nobody" }), "a.b.c"]) {
      const { signIn } = adapter({ fetch: endpoint(text(token)).fetch });
      // oxlint-disable-next-line no-await-in-loop -- one adapter at a time.
      await expect(signIn.currentUser()).rejects.toThrow(
        /The sign-in endpoint .* answered a token/u,
      );
    }
  });
});

describe("an API that answers invalid-token", () => {
  test("has its request sent once more with a token signed in again, without a word to the user", async () => {
    const first = jwt(claims);
    const second = jwt({ ...claims, exp: nowSeconds + 7200 });
    const { signIn } = adapter({ fetch: endpoint(text(first), text(second)).fetch });
    setTokenSource(
      async () => signIn.token(),
      async (refused) => signIn.renew?.(refused) ?? false,
    );
    const sent: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<Fetch>(async (_url, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        sent.push(authorization);
        return Promise.resolve(
          authorization === `Bearer ${first}`
            ? Response.json(
                { status: 401, title: "The bearer token is not valid", type: "invalid-token" },
                { headers: { "content-type": "application/problem+json" }, status: 401 },
              )
            : Response.json({ id: "p1" }),
        );
      }),
    );
    const response = await apiFetch<ApiResponse<unknown>>("/positions/p1");
    expect(response.data).toStrictEqual({ id: "p1" });
    expect(sent).toStrictEqual([`Bearer ${first}`, `Bearer ${second}`]);
  });
});
