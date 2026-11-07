import "#styles.css";

import { ErrorAlert } from "@basis/ui";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { AppShell } from "#pages/app-shell.tsx";

import { brokenResponse, invalidOrder, notFound, unreachable } from "./failures.ts";

describe("ErrorAlert", () => {
  test("shows a problem as an alert named by its title, with its detail and reference", async () => {
    const screen = await render(<ErrorAlert error={notFound} />);
    const alert = screen.getByRole("alert", { name: "No bond has that ISIN" });
    await expect.element(alert).toBeVisible();
    await expect
      .element(alert.getByText("No bond with ISIN US91282CRF04 is held in any book."))
      .toBeVisible();
    await expect.element(alert.getByText("019a5c3e-0000-7000-8000-000000000404")).toBeVisible();
    await expect.element(alert).toHaveAttribute("data-variant", "destructive");
  });

  test("lists each field a 422 names, by the name TanStack Form gives it", async () => {
    const screen = await render(<ErrorAlert error={invalidOrder} />);
    const items = screen.getByRole("listitem").elements();
    expect(items.map((item) => item.textContent)).toStrictEqual([
      "legs[0].price: Input should be greater than 0",
      "book: Book ARCHIVE is closed to new positions.",
      "settle: Should be a business day",
    ]);
  });

  test.each([
    [
      unreachable,
      "The server could not be reached",
      "Check the network connection, then try again.",
    ],
    [
      brokenResponse,
      "The response was not in the form this page expects",
      "The API may have changed since this page was built. Reload the page, and tell support if it happens again.",
    ],
  ])("names a failure the API never answered: %s", async (failure, title, detail) => {
    const screen = await render(<ErrorAlert error={failure} />);
    const alert = screen.getByRole("alert", { name: title });
    await expect.element(alert.getByText(detail)).toBeVisible();
  });

  test("offers to try again only when given onRetry, and calls it", async () => {
    const retry = vi.fn<() => void>();
    const screen = await render(
      <>
        <ErrorAlert error={notFound} />
        <ErrorAlert error={unreachable} onRetry={retry} />
      </>,
    );
    const buttons = screen.getByRole("button", { name: "Try again" });
    expect(buttons.elements()).toHaveLength(1);
    await buttons.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  test("renders nothing while there is no error", async () => {
    const screen = await render(
      <div data-testid="holder">
        <ErrorAlert error={null} />
        <ErrorAlert error={undefined} />
      </div>,
    );
    expect(screen.getByTestId("holder").element().childElementCount).toBe(0);
  });

  test("the page shows each kind of failure", async () => {
    const screen = await render(<AppShell />);
    expect(screen.getByRole("alert").elements()).toHaveLength(5);
  });
});
