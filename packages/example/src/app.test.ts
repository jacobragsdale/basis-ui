/* The shell around the pages: signing in and out, the not-found page, and how the app's problem types meet
 * @basis/ui's. */

import { fakeSignIn, problemSchema, validationProblemSchema } from "@basis/ui";
import type { Problem, SignIn, ValidationProblem } from "@basis/ui";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type { Position, ProblemOutput, ValidationProblemOutput } from "#api/client.ts";
import {
  getGetPositionResponseMock404,
  getGetPositionsMockHandler,
  getGetPositionsResponseMock422,
} from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const position: Position = {
  as_of: "2026-11-06",
  book: "RATES",
  note: null,
  position_id: 1,
  price: "99.515625",
  quantity: 5_000_000,
  symbol: "UST10Y",
};

describe("signing in and out", () => {
  test("shows the signed-in user, and after signing out asks the API anonymously", async () => {
    const authorizations: (string | null)[] = [];
    worker.use(
      getGetPositionsMockHandler(({ request }) => {
        authorizations.push(request.headers.get("authorization"));
        return [position];
      }),
    );
    const { screen } = await renderApp("/");
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await screen.getByRole("button", { name: "Sign out" }).click();
    await expect.element(screen.getByText("Signed out")).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "UST10Y" })).toBeVisible();
    expect(authorizations).toHaveLength(2);
    expect(authorizations[0]).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/u);
    expect(authorizations[1]).toBeNull();
  });

  test("a sign-in that fails says so, and signs in when the user tries again", async () => {
    worker.use(getGetPositionsMockHandler([position]));
    const working = fakeSignIn();
    let attempts = 0;
    const flaky: SignIn = {
      ...working,
      currentUser: async () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("The sign-in system did not answer."))
          : working.currentUser();
      },
    };
    const { screen, reports } = await renderApp("/", flaky);
    const alert = screen.getByRole("alert", { name: "Something went wrong" });
    await expect.element(alert.getByText("The sign-in system did not answer.")).toBeVisible();
    expect(reports.errors.map(({ source }) => source)).toStrictEqual(["sign-in"]);
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect.element(screen.getByText("Dev User")).toBeVisible();
  });
});

describe("routing", () => {
  test("an address no route matches shows the not-found page, which links to the start", async () => {
    const { screen } = await renderApp("/trades");
    await expect.element(screen.getByText("Page not found")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Go to the start page" }))
      .toHaveAttribute("href", "/");
  });

  test("each navigation's time is reported", async () => {
    worker.use(getGetPositionsMockHandler([position]));
    const { screen, reports } = await renderApp("/");
    await expect.element(screen.getByRole("link", { name: "UST10Y" })).toBeVisible();
    expect(reports.timings).toContain("navigation");
  });
});

describe("the generated problem types", () => {
  test("fit @basis/ui's, so its error display reads every problem the API documents", () => {
    expectTypeOf<ProblemOutput>().toExtend<Problem>();
    expectTypeOf<ValidationProblemOutput>().toExtend<ValidationProblem>();
  });

  test.each([...Array.from({ length: 20 }).keys()])(
    "parse with @basis/ui's schemas as the generated mocks make them, sample %i",
    () => {
      expect(problemSchema.safeParse(getGetPositionResponseMock404()).success).toBe(true);
      expect(validationProblemSchema.safeParse(getGetPositionsResponseMock422()).success).toBe(
        true,
      );
    },
  );
});
