import "#styles.css";

import { ApiError, Toaster, toast, toastError } from "@basis/ui";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AppShell } from "#pages/app-shell.tsx";

import { invalidOrder, notFound } from "./failures.ts";

/** The same refusal as `invalidOrder`, from another request, with its own reference. */
const invalidOrderAgain = new ApiError(
  422,
  { ...invalidOrder.problem, instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000423" },
  "The request is not valid",
);

/** The lines of a toast's description. */
function linesOf(raised: HTMLElement): readonly (string | null)[] {
  return [...raised.querySelectorAll('[data-slot="toast-description"] > span')].map(
    (line) => line.textContent,
  );
}

afterEach(() => {
  toast.close();
  vi.useRealTimers();
});

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

  test("the same error again soon after shows once, with the latest reference and a count", async () => {
    await render(<Toaster />);
    const ids = [toastError(notFound), toastError(invalidOrder), toastError(invalidOrderAgain)];
    const raised = await shownToast("The request is not valid");
    await expect.poll(() => linesOf(raised).at(-1)).toBe("This happened 2 times.");
    expect([
      notifications.element().querySelectorAll('[data-slot="toast"]').length,
      ids[1] === ids[2],
      linesOf(raised).at(-2),
    ]).toStrictEqual([2, true, "Reference 019a5c3e-0000-7000-8000-000000000423"]);
  });

  test("the same error after the window, or once its toast is closed, raises a new toast", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await render(<Toaster />);
    const first = toastError(notFound);
    vi.setSystemTime(Date.now() + 11_000);
    const late = toastError(notFound);
    toast.close(late);
    const closed = toastError(notFound);
    expect([first === late, late === closed]).toStrictEqual([false, false]);
  });

  test("the page's buttons raise a toast for each failure", async () => {
    const screen = await render(<AppShell />);
    await screen.getByRole("button", { name: "Lost connection" }).click();
    await shownToast("The server could not be reached");
    await screen.getByRole("button", { name: "Refused order" }).click();
    await shownToast("The request is not valid");
  });
});
