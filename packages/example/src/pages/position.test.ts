import { describe, expect, test } from "vite-plus/test";

import type { Position, PositionCreate } from "#api/client.ts";
import {
  getCreatePositionMockHandler,
  getCreatePositionMockHandler422,
  getGetPositionMockHandler,
  getGetPositionMockHandler404,
} from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const position: Position = {
  as_of: "2026-11-06",
  book: "RATES",
  note: "Roll on Friday",
  position_id: 7,
  price: "99.515625",
  quantity: 5_000_000,
  symbol: "UST10Y",
};

/** Serves `positions` by id, and a 404 for any other. */
function servePositions(...positions: readonly Position[]): void {
  worker.use(
    getGetPositionMockHandler(({ params }) => {
      const found = positions.find(({ position_id: id }) => String(id) === params.positionId);
      if (found === undefined) {
        throw new Error(`The test serves no position ${params.positionId}.`);
      }
      return found;
    }),
  );
}

describe("a position's page", () => {
  test("shows the position's fields", async () => {
    servePositions(position);
    const { screen } = await renderApp("/positions/7");
    await expect.element(screen.getByRole("heading", { name: "Position 7" })).toBeVisible();
    await expect.element(screen.getByText("RATES, as of 2026-11-06")).toBeVisible();
    await expect.element(screen.getByText("5,000,000")).toBeVisible();
    await expect.element(screen.getByText("Roll on Friday")).toBeVisible();
  });

  test("shows the API's 404 for a position it does not hold", async () => {
    worker.use(
      getGetPositionMockHandler404({
        detail: "No position 8 is held in any book.",
        status: 404,
        title: "No position has that id",
        type: "unknown-position",
      }),
    );
    const { screen } = await renderApp("/positions/8");
    const alert = screen.getByRole("alert", { name: "No position has that id" });
    await expect.element(alert).toBeVisible();
    await expect.element(alert.getByText("No position 8 is held in any book.")).toBeVisible();
  });

  test("books a copy of the position, says so, and opens it", async () => {
    const booked: PositionCreate[] = [];
    servePositions(position, { ...position, position_id: 8 });
    worker.use(
      getCreatePositionMockHandler(async ({ request }) => {
        const body: PositionCreate = await request.clone().json();
        booked.push(body);
        return { ...position, position_id: 8 };
      }),
    );
    const { screen, reports } = await renderApp("/positions/7");
    await screen.getByRole("button", { name: "Book again" }).click();
    await expect.element(screen.getByText("Booked position 8")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Position 8" })).toBeVisible();
    expect(booked).toStrictEqual([
      {
        as_of: "2026-11-06",
        book: "RATES",
        note: "Roll on Friday",
        price: "99.515625",
        quantity: 5_000_000,
        symbol: "UST10Y",
      },
    ]);
    expect(reports.events).toStrictEqual(["position.booked"]);
  });

  test("a booking the API refuses raises a toast with its problem, and is reported", async () => {
    servePositions(position);
    worker.use(
      getCreatePositionMockHandler422({
        errors: [{ detail: "Book RATES is closed to new positions.", pointer: "#/book" }],
        status: 422,
        title: "The request is not valid",
        type: "invalid-request",
      }),
    );
    const { screen, reports } = await renderApp("/positions/7");
    await screen.getByRole("button", { name: "Book again" }).click();
    const notifications = screen.getByRole("region", { name: "Notifications" });
    await expect.element(notifications.getByText("The request is not valid")).toBeVisible();
    await expect
      .element(notifications.getByText("book: Book RATES is closed to new positions."))
      .toBeVisible();
    expect(reports.errors.map(({ source }) => source)).toStrictEqual(["mutation"]);
  });
});
