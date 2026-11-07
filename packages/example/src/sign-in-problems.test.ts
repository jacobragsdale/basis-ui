/* How the shell answers the problems basis's contract names for sign-in: `invalid-token` ends the session,
 * `sign-in-required` asks the user to sign in, and `keys-unavailable` is retried without signing anyone out. */

import { fakeSignIn } from "@basis/ui";
import type { SignIn } from "@basis/ui";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";
import type { RenderResult } from "vitest-browser-react";

import type { Bond, DayCount, Settlement } from "#api/client.ts";
import { getBondMockHandler } from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const conventions: DayCount[] = [{ convention: "ACT/365F", year_days: 365 }];

const bond: Bond = {
  convention: "30/360",
  coupon_rate: "0.04125",
  frequency: 2,
  issued: "2026-05-15",
  maturity: "2036-05-15",
  security_id: "US91282CRF04",
};

interface ProblemBody {
  readonly status: number;
  readonly title: string;
  readonly type: string;
}

/** A problem details response, as basis answers one. */
function problem(status: number, type: string, title: string): HttpResponse<ProblemBody> {
  return HttpResponse.json(
    { status, title, type },
    { headers: { "content-type": "application/problem+json" }, status },
  );
}

const invalidToken = (): HttpResponse<ProblemBody> =>
  problem(401, "invalid-token", "The bearer token is not valid");
const signInRequired = (): HttpResponse<ProblemBody> =>
  problem(401, "sign-in-required", "Sign-in is required");
const keysUnavailable = (): HttpResponse<ProblemBody> =>
  problem(503, "keys-unavailable", "The sign-in system's keys are unavailable");

/** `fakeSignIn`'s adapter, counting how often the shell signs the user in and out through it. */
function countedSignIn(adapter: SignIn = fakeSignIn()): {
  readonly signIn: SignIn;
  readonly calls: { signIns: number; signOuts: number };
} {
  const calls = { signIns: 0, signOuts: 0 };
  return {
    calls,
    signIn: {
      ...adapter,
      signIn: async () => {
        calls.signIns += 1;
        await adapter.signIn();
      },
      signOut: async () => {
        calls.signOuts += 1;
        await adapter.signOut();
      },
    },
  };
}

const recorded: Settlement = {
  accrued: "20510.87",
  face: "1000000.00",
  recorded_at: "2026-11-07T15:30:00Z",
  security_id: "US91282CRF04",
  settle: "2026-11-10",
  settlement_id: "019a5c3e-0000-7000-8000-0000000000aa",
};

/** Fills the settlement form and sends it. */
async function recordSettlement(screen: RenderResult): Promise<void> {
  await screen.getByLabelText("ISIN").fill(recorded.security_id);
  await screen.getByLabelText("Face amount").fill(recorded.face);
  await screen.getByLabelText("Settlement date").fill(recorded.settle);
  await screen.getByRole("button", { name: "Record settlement" }).click();
}

/** What the toasts show as `text`, such as a title or an action. Base UI hides a high-priority toast from assistive
 * technology until it takes the focus, and announces it through an alert of its own, so it is found by its text. */
function notification(screen: RenderResult, text: string): ReturnType<RenderResult["getByText"]> {
  return screen.getByRole("region", { name: "Notifications" }).getByText(text, { exact: true });
}

