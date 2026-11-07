import "#styles.css";

import {
  Label,
  NativeSelect,
  NativeSelectOption,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { NativeSelectSection, SelectSection } from "./selects.tsx";
import { computedColour, inCompactDensity, sizeOf } from "./test-helpers.ts";

const tenors = [
  { label: "2Y", value: "2y" },
  { label: "5Y", value: "5y" },
  { label: "10Y", value: "10y" },
];

/** A select of tenors, named "Tenor", at the given size. */
function TenorSelect({ size }: { readonly size?: "sm" | "default" }): ReactElement {
  return (
    <>
      <Label htmlFor="tenor">Tenor</Label>
      <Select items={tenors} defaultValue="5y">
        <SelectTrigger id="tenor" size={size}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tenors.map((tenor) => (
            <SelectItem key={tenor.value} value={tenor.value}>
              {tenor.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

describe("Select", () => {
  test("is a combobox named by its label, showing the chosen item", async () => {
    const screen = await render(<TenorSelect />);
    await expect.element(screen.getByRole("combobox", { name: "Tenor" })).toHaveTextContent("5Y");
  });

  test("a click opens its list of options, and a click on one chooses it", async () => {
    const screen = await render(<TenorSelect />);
    const trigger = screen.getByRole("combobox", { name: "Tenor" });
    await trigger.click();
    await expect.element(screen.getByRole("listbox")).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByRole("option", { name: "5Y" }))
      .toHaveAttribute("aria-selected", "true");
    await screen.getByRole("option", { name: "10Y" }).click();
    await expect.element(trigger).toHaveTextContent("10Y");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("the arrow keys open it and move through its options, and Enter chooses one", async () => {
    const screen = await render(<TenorSelect />);
    const trigger = screen.getByRole("combobox", { name: "Tenor" });
    trigger.element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("listbox")).toBeVisible();
    await expect.element(screen.getByRole("option", { name: "5Y" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("option", { name: "10Y" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(trigger).toHaveTextContent("10Y");
  });

  test("its sizes differ in height: 32 px and 28 px", async () => {
    const screen = await render(<SelectSection />);
    expect(sizeOf(screen.getByRole("combobox", { name: "Tenor" }).first().element())[1]).toBe(32);
    const small = screen.container.querySelector('[data-slot="select-trigger"][data-size="sm"]');
    expect(small === null ? 0 : sizeOf(small)[1]).toBe(28);
  });

  test.each(["default", "sm"] as const)(
    "the %s size stays at least 24 px across in the compact density",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(<TenorSelect size={size} />);
        const [width, height] = sizeOf(screen.getByRole("combobox", { name: "Tenor" }).element());
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      });
    },
  );

  test("disabled, it does not open", async () => {
    const screen = await render(<SelectSection />);
    const disabled = screen.getByRole("combobox", { name: "Tenor" }).nth(2);
    await expect.element(disabled).toBeDisabled();
  });

  test("invalid, its outline takes the destructive colour and its error says why", async () => {
    const screen = await render(<SelectSection />);
    const invalid = screen.container.querySelector<HTMLElement>("#select-invalid");
    expect(invalid?.getAttribute("aria-invalid")).toBe("true");
    expect(invalid === null ? "" : getComputedStyle(invalid).borderTopColor).toBe(
      computedColour("var(--destructive)"),
    );
    await expect.element(screen.getByText("Choose a tenor.")).toBeVisible();
  });

  test("the chevron is muted and the chosen value is not", async () => {
    const screen = await render(<TenorSelect />);
    const trigger = screen.getByRole("combobox", { name: "Tenor" }).element();
    const chevron = trigger.querySelector(":scope > svg");
    expect(chevron === null ? "" : getComputedStyle(chevron).color).toBe(
      computedColour("var(--muted-foreground)"),
    );
    expect(getComputedStyle(trigger).color).toBe(computedColour("var(--foreground)"));
  });
});

/** A native select at each size, named after its size. */
function NativeSelectPair(): ReactElement {
  return (
    <>
      <NativeSelect aria-label="Default">
        <NativeSelectOption value="usd">USD</NativeSelectOption>
      </NativeSelect>
      <NativeSelect aria-label="Small" size="sm">
        <NativeSelectOption value="usd">USD</NativeSelectOption>
      </NativeSelect>
    </>
  );
}

describe("NativeSelect", () => {
  test("is a native combobox named by its label, which changes its value", async () => {
    const screen = await render(<NativeSelectSection />);
    const select = screen.getByRole("combobox", { name: "Currency" }).first();
    await expect.element(select).toHaveValue("usd");
    await select.selectOptions("eur");
    await expect.element(select).toHaveValue("eur");
  });

  test("its sizes differ in height: 32 px and 28 px", async () => {
    const screen = await render(<NativeSelectPair />);
    expect(sizeOf(screen.getByRole("combobox", { name: "Default" }).element())[1]).toBe(32);
    expect(sizeOf(screen.getByRole("combobox", { name: "Small" }).element())[1]).toBe(28);
  });

  test("both sizes stay at least 24 px across in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<NativeSelectPair />);
      for (const name of ["Default", "Small"]) {
        const [width, height] = sizeOf(screen.getByRole("combobox", { name }).element());
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      }
    });
  });

  test("disabled and invalid, it says so", async () => {
    const screen = await render(<NativeSelectSection />);
    await expect.element(screen.getByRole("combobox", { name: "Currency" }).nth(1)).toBeDisabled();
    const invalid = screen.getByRole("combobox", { name: "Currency" }).nth(2);
    await expect.element(invalid).toHaveAttribute("aria-invalid", "true");
    await expect.element(invalid).toHaveAccessibleDescription("Choose a currency.");
  });
});
