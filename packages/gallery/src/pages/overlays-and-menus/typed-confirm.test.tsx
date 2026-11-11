import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { TypedConfirmExample } from "./typed-confirm.tsx";

describe("TypedConfirmDialog", () => {
  test("keeps its action off until the name is typed exactly, case and all", async () => {
    const screen = await render(<TypedConfirmExample />);
    await userEvent.click(screen.getByRole("button", { name: "Delete book" }));
    const dialog = page.getByRole("alertdialog", { name: "Delete the book Rates?" });
    const action = dialog.getByRole("button", { name: "Delete book" });
    await expect.element(action).toBeDisabled();
    const field = dialog.getByRole("textbox", { name: "Type Rates to confirm" });
    await userEvent.fill(field, "rates");
    await expect.element(action).toBeDisabled();
    await userEvent.fill(field, "Rates");
    await expect.element(action).toBeEnabled();
  });

  test("runs the action on Enter once the name matches, and closes", async () => {
    const screen = await render(<TypedConfirmExample />);
    await userEvent.click(screen.getByRole("button", { name: "Delete book" }));
    const dialog = page.getByRole("alertdialog", { name: "Delete the book Rates?" });
    await userEvent.fill(dialog.getByRole("textbox", { name: "Type Rates to confirm" }), "Rates");
    await userEvent.keyboard("{Enter}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(screen.getByText("Deleted the book Rates.")).toBeVisible();
  });

  test("starts empty again when it opens again, so a second action is typed again", async () => {
    const screen = await render(<TypedConfirmExample />);
    await userEvent.click(screen.getByRole("button", { name: "Delete book" }));
    const dialog = page.getByRole("alertdialog", { name: "Delete the book Rates?" });
    await userEvent.fill(dialog.getByRole("textbox", { name: "Type Rates to confirm" }), "Rat");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete book" }));
    await expect
      .element(page.getByRole("textbox", { name: "Type Rates to confirm" }))
      .toHaveValue("");
  });
});
