/* The shell around the pages: signing in and out, the not-found page, and how the app's problem types meet
 * @basis/ui's. */

import { fakeSignIn, problemSchema, validationProblemSchema } from "@basis/ui";
import type { Problem, SignIn, ValidationProblem } from "@basis/ui";
import type { RenderResult } from "vitest-browser-react";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type { DayCount, ProblemOutput, ValidationProblemOutput } from "#api/client.ts";
import {
  getBondResponseMock404,
  getConventionsMockHandler,
  getRecordSettlementResponseMock422,
} from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const conventions: DayCount[] = [{ convention: "ACT/360", year_days: 360 }];

/** Opens the user menu, shown under `name`, and chooses `item`. */
async function fromUserMenu(screen: RenderResult, name: string, item: string): Promise<void> {
  await screen.getByRole("button", { name }).click();
  await screen.getByRole("menuitem", { name: item }).click();
}

describe("signing in and out", () => {
  test("shows the signed-in user, and after signing out asks the API anonymously", async () => {
    const authorizations: (string | null)[] = [];
    worker.use(
      getConventionsMockHandler(({ request }) => {
        authorizations.push(request.headers.get("authorization"));
        return conventions;
      }),
    );
    const { screen } = await renderApp("/");
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await fromUserMenu(screen, "Dev User", "Sign out");
    await expect.element(screen.getByText("Signed out")).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "ACT/360" })).toBeVisible();
    expect(authorizations).toHaveLength(2);
    expect(authorizations[0]).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/u);
    expect(authorizations[1]).toBeNull();
  });

  test("signs an anonymous user in, and asks the API again with their token", async () => {
    const authorizations: (string | null)[] = [];
    worker.use(
      getConventionsMockHandler(({ request }) => {
        authorizations.push(request.headers.get("authorization"));
        return conventions;
      }),
    );
    const { screen } = await renderApp("/", fakeSignIn({ user: null }));
    await expect.element(screen.getByText("Signed out")).toBeVisible();
    await fromUserMenu(screen, "Signed out", "Sign in");
    await expect.element(screen.getByText("Dev User")).toBeVisible();
    await expect.poll(() => authorizations).toHaveLength(2);
    expect(authorizations[0]).toBeNull();
    expect(authorizations[1]).toMatch(/^Bearer /u);
  });

  test("a sign-in that fails says so, and signs in when the user tries again", async () => {
    worker.use(getConventionsMockHandler(conventions));
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
    worker.use(getConventionsMockHandler(conventions));
    const { screen, reports } = await renderApp("/");
    await expect.element(screen.getByRole("cell", { name: "ACT/360" })).toBeVisible();
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
      expect(problemSchema.safeParse(getBondResponseMock404()).success).toBe(true);
      expect(validationProblemSchema.safeParse(getRecordSettlementResponseMock422()).success).toBe(
        true,
      );
    },
  );
});
