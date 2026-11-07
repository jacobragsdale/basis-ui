import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { focusIsIn, focusReturnsTo } from "./helpers.ts";
import { HoverCardExample, PopoverExample, TooltipExample } from "./popups.tsx";

describe("Popover", () => {
  test("its trigger says it opens a dialog, and opens one named by its title, and focus moves in", async () => {
    const screen = await render(<PopoverExample />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const popover = page.getByRole("dialog", { name: "Filters" });
    await expect.element(popover).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(popover)
      .toHaveAccessibleDescription("Narrow the blotter to one desk and one day.");
    await focusIsIn(popover);
  });

  test("Enter on the trigger opens it, and Escape closes it and returns focus to the trigger", async () => {
    const screen = await render(<PopoverExample />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    const popover = page.getByRole("dialog", { name: "Filters" });
    await focusIsIn(popover);
    await userEvent.keyboard("{Escape}");
    await expect.element(popover).not.toBeInTheDocument();
    await focusReturnsTo(trigger);
  });

  test("a click outside closes it", async () => {
    const screen = await render(<PopoverExample />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = page.getByRole("dialog", { name: "Filters" });
    await expect.element(popover).toBeVisible();
    await userEvent.click(document.body, { position: { x: 2, y: 2 } });
    await expect.element(popover).not.toBeInTheDocument();
  });

  test("a second click on the trigger closes it", async () => {
    const screen = await render(<PopoverExample />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    const popover = page.getByRole("dialog", { name: "Filters" });
    await userEvent.click(trigger);
    await expect.element(popover).toBeVisible();
    await userEvent.click(trigger);
    await expect.element(popover).not.toBeInTheDocument();
  });
});

describe("Hover Card", () => {
  test("its trigger is a link named by its text", async () => {
    const screen = await render(<HoverCardExample />);
    await expect
      .element(screen.getByRole("link", { name: "UST 4.25% 2034" }))
      .toHaveAttribute("href", "#hover-card");
  });

  test("resting the pointer on the link shows the card, and moving away hides it", async () => {
    const screen = await render(<HoverCardExample />);
    const link = screen.getByRole("link", { name: "UST 4.25% 2034" });
    const card = page.getByText("United States Treasury note");
    await userEvent.hover(link);
    await expect.element(card).toBeVisible();
    await userEvent.unhover(link);
    await expect.element(card).not.toBeInTheDocument();
  });

  test("focus on the link shows the card and stays on the link, and Escape hides it", async () => {
    const screen = await render(<HoverCardExample />);
    const link = screen.getByRole("link", { name: "UST 4.25% 2034" });
    const card = page.getByText("United States Treasury note");
    await userEvent.tab();
    await expect.element(link).toHaveFocus();
    await expect.element(card).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(card).not.toBeInTheDocument();
    await expect.element(link).toHaveFocus();
  });
});

describe("Tooltip", () => {
  test.each(["Refresh", "Export", "Settings"])(
    "the %s button is named by its aria-label, and resting the pointer on it shows its tooltip",
    async (name) => {
      const screen = await render(<TooltipExample />);
      const button = screen.getByRole("button", { name });
      await expect.element(button).toBeVisible();
      await userEvent.hover(button);
      const tooltip = page.getByText(name, { exact: true });
      await expect.element(tooltip).toBeVisible();
      expect(tooltip.element().closest('[data-slot="tooltip-content"]')).not.toBeNull();
      await userEvent.unhover(button);
      await expect.element(tooltip).not.toBeInTheDocument();
    },
  );

  test("focus shows the tooltip and stays on the button, and Escape hides it", async () => {
    const screen = await render(<TooltipExample />);
    const button = screen.getByRole("button", { name: "Refresh" });
    await userEvent.tab();
    await expect.element(button).toHaveFocus();
    const tooltip = page.getByText("Refresh", { exact: true });
    await expect.element(tooltip).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect.element(button).toHaveFocus();
  });

  test("Tab moves the tooltip on to the next button at once", async () => {
    const screen = await render(<TooltipExample />);
    await userEvent.tab();
    await expect.element(page.getByText("Refresh", { exact: true })).toBeVisible();
    await userEvent.tab();
    await expect.element(screen.getByRole("button", { name: "Export" })).toHaveFocus();
    await expect.element(page.getByText("Export", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Refresh", { exact: true })).not.toBeInTheDocument();
  });
});
