import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { TicketFormSection } from "./ticket-form.tsx";

describe("a ticket on TanStack Form", () => {
  test("sends numbers and the as-of date, which starts at the last business day", async () => {
    const screen = await render(<TicketFormSection />);
    await expect.element(screen.getByRole("textbox", { name: "As of" })).toHaveValue("2026-11-10");
    await userEvent.fill(screen.getByRole("textbox", { name: "Par" }), "5M");
    await userEvent.fill(screen.getByRole("textbox", { name: "Spread" }), "25bp");
    await userEvent.click(screen.getByRole("button", { name: "Send ticket" }));
    await expect
      .element(screen.getByText(/^Sent:/u))
      .toHaveTextContent("Sent: 5000 par at a spread of 0.0025, as of 2026-11-10.");
  });

  test("an amount the field cannot read is the field's one error, and the ticket is not sent", async () => {
    const screen = await render(<TicketFormSection />);
    const par = screen.getByRole("textbox", { name: "Par" });
    await userEvent.fill(par, "5k");
    await userEvent.tab();
    const reason = '"k" is not a suffix this field accepts: use m, mm, bn.';
    await expect.element(par).toHaveAccessibleDescription(reason);
    await userEvent.click(screen.getByRole("button", { name: "Send ticket" }));
    expect(
      screen
        .getByRole("alert")
        .all()
        .map((alert) => alert.element().textContent),
    ).toStrictEqual([reason]);
    await expect.element(screen.getByText(/^Sent:/u)).not.toBeInTheDocument();
  });

  test("an empty par asks for an amount once the ticket is sent", async () => {
    const screen = await render(<TicketFormSection />);
    await userEvent.click(screen.getByRole("button", { name: "Send ticket" }));
    await expect
      .element(screen.getByRole("textbox", { name: "Par" }))
      .toHaveAccessibleDescription("Enter an amount.");
    await expect.element(screen.getByText(/^Sent:/u)).not.toBeInTheDocument();
  });

  test("an as-of date on a holiday names it, in place of the form's own error", async () => {
    const screen = await render(<TicketFormSection />);
    const asOf = screen.getByRole("textbox", { name: "As of" });
    await userEvent.fill(asOf, "2026-11-11");
    await userEvent.tab();
    await expect
      .element(asOf)
      .toHaveAccessibleDescription(
        "2026-11-11 is not a business day on the SIFMA (US bond market) calendar: it closes for Veterans Day.",
      );
    await expect.element(screen.getByText("Pick an as-of date.")).not.toBeInTheDocument();
  });
});
