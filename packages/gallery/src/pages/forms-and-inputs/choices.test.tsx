import "#styles.css";

import { Checkbox, Field, FieldLabel, Label, RadioGroup, RadioGroupItem, Switch } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { CheckboxSection, RadioGroupSection, SwitchSection } from "./choices.tsx";
import { computedColour, inCompactDensity, only, sizeOf } from "./test-helpers.ts";

describe("Checkbox", () => {
  test("is a checkbox named by its label, which Space ticks and unticks", async () => {
    const screen = await render(
      <Field orientation="horizontal">
        <Checkbox id="net" />
        <FieldLabel htmlFor="net">Net by counterparty</FieldLabel>
      </Field>,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Net by counterparty" });
    await expect.element(checkbox).not.toBeChecked();
    checkbox.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(checkbox).toBeChecked();
    await userEvent.keyboard(" ");
    await expect.element(checkbox).not.toBeChecked();
  });

  test("a click on its label ticks it", async () => {
    const screen = await render(
      <>
        <Checkbox id="accrued" />
        <Label htmlFor="accrued">Include accrued interest</Label>
      </>,
    );
    await screen.getByText("Include accrued interest").click();
    await expect
      .element(screen.getByRole("checkbox", { name: "Include accrued interest" }))
      .toBeChecked();
  });

  test("checked, its box fills with the primary colour", async () => {
    const screen = await render(<Checkbox aria-label="Ticked" defaultChecked />);
    const box = only(screen.container, '[data-slot="checkbox-box"]');
    expect(getComputedStyle(box).backgroundColor).toBe(computedColour("var(--primary)"));
  });

  test("disabled, it ignores Space and a click", async () => {
    const screen = await render(<Checkbox aria-label="Short sales" disabled />);
    const checkbox = screen.getByRole("checkbox", { name: "Short sales" });
    await expect.element(checkbox).toHaveAttribute("aria-disabled", "true");
    await checkbox.click({ force: true });
    await expect.element(checkbox).not.toBeChecked();
  });

  test("invalid, its box takes the destructive colour and its error says why", async () => {
    const screen = await render(<CheckboxSection />);
    const checkbox = screen.getByRole("checkbox", { name: "I have read the term sheet" });
    await expect.element(checkbox).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(checkbox)
      .toHaveAccessibleDescription("Confirm the term sheet to continue.");
    const box = only(checkbox.element(), '[data-slot="checkbox-box"]');
    expect(getComputedStyle(box).borderTopColor).toBe(computedColour("var(--destructive)"));
  });

  test("is a 24 px target around a 16 px box in the comfortable density", async () => {
    const screen = await render(<Checkbox aria-label="Target" />);
    const checkbox = screen.getByRole("checkbox", { name: "Target" }).element();
    expect(sizeOf(checkbox)).toStrictEqual([24, 24]);
    expect(sizeOf(only(checkbox, '[data-slot="checkbox-box"]'))).toStrictEqual([16, 16]);
  });

  test("stays a 24 px target in the compact density, WCAG 2.2's minimum", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<Checkbox aria-label="Target" />);
      const checkbox = screen.getByRole("checkbox", { name: "Target" }).element();
      expect(sizeOf(checkbox)).toStrictEqual([24, 24]);
      expect(sizeOf(only(checkbox, '[data-slot="checkbox-box"]'))).toStrictEqual([12, 12]);
    });
  });
});

