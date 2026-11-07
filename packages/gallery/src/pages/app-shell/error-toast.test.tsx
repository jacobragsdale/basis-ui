import "#styles.css";

import { Toaster, toastError } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AppShell } from "#pages/app-shell.tsx";

import { invalidOrder } from "./failures.ts";

const notifications = page.getByRole("region", { name: "Notifications" });

/** The toast whose title is `title`, once it shows. Base UI announces a high-priority toast through an alert of its
 * own and hides the toast itself from assistive technology until it takes the focus, so it is found by its text. */
async function shownToast(title: string): Promise<HTMLElement> {
  await expect.element(notifications.getByText(title)).toBeVisible();
  const raised = notifications.getByText(title).element().closest('[data-slot="toast"]');
  if (!(raised instanceof HTMLElement)) {
    throw new TypeError(`The title "${title}" is not inside a toast.`);
  }
  return raised;
}

describe(toastError, () => {
  test("raises the problem as a destructive toast, with its fields and reference a line each", async () => {
    await render(<Toaster />);
    toastError(invalidOrder);
    const raised = await shownToast("The request is not valid");
    expect(raised.dataset["variant"]).toBe("destructive");
    const lines = [...raised.querySelectorAll('[data-slot="toast-description"] > span')];
    expect(lines.map((line) => line.textContent)).toStrictEqual([
      "legs[0].price: Input should be greater than 0",
      "book: Book ARCHIVE is closed to new positions.",
      "settle: Should be a business day",
      "Reference 019a5c3e-0000-7000-8000-000000000422",
    ]);
  });

  test("the page's buttons raise a toast for each failure", async () => {
    const screen = await render(<AppShell />);
    await screen.getByRole("button", { name: "Lost connection" }).click();
    await shownToast("The server could not be reached");
    await screen.getByRole("button", { name: "Refused order" }).click();
    await shownToast("The request is not valid");
  });
});
