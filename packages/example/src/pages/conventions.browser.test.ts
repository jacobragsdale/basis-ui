import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import type { DayCount, ValidationProblem } from "#api/client.ts";
import { getConventionsMockHandler, getConventionsMockHandler422 } from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const conventions: DayCount[] = [
  { convention: "30/360", year_days: 360 },
  { convention: "ACT/360", year_days: 360 },
  { convention: "ACT/365F", year_days: 365 },
];

/** basis refuses a query key the route does not declare, and names it. */
const unknownParameter: ValidationProblem = {
  errors: [{ detail: "Extra inputs are not permitted", parameter: "page" }],
  instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000001",
  status: 422,
  title: "The request is not valid",
  type: "invalid-request",
};

/** The payload of a JWT, decoded. */
function claimsOf(token: string): unknown {
  const [, payload = ""] = token.split(".");
  return JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
}

describe("the conventions page", () => {
  test("lists the conventions the API returns, with the days each counts in a year", async () => {
    worker.use(getConventionsMockHandler(conventions));
    const { screen } = await renderApp("/");
    await expect
      .element(screen.getByRole("heading", { name: "Day count conventions" }))
      .toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "ACT/365F" })).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "365" })).toBeVisible();
    expect(screen.getByRole("row").elements()).toHaveLength(4);
  });

  test("asks the API under /api, with the signed-in user's token", async () => {
    const requests: { readonly authorization: string | null; readonly path: string }[] = [];
    worker.use(
      getConventionsMockHandler(({ request }) => {
        requests.push({
          authorization: request.headers.get("authorization"),
          path: new URL(request.url).pathname,
        });
        return conventions;
      }),
    );
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("cell", { name: "30/360" })).toBeVisible();
    const [first] = requests;
    expect(first?.path).toBe("/api/conventions");
    const token = first?.authorization?.replace(/^Bearer /u, "") ?? "";
    expect(claimsOf(token)).toMatchObject({ name: "Dev User", sub: "dev-user" });
  });

  test("shows a problem the API answers, with the fields it names and its reference", async () => {
    worker.use(getConventionsMockHandler422(unknownParameter));
    const { screen, reports } = await renderApp("/");
    const alert = screen.getByRole("alert", { name: "The request is not valid" });
    await expect.element(alert).toBeVisible();
    await expect.element(alert.getByText("page: Extra inputs are not permitted")).toBeVisible();
    await expect.element(alert.getByText("019a5c3e-0000-7000-8000-000000000001")).toBeVisible();
    expect(reports.errors.map(({ source }) => source)).toStrictEqual(["query"]);
  });

  test("asks again when the user tries again after an error", async () => {
    worker.use(getConventionsMockHandler422(unknownParameter));
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("alert")).toBeVisible();
    worker.use(getConventionsMockHandler(conventions));
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect.element(screen.getByRole("cell", { name: "ACT/360" })).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  test("says when a response breaks the API's document, and reports it", async () => {
    worker.use(
      http.get("*/conventions", () =>
        HttpResponse.json([{ convention: "ACT/ACT", year_days: 365 }]),
      ),
    );
    const { screen, reports } = await renderApp("/");
    await expect
      .element(
        screen.getByRole("alert", { name: "The response was not in the form this page expects" }),
      )
      .toBeVisible();
    expect(reports.errors).toHaveLength(1);
    expect(reports.errors[0]?.error).toBeInstanceOf(Error);
  });
});
