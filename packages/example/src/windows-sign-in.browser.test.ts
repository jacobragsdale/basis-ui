/* The shell under `windowsSignIn`, as a user sees it: an `invalid-token` renewed and its request sent again without a
 * word, an endpoint that refuses saying the session has ended with "Sign in again", and no sign-out in the user menu.
 * The token endpoint is a fake the adapter is given, so no test reaches a real one. */

import { windowsSignIn } from "@basis/ui";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import type { RenderResult } from "vitest-browser-react";

import type { DayCount } from "#api/client.ts";
import { renderApp, worker } from "#test-support.tsx";

const conventions: DayCount[] = [{ convention: "ACT/365F", year_days: 365 }];

const tokenUrl = "https://sign-in.example.com/token";

/** Local storage as a map, so no test leaves a token in the browser's. */
function memoryStorage(): Pick<Storage, "getItem" | "removeItem" | "setItem"> {
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

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** An unsigned JWT for a trader, its `jti` telling one from the next. */
function token(jti: number): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = { exp, jti, name: "A Trader", roles: ["trader"], sub: "a.trader" };
  return `${base64Url({ alg: "none" })}.${base64Url(claims)}.signature`;
}

/** A token endpoint that answers each sign-in with a new token, or refuses once `refusing` says so. */
function endpoint(): {
  readonly fetch: () => Promise<Response>;
  readonly issued: string[];
  refusing: boolean;
} {
  const issued: string[] = [];
  const fake = {
    fetch: async (): Promise<Response> => {
      if (fake.refusing) {
        return Promise.resolve(new Response("Unauthorized", { status: 401 }));
      }
      const next = token(issued.length + 1);
      issued.push(next);
      return Promise.resolve(new Response(next));
    },
    issued,
    refusing: false,
  };
  return fake;
}

/** The API's conventions, refusing every token in `refused` with `invalid-token`. */
function conventionsRefusing(
  refused: (authorization: string | null) => boolean,
): ReturnType<typeof http.get> {
  return http.get("*/conventions", ({ request }) =>
    refused(request.headers.get("authorization"))
      ? HttpResponse.json(
          { status: 401, title: "The bearer token is not valid", type: "invalid-token" },
          { headers: { "content-type": "application/problem+json" }, status: 401 },
        )
      : HttpResponse.json(conventions),
  );
}

function notification(screen: RenderResult, text: string): ReturnType<RenderResult["getByText"]> {
  return screen.getByRole("region", { name: "Notifications" }).getByText(text, { exact: true });
}

describe("windowsSignIn in the shell", () => {
  test("an invalid-token is renewed and its request sent again, without a word to the user", async () => {
    const fake = endpoint();
    const sent: (string | null)[] = [];
    worker.use(
      conventionsRefusing((authorization) => {
        sent.push(authorization);
        return authorization === `Bearer ${fake.issued[0] ?? ""}`;
      }),
    );
    const signIn = windowsSignIn({ fetch: fake.fetch, storage: memoryStorage(), tokenUrl });
    const { screen } = await renderApp("/", signIn);
    await expect.element(screen.getByRole("cell", { name: "ACT/365F" })).toBeVisible();
    expect(sent).toStrictEqual([
      `Bearer ${fake.issued[0] ?? ""}`,
      `Bearer ${fake.issued[1] ?? ""}`,
    ]);
    await expect.element(screen.getByText("Your session has expired")).not.toBeInTheDocument();
  });

  test("an endpoint that refuses says the session has ended, with Sign in again, and the menu has no sign-out", async () => {
    const fake = endpoint();
    worker.use(
      conventionsRefusing((authorization) => {
        fake.refusing = true;
        return authorization !== null;
      }),
    );
    const signIn = windowsSignIn({ fetch: fake.fetch, storage: memoryStorage(), tokenUrl });
    const { screen } = await renderApp("/", signIn);
    await expect.element(notification(screen, "Your session has expired")).toBeVisible();
    await expect.element(notification(screen, "Sign in again")).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "ACT/365F" })).toBeVisible();
  });

  test("the user menu offers no sign-out to a user the adapter would sign in again at once", async () => {
    worker.use(conventionsRefusing(() => false));
    const fake = endpoint();
    const signIn = windowsSignIn({ fetch: fake.fetch, storage: memoryStorage(), tokenUrl });
    const { screen } = await renderApp("/", signIn);
    await screen.getByRole("button", { name: "A Trader" }).click();
    await expect
      .element(screen.getByRole("menuitem", { name: "Sign out" }))
      .not.toBeInTheDocument();
  });
});
