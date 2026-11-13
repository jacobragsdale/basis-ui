/* A toast raised while a modal is open, as BasisApp raises a failed save's error from a form in a Dialog: it shows
 * over the dialog and its veil, a click on it reaches it, and the dialog stays open. */

import "#styles.css";

import { Dialog, DialogContent, DialogTitle, Toaster, toast } from "@basis/ui";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** A Toaster mounted first, as BasisApp's is, before any dialog's portal, then an open Dialog. */
async function dialogOverToaster(): Promise<Locator> {
  await render(
    <>
      <Toaster />
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Book a trade</DialogTitle>
          <p>The ticket.</p>
        </DialogContent>
      </Dialog>
    </>,
  );
  const dialog = page.getByRole("dialog", { name: "Book a trade" });
  await expect.element(dialog).toBeVisible();
  return dialog;
}

/** Whether `element` is what a pointer at its centre lands on. */
function isTopmost(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
}

describe("A toast over a modal", () => {
  test("is the topmost thing where it shows, takes its own click, and leaves the dialog open", async () => {
    const onClick = vi.fn<() => void>();
    const dialog = await dialogOverToaster();
    toast.add({
      actionProps: { children: "Try again", onClick },
      timeout: 0,
      title: "The trade was not booked",
      type: "error",
    });
    const action = page.getByRole("button", { name: "Try again" });
    await expect.element(action).toBeVisible();
    expect(isTopmost(action.element())).toBe(true);
    await userEvent.click(action);
    expect(onClick).toHaveBeenCalledOnce();
    await expect.element(dialog).toBeVisible();
  });
});
