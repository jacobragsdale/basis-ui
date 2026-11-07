import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import type { Position, ValidationProblem } from "#api/client.ts";
import { getGetPositionsMockHandler, getGetPositionsMockHandler422 } from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const positions: Position[] = [
  {
    as_of: "2026-11-06",
    book: "RATES",
    note: null,
    position_id: 1,
    price: "99.515625",
    quantity: 5_000_000,
    symbol: "UST10Y",
  },
  {
    as_of: "2026-11-06",
    book: "RATES",
    note: "Roll on Friday",
    position_id: 2,
    price: "100.0625",
    quantity: 2_500_000,
    symbol: "UST2Y",
  },
];

const invalidLimit: ValidationProblem = {
  errors: [{ detail: "Input should be less than or equal to 1000", parameter: "limit" }],
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

describe("the positions page", () => {
  test("lists the positions the API returns, each linking to its own page", async () => {
    worker.use(getGetPositionsMockHandler(positions));
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("heading", { name: "Positions" })).toBeVisible();
    const link = screen.getByRole("link", { name: "UST10Y" });
    await expect.element(link).toHaveAttribute("href", "/positions/1");
    await expect.element(screen.getByRole("cell", { name: "5,000,000" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "UST2Y" })).toBeVisible();
  });

  test("asks the API under /api, with the signed-in user's token", async () => {
    const requests: { readonly authorization: string | null; readonly path: string }[] = [];
    worker.use(
      getGetPositionsMockHandler(({ request }) => {
        requests.push({
          authorization: request.headers.get("authorization"),
          path: new URL(request.url).pathname,
        });
        return positions;
      }),
    );
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("link", { name: "UST10Y" })).toBeVisible();
    const [first] = requests;
    expect(first?.path).toBe("/api/positions");
    const token = first?.authorization?.replace(/^Bearer /u, "") ?? "";
    expect(claimsOf(token)).toMatchObject({ name: "Dev User", sub: "dev-user" });
  });

  test("shows a problem the API answers, with the fields it names and its reference", async () => {
    worker.use(getGetPositionsMockHandler422(invalidLimit));
    const { screen, reports } = await renderApp("/");
    const alert = screen.getByRole("alert", { name: "The request is not valid" });
    await expect.element(alert).toBeVisible();
    await expect
      .element(alert.getByText("limit: Input should be less than or equal to 1000"))
      .toBeVisible();
    await expect.element(alert.getByText("019a5c3e-0000-7000-8000-000000000001")).toBeVisible();
    expect(reports.errors.map(({ source }) => source)).toStrictEqual(["query"]);
  });

  test("asks again when the user tries again after an error", async () => {
    worker.use(getGetPositionsMockHandler422(invalidLimit));
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("alert")).toBeVisible();
    worker.use(getGetPositionsMockHandler(positions));
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect.element(screen.getByRole("link", { name: "UST10Y" })).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  test("retries a 503 before showing an error, and shows the data once the API answers", async () => {
    let calls = 0;
    worker.use(
      http.get("*/positions", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              {
                status: 503,
                title: "The sign-in system's keys are unavailable",
                type: "keys-unavailable",
              },
              { headers: { "content-type": "application/problem+json" }, status: 503 },
            )
          : HttpResponse.json(positions);
      }),
    );
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("link", { name: "UST10Y" })).toBeVisible();
    expect(calls).toBe(2);
  });

  test("says when a response breaks the API's document, and reports it", async () => {
    worker.use(
      http.get("*/positions", () => HttpResponse.json([{ ...positions[0], quantity: "five" }])),
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