describe("an invalid-token 401", () => {
  test("signs the user out through the adapter, says the session expired, and asks again anonymously", async () => {
    const authorizations: (string | null)[] = [];
    worker.use(
      http.get("*/conventions", ({ request }) => {
        const authorization = request.headers.get("authorization");
        authorizations.push(authorization);
        return authorization === null ? HttpResponse.json(conventions) : invalidToken();
      }),
    );
    const { signIn, calls } = countedSignIn();
    const { screen } = await renderApp("/", signIn);
    await expect.element(notification(screen, "Your session has expired")).toBeVisible();
    await expect.element(notification(screen, "Sign in again to carry on.")).toBeVisible();
    await expect.element(screen.getByText("Signed out")).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "ACT/365F" })).toBeVisible();
    expect(calls.signOuts).toBe(1);
    expect(authorizations.map((value) => value?.split(" ")[0] ?? null)).toStrictEqual([
      "Bearer",
      null,
    ]);
  });

  test("the toast's Sign in signs the user in again, and the page asks with their new token", async () => {
    const schemes: (string | null)[] = [];
    worker.use(
      http.get("*/conventions", ({ request }) => {
        const scheme = request.headers.get("authorization")?.split(" ")[0] ?? null;
        schemes.push(scheme);
        return scheme !== null && schemes.length === 1
          ? invalidToken()
          : HttpResponse.json(conventions);
      }),
    );
    const { signIn, calls } = countedSignIn();
    const { screen } = await renderApp("/", signIn);
    await expect.element(notification(screen, "Your session has expired")).toBeVisible();
    await notification(screen, "Sign in").click();
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await expect.element(notification(screen, "Your session has expired")).not.toBeInTheDocument();
    expect(schemes).toStrictEqual(["Bearer", null, "Bearer"]);
    expect(calls).toStrictEqual({ signIns: 1, signOuts: 1 });
  });

  test("a mutation it refuses signs the user out too, with the sign-in toast and no error toast", async () => {
    worker.use(
      http.get("*/conventions", () => HttpResponse.json(conventions)),
      http.post("*/settlements", invalidToken),
    );
    const { signIn, calls } = countedSignIn();
    const { screen } = await renderApp("/settlements/new", signIn);
    await recordSettlement(screen);
    await expect.element(notification(screen, "Your session has expired")).toBeVisible();
    await expect.element(screen.getByText("Signed out")).toBeVisible();
    await expect
      .element(notification(screen, "The bearer token is not valid"))
      .not.toBeInTheDocument();
    expect(calls.signOuts).toBe(1);
  });
});

describe("a sign-in-required 401", () => {
  test("asks the anonymous user to sign in, and shows the page once they do", async () => {
    worker.use(
      http.get("*/bonds/:security", ({ request }) =>
        request.headers.get("authorization") === null ? signInRequired() : HttpResponse.json(bond),
      ),
    );
    const { signIn, calls } = countedSignIn(fakeSignIn({ user: null }));
    const { screen } = await renderApp("/bonds/US91282CRF04", signIn);
    await expect.element(screen.getByRole("alert", { name: "Sign-in is required" })).toBeVisible();
    await expect.element(notification(screen, "Sign in to carry on")).toBeVisible();
    await notification(screen, "Sign in").click();
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await expect.element(screen.getByText("Issued 2026-05-15, matures 2036-05-15")).toBeVisible();
    expect(calls).toStrictEqual({ signIns: 1, signOuts: 0 });
  });
});

describe("a keys-unavailable 503", () => {
  test("is asked again, with the user's token, and the user stays signed in", async () => {
    const authorizations: (string | null)[] = [];
    worker.use(
      http.get("*/bonds/:security", ({ request }) => {
        authorizations.push(request.headers.get("authorization"));
        return authorizations.length === 1 ? keysUnavailable() : HttpResponse.json(bond);
      }),
    );
    const { signIn, calls } = countedSignIn();
    const { screen } = await renderApp("/bonds/US91282CRF04", signIn);
    await expect
      .element(screen.getByText("Issued 2026-05-15, matures 2036-05-15"), { timeout: 3000 })
      .toBeVisible();
    expect(authorizations).toHaveLength(2);
    expect(authorizations.every((value) => value?.startsWith("Bearer ") === true)).toBe(true);
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    expect(calls.signOuts).toBe(0);
  });

  test("shows its problem once the retries are spent, and still never signs the user out", async () => {
    let calls = 0;
    worker.use(
      http.get("*/conventions", () => {
        calls += 1;
        return keysUnavailable();
      }),
    );
    const counted = countedSignIn();
    const { screen } = await renderApp("/", counted.signIn);
    await expect
      .element(screen.getByRole("alert", { name: "The sign-in system's keys are unavailable" }), {
        timeout: 6000,
      })
      .toBeVisible();
    expect(calls).toBe(3);
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await expect
      .element(screen.getByRole("region", { name: "Notifications" }).getByText(/sign in/iu))
      .not.toBeInTheDocument();
    expect(counted.calls.signOuts).toBe(0);
  });

  test("sends a mutation again, since basis refused it before any handler ran", async () => {
    let posts = 0;
    worker.use(
      getBondMockHandler(bond),
      http.post("*/settlements", () => {
        posts += 1;
        return posts === 1 ? keysUnavailable() : HttpResponse.json(recorded, { status: 201 });
      }),
    );
    const { signIn, calls } = countedSignIn();
    const { screen } = await renderApp("/settlements/new", signIn);
    await recordSettlement(screen);
    await expect
      .element(screen.getByRole("heading", { name: "Bond US91282CRF04" }), { timeout: 3000 })
      .toBeVisible();
    expect(posts).toBe(2);
    expect(calls.signOuts).toBe(0);
  });
});
