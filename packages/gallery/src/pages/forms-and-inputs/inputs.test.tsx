import "#styles.css";

import {
  CopyIcon,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  Label,
  SearchIcon,
  Textarea,
} from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { InputGroupSection, InputSection, TextareaSection } from "./inputs.tsx";
import { computedColour, inCompactDensity, lookOf, only, sizeOf } from "./test-helpers.ts";

describe("Input", () => {
  test("is a textbox named by its label, which takes typing", async () => {
    const screen = await render(
      <>
        <Label htmlFor="cusip">CUSIP</Label>
        <Input id="cusip" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "CUSIP" });
    await input.fill("912828XG0");
    await expect.element(input).toHaveValue("912828XG0");
  });

  test("disabled, it is a disabled textbox", async () => {
    const screen = await render(<InputSection />);
    await expect.element(screen.getByRole("textbox", { name: "Desk" })).toBeDisabled();
  });

  test("invalid, its outline takes the destructive colour and its error says why", async () => {
    const screen = await render(<InputSection />);
    const input = screen.getByRole("textbox", { name: "ISIN" });
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(input)
      .toHaveAccessibleDescription("An ISIN is twelve letters and digits.");
    expect(getComputedStyle(input.element()).borderTopColor).toBe(
      computedColour("var(--destructive)"),
    );
    const valid = screen.getByRole("textbox", { name: "Book" }).element();
    expect(getComputedStyle(valid).borderTopColor).not.toBe(computedColour("var(--destructive)"));
  });

  test("is 32 px tall, and 24 px in the compact density", async () => {
    const screen = await render(<Input aria-label="Price" />);
    expect(sizeOf(screen.getByRole("textbox", { name: "Price" }).element())[1]).toBe(32);
    await inCompactDensity(async () => {
      const compact = await render(<Input aria-label="Yield" />);
      expect(sizeOf(compact.getByRole("textbox", { name: "Yield" }).element())[1]).toBe(24);
    });
  });
});

describe("Textarea", () => {
  test("is a multi-line textbox named by its label", async () => {
    const screen = await render(<TextareaSection />);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    await notes.fill("Call before\nthe close");
    await expect.element(notes).toHaveValue("Call before\nthe close");
    expect(notes.element().tagName).toBe("TEXTAREA");
  });

  test("disabled and invalid, it says so", async () => {
    const screen = await render(<TextareaSection />);
    await expect.element(screen.getByRole("textbox", { name: "Approval note" })).toBeDisabled();
    const reason = screen.getByRole("textbox", { name: "Reason for the amendment" });
    await expect.element(reason).toHaveAttribute("aria-invalid", "true");
    await expect.element(reason).toHaveAccessibleDescription("Say why the trade is amended.");
  });
});

describe("InputGroup", () => {
  test("is a group around a named input, and a click on an addon focuses the input", async () => {
    const screen = await render(
      <InputGroup>
        <InputGroupInput aria-label="Search bonds" />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>,
    );
    const input = screen.getByRole("textbox", { name: "Search bonds" });
    await expect.element(input).not.toHaveFocus();
    await userEvent.click(only(screen.container, '[data-slot="input-group-addon"]'));
    await expect.element(input).toHaveFocus();
  });

  test("the group draws the outline and the input draws none", async () => {
    const screen = await render(<InputGroupSection />);
    const input = screen.getByRole("textbox", { name: "Search bonds" }).element();
    expect(getComputedStyle(input).borderTopWidth).toBe("0px");
    const group = input.closest('[data-slot="input-group"]');
    expect(group === null ? "" : getComputedStyle(group).borderTopWidth).toBe("1px");
  });

  test("its addons sit where `align` puts them", async () => {
    const screen = await render(
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Notional" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>USD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>,
    );
    const input = screen
      .getByRole("textbox", { name: "Notional" })
      .element()
      .getBoundingClientRect();
    const dollar = screen.getByText("$").element().getBoundingClientRect();
    const currency = screen.getByText("USD").element().getBoundingClientRect();
    expect(dollar.right).toBeLessThanOrEqual(input.left);
    expect(currency.left).toBeGreaterThanOrEqual(input.right);
  });

  test("a block-end addon sits below a textarea, on a line of its own", async () => {
    const screen = await render(<InputGroupSection />);
    const textarea = screen.getByRole("textbox", { name: "Message to the desk" }).element();
    const send = screen.getByRole("button", { name: "Send" }).element();
    expect(send.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      textarea.getBoundingClientRect().bottom,
    );
  });

  test("its buttons are named buttons whose variants differ", async () => {
    const screen = await render(
      <>
        <InputGroupButton>Ghost</InputGroupButton>
        <InputGroupButton variant="default">Default</InputGroupButton>
        <InputGroupButton variant="secondary">Secondary</InputGroupButton>
        <InputGroupButton variant="outline">Outline</InputGroupButton>
      </>,
    );
    const names = ["Ghost", "Default", "Secondary", "Outline"];
    const looks = names.map((name) => lookOf(screen.getByRole("button", { name }).element()));
    expect(new Set(looks).size).toBe(names.length);
    await expect
      .element(screen.getByRole("button", { name: "Ghost" }))
      .toHaveAttribute("type", "button");
  });

  test.each([
    ["xs", 24],
    ["sm", 32],
    ["icon-xs", 24],
    ["icon-sm", 32],
  ] as const)("the %s button size is %i px tall", async (size, height) => {
    const screen = await render(
      <InputGroupButton size={size} aria-label="Copy">
        <CopyIcon />
      </InputGroupButton>,
    );
    expect(sizeOf(screen.getByRole("button", { name: "Copy" }).element())[1]).toBe(height);
  });

  test.each(["xs", "sm", "icon-xs", "icon-sm"] as const)(
    "the %s button size stays at least 24 px across in the compact density",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(
          <InputGroupButton size={size} aria-label="Copy">
            <CopyIcon />
          </InputGroupButton>,
        );
        const [width, height] = sizeOf(screen.getByRole("button", { name: "Copy" }).element());
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      });
    },
  );

  test("invalid, the group's outline takes the destructive colour and its error says why", async () => {
    const screen = await render(<InputGroupSection />);
    const price = screen.getByRole("textbox", { name: "Price" });
    await expect.element(price).toHaveAccessibleDescription("A price is above zero.");
    const group = only(screen.container, '[data-slot="input-group"]:has([aria-invalid="true"])');
    expect(getComputedStyle(group).borderTopColor).toBe(computedColour("var(--destructive)"));
  });

  test("disabled, its input is disabled", async () => {
    const screen = await render(<InputGroupSection />);
    await expect
      .element(screen.getByRole("textbox", { name: "Search closed books" }))
      .toBeDisabled();
  });

  test("a Textarea inside it grows with its text", async () => {
    const screen = await render(<Textarea aria-label="Notes" />);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    const [, before] = sizeOf(notes.element());
    await notes.fill("one\ntwo\nthree\nfour\nfive\nsix");
    expect(sizeOf(notes.element())[1]).toBeGreaterThan(before);
  });
});
