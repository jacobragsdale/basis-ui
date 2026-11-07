import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { OrderFormSection } from "./order-form.tsx";

describe("a form on TanStack Form", () => {
  test("shows the schema's error on a field once it is touched, in words and as invalid", async () => {
    const screen = await render(<OrderFormSection />);
    const cusip = screen.getByRole("textbox", { name: "CUSIP" });
    await expect.element(cusip).toHaveAttribute("aria-invalid", "false");
    await cusip.fill("abc");
    await userEvent.tab();
    await expect.element(cusip).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("A CUSIP is nine capital letters and digits.");
    await expect
      .element(screen.getByRole("textbox", { name: "Price" }))
      .toHaveAttribute("aria-invalid", "false");
  });

  test("puts the API's 422 error on the field its pointer names", async () => {
    const screen = await render(<OrderFormSection />);
    await screen.getByRole("textbox", { name: "CUSIP" }).fill("38141GXZ2");
    await screen.getByRole("textbox", { name: "Quantity" }).fill("5");
    await screen.getByRole("textbox", { name: "Price" }).fill("99.5");
    await screen.getByRole("button", { name: "Place order" }).click();
    const cusip = screen.getByRole("textbox", { name: "CUSIP" });
    await expect.element(cusip).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No bond with this CUSIP is on the desk's list.");
    await expect.element(screen.getByRole("status")).toHaveTextContent("");
  });

  test("places an order the API accepts", async () => {
    const screen = await render(<OrderFormSection />);
    await screen.getByRole("textbox", { name: "CUSIP" }).fill("912828XG0");
    await screen.getByRole("textbox", { name: "Quantity" }).fill("5");
    await screen.getByRole("textbox", { name: "Price" }).fill("99.5");
    await screen.getByRole("button", { name: "Place order" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Placed: 5 of 912828XG0 at 99.5.");
    expect(screen.getByRole("alert").all()).toHaveLength(0);
  });

  test("a submit with empty fields marks each one invalid with its reason", async () => {
    const screen = await render(<OrderFormSection />);
    await screen.getByRole("button", { name: "Place order" }).click();
    await expect.element(screen.getByRole("alert").nth(2)).toBeVisible();
    await Promise.all(
      ["CUSIP", "Quantity", "Price"].map(async (name) =>
        expect
          .element(screen.getByRole("textbox", { name }))
          .toHaveAttribute("aria-invalid", "true"),
      ),
    );
  });
});
