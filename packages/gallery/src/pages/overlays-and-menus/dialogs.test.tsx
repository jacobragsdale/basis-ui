import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AlertDialogExample, DialogExample, SmallAlertDialogExample } from "./dialogs.tsx";
import { clickOutside, focusIsIn, focusReturnsTo } from "./helpers.ts";

const dialog = page.getByRole("dialog", { name: "Edit position" });
const alertDialog = page.getByRole("alertdialog", { name: "Delete the saved view?" });

/** Renders the dialog and returns its trigger. */
async function renderDialog(): Promise<Locator> {
  const screen = await render(<DialogExample />);
  return screen.getByRole("button", { name: "Edit position" });
}

/** Renders the alert dialog and returns its trigger. */
async function renderAlertDialog(): Promise<Locator> {
  const screen = await render(<AlertDialogExample />);
  return screen.getByRole("button", { name: "Delete view" });
}

describe("Dialog", () => {
  test("its trigger opens a dialog named by its title and described by its description, and focus moves in", async () => {
    await userEvent.click(await renderDialog());
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription("Change the target weight of a holding in its model.");
    await focusIsIn(dialog);
  });

  test("Enter on the trigger opens it, and Escape closes it and returns focus to the trigger", async () => {
    const trigger = await renderDialog();
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await focusIsIn(dialog);
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("its close button closes it and returns focus to the trigger", async () => {
    const trigger = await renderDialog();
    await userEvent.click(trigger);
    await userEvent.click(dialog.getByRole("button", { exact: true, name: "Close" }));
    await expect.element(dialog).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("a click outside closes it", async () => {
    await userEvent.click(await renderDialog());
    await expect.element(dialog).toBeVisible();
    await clickOutside("dialog-viewport");
    await expect.element(dialog).not.toBeInTheDocument();
  });

  test("Tab and Shift+Tab keep focus inside it", async () => {
    await userEvent.click(await renderDialog());
    await focusIsIn(dialog);
    await userEvent.keyboard("{Tab}{Tab}{Tab}{Tab}");
    await focusIsIn(dialog);
    await userEvent.keyboard("{Shift>}{Tab}{Tab}{Tab}{Tab}{Tab}{/Shift}");
    await focusIsIn(dialog);
  });
});

describe("Alert Dialog", () => {
  test("its trigger opens an alert dialog named by its title, and focus moves in", async () => {
    await userEvent.click(await renderAlertDialog());
    await expect.element(alertDialog).toBeVisible();
    await expect
      .element(alertDialog)
      .toHaveAccessibleDescription(
        "Duration by sector is removed for everyone it is shared with. This cannot be undone.",
      );
    await focusIsIn(alertDialog);
  });

  test("a click outside does not close it, and Tab brings focus back into it", async () => {
    await userEvent.click(await renderAlertDialog());
    await expect.element(alertDialog).toBeVisible();
    await clickOutside("alert-dialog-viewport");
    await expect.element(alertDialog).toBeVisible();
    await userEvent.tab();
    await focusIsIn(alertDialog);
  });

  test("Enter on the trigger opens it, and Escape closes it and returns focus to the trigger", async () => {
    const trigger = await renderAlertDialog();
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await focusIsIn(alertDialog);
    await userEvent.keyboard("{Escape}");
    await expect.element(alertDialog).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("Cancel closes it and returns focus to the trigger", async () => {
    const trigger = await renderAlertDialog();
    await userEvent.click(trigger);
    await userEvent.click(alertDialog.getByRole("button", { name: "Cancel" }));
    await expect.element(alertDialog).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("the action runs its handler, which closes it", async () => {
    await userEvent.click(await renderAlertDialog());
    await userEvent.click(alertDialog.getByRole("button", { name: "Delete" }));
    await expect.element(alertDialog).not.toBeInTheDocument();
  });

  test("its action and cancel draw as Buttons of their variants", async () => {
    await userEvent.click(await renderAlertDialog());
    await expect
      .element(alertDialog.getByRole("button", { name: "Delete" }))
      .toHaveAttribute("data-variant", "destructive");
    await expect
      .element(alertDialog.getByRole("button", { name: "Cancel" }))
      .toHaveAttribute("data-variant", "outline");
  });

  test("the small size puts its two actions side by side, at the same width", async () => {
    const screen = await render(<SmallAlertDialogExample />);
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    const small = page.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect.element(small).toHaveAttribute("data-size", "sm");
    const keep = small
      .getByRole("button", { name: "Keep editing" })
      .element()
      .getBoundingClientRect();
    const discard = small
      .getByRole("button", { name: "Discard" })
      .element()
      .getBoundingClientRect();
    expect(keep.top).toBeCloseTo(discard.top, 0);
    expect(keep.width).toBeCloseTo(discard.width, 0);
  });
});