describe("RadioGroup", () => {
  test("is a radio group of radios named by their labels, one of them chosen", async () => {
    const screen = await render(<RadioGroupSection />);
    await expect.element(screen.getByRole("radiogroup", { name: "Settlement" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "T+1" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Same day" })).not.toBeChecked();
  });

  test("the arrow keys move the choice and the focus", async () => {
    const screen = await render(<RadioGroupSection />);
    const sameDay = screen.getByRole("radio", { name: "Same day" });
    const nextDay = screen.getByRole("radio", { name: "T+1" });
    nextDay.element().focus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(sameDay).toBeChecked();
    await expect.element(sameDay).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(nextDay).toBeChecked();
  });

  test("the arrow keys skip a disabled radio", async () => {
    const screen = await render(<RadioGroupSection />);
    const nextDay = screen.getByRole("radio", { name: "T+1" });
    await expect
      .element(screen.getByRole("radio", { name: "T+2" }))
      .toHaveAttribute("aria-disabled", "true");
    nextDay.element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("radio", { name: "Same day" })).toBeChecked();
  });

  test("invalid, its circles take the destructive colour and the group's error says why", async () => {
    const screen = await render(<RadioGroupSection />);
    await expect
      .element(screen.getByRole("radiogroup", { name: "Side" }))
      .toHaveAccessibleDescription("Choose a side.");
    const buy = screen.getByRole("radio", { name: "Buy" });
    await expect.element(buy).toHaveAttribute("aria-invalid", "true");
    const circle = only(buy.element(), '[data-slot="radio-group-circle"]');
    expect(getComputedStyle(circle).borderTopColor).toBe(computedColour("var(--destructive)"));
  });

  test("each radio stays a 24 px target in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(
        <RadioGroup aria-label="Side" defaultValue="buy">
          <RadioGroupItem value="buy" aria-label="Buy" />
          <RadioGroupItem value="sell" aria-label="Sell" />
        </RadioGroup>,
      );
      for (const name of ["Buy", "Sell"]) {
        expect(sizeOf(screen.getByRole("radio", { name }).element())).toStrictEqual([24, 24]);
      }
    });
  });
});

describe("Switch", () => {
  test("is a switch named by its label, which Space turns on and off", async () => {
    const screen = await render(<SwitchSection />);
    const toggle = screen.getByRole("switch", { name: "Streaming prices" });
    await expect.element(toggle).not.toBeChecked();
    toggle.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(toggle).toBeChecked();
    await expect.element(screen.getByRole("switch", { name: "Show yields" })).toBeChecked();
  });

  test("disabled, it stays as it is", async () => {
    const screen = await render(<Switch aria-label="Auto-hedge" defaultChecked disabled />);
    const toggle = screen.getByRole("switch", { name: "Auto-hedge" });
    await toggle.click({ force: true });
    await expect.element(toggle).toBeChecked();
  });

  test("invalid, it is marked so and its error says why", async () => {
    const screen = await render(<SwitchSection />);
    const toggle = screen.getByRole("switch", { name: "Accept the risk limits" });
    await expect.element(toggle).toHaveAttribute("aria-invalid", "true");
    await expect.element(toggle).toHaveAccessibleDescription("Accept the limits to trade.");
  });

  test("its sizes differ: the small track is narrower and shorter", async () => {
    const screen = await render(
      <>
        <Switch aria-label="Default" />
        <Switch aria-label="Small" size="sm" />
      </>,
    );
    const trackOf = (name: string): Element =>
      only(screen.getByRole("switch", { name }).element(), '[data-slot="switch-track"]');
    expect(sizeOf(trackOf("Default"))).toStrictEqual([32, 18]);
    expect(sizeOf(trackOf("Small"))).toStrictEqual([24, 14]);
  });

  test("on, its thumb sits at the track's end", async () => {
    const screen = await render(<Switch aria-label="On" defaultChecked />);
    const track = only(screen.container, '[data-slot="switch-track"]').getBoundingClientRect();
    const thumb = only(screen.container, '[data-slot="switch-thumb"]').getBoundingClientRect();
    expect(track.right - thumb.right).toBe(1);
    expect(
      getComputedStyle(only(screen.container, '[data-slot="switch-track"]')).backgroundColor,
    ).toBe(computedColour("var(--primary)"));
  });

  test.each(["default", "sm"] as const)(
    "the %s size stays at least 24 px across in the compact density",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(<Switch aria-label="Target" size={size} />);
        const [width, height] = sizeOf(screen.getByRole("switch", { name: "Target" }).element());
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      });
    },
  );
});
