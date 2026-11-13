import "#styles.css";

import { TypedConfirmDialog } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { TypedConfirmExample } from "./typed-confirm.tsx";

/** A TypedConfirmDialog held open, inside a form whose submits land in `onSubmit`. */
function InForm({
  onSubmit,
  ...props
}: Partial<ComponentProps<typeof TypedConfirmDialog>> & {
  readonly onSubmit: () => void;
}): ReactElement {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TypedConfirmDialog
        open
        onOpenChange={vi.fn<() => void>()}
        title="Delete the book?"
        description="This cannot be undone."
        confirmText="Rates"
        actionLabel="Delete book"
        onConfirm={vi.fn<() => void>()}
        {...props}
      />
    </form>
  );
}

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

  test("inside a form, confirming does not submit the form", async () => {
    const onSubmit = vi.fn<() => void>();
    const onConfirm = vi.fn<() => void>();
    await render(<InForm onSubmit={onSubmit} onConfirm={onConfirm} />);
    const dialog = page.getByRole("alertdialog", { name: "Delete the book?" });
    await userEvent.fill(dialog.getByRole("textbox", { name: "Type Rates to confirm" }), "Rates");
    await userEvent.keyboard("{Enter}");
    expect([onConfirm.mock.calls.length, onSubmit.mock.calls.length]).toStrictEqual([1, 0]);
  });

  test("an empty name never matches, so nothing typed cannot confirm", async () => {
    const onConfirm = vi.fn<() => void>();
    await render(<InForm onSubmit={vi.fn<() => void>()} onConfirm={onConfirm} confirmText="" />);
    const dialog = page.getByRole("alertdialog", { name: "Delete the book?" });
    await expect.element(dialog.getByRole("button", { name: "Delete book" })).toBeDisabled();
    await dialog.getByRole("textbox").click();
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("a name with doubled or trailing spaces matches as its label shows it", async () => {
    await render(<InForm onSubmit={vi.fn<() => void>()} confirmText="Rates  Desk " />);
    const dialog = page.getByRole("alertdialog", { name: "Delete the book?" });
    await userEvent.fill(dialog.getByRole("textbox"), "Rates Desk");
    await expect.element(dialog.getByRole("button", { name: "Delete book" })).toBeEnabled();
  });
});
