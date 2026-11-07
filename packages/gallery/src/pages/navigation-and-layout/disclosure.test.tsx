import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { FillsCollapsible, TradeAccordion } from "./disclosure.tsx";
import { inCompactDensity, isTarget } from "./test-helpers.ts";

describe("Accordion", () => {
  test("its triggers are buttons named by their text, and the open one's region is named by it", async () => {
    const screen = await render(<TradeAccordion />);
    await expect
      .element(screen.getByRole("button", { name: "When does it settle?" }))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByRole("region", { name: "When does it settle?" }))
      .toHaveTextContent("T+1 on SIFMA's calendar, so a Friday trade settles on Monday.");
    await expect
      .element(screen.getByRole("button", { name: "Who computes accrued interest?" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  test("Enter opens a section and closes the open one; Space closes it again", async () => {
    const screen = await render(<TradeAccordion />);
    const accrued = screen.getByRole("button", { name: "Who computes accrued interest?" });
    accrued.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(accrued).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByRole("button", { name: "When does it settle?" }))
      .toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard(" ");
    await expect.element(accrued).toHaveAttribute("aria-expanded", "false");
  });

  test("with multiple, opening one leaves the others open", async () => {
    const screen = await render(<TradeAccordion multiple />);
    await userEvent.click(screen.getByRole("button", { name: "Who computes accrued interest?" }));
    await expect
      .element(screen.getByRole("button", { name: "When does it settle?" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  test("Tab moves from trigger to trigger, past the open section's content", async () => {
    const screen = await render(<TradeAccordion />);
    screen.getByRole("button", { name: "When does it settle?" }).element().focus();
    await userEvent.tab();
    await expect.element(screen.getByRole("link", { name: "Read why" })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Who computes accrued interest?" }))
      .toHaveFocus();
  });

  test("a disabled section's trigger is disabled", async () => {
    const screen = await render(<TradeAccordion />);
    await expect
      .element(screen.getByRole("button", { name: "How is it allocated?" }))
      .toBeDisabled();
  });

  test("its triggers stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<TradeAccordion />);
      const trigger = screen.getByRole("button", { name: "When does it settle?" }).element();
      expect(isTarget(trigger)).toBe(true);
    });
  });
});

describe("Collapsible", () => {
  test("its trigger is a button named by its text, closed at first", async () => {
    const screen = await render(<FillsCollapsible />);
    const trigger = screen.getByRole("button", { name: "Show every fill" });
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/^10:41/u).query()).toBeNull();
  });

  test("Enter shows the content and Space hides it", async () => {
    const screen = await render(<FillsCollapsible />);
    const trigger = screen.getByRole("button", { name: "Show every fill" });
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByText(/^10:41/u)).toBeVisible();
    await userEvent.keyboard(" ");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await expect.element(screen.getByText(/^10:41/u)).not.toBeInTheDocument();
  });

  test("its trigger stays a 24 px target in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<FillsCollapsible />);
      expect(isTarget(screen.getByRole("button", { name: "Show every fill" }).element())).toBe(
        true,
      );
    });
  });
});
