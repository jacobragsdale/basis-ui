import "#styles.css";

import { MultiSelect, NumberField, Toolbar, ToolbarButton } from "@basis/ui";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

const books = [
  { label: "Rates", value: "rates" },
  { label: "Agency", value: "agency" },
  { label: "Credit", value: "credit" },
] as const;

type Book = (typeof books)[number]["value"];

describe("MultiSelect", () => {
  test("counts what is chosen, names one choice, and says All when every one is", async () => {
    const screen = await render(
      <>
        <MultiSelect
          aria-label="Some"
          options={books}
          noun="books"
          defaultValue={["rates", "credit"]}
        />
        <MultiSelect aria-label="One" options={books} noun="books" defaultValue={["agency"]} />
        <MultiSelect
          aria-label="All"
          options={books}
          noun="books"
          defaultValue={["rates", "agency", "credit"]}
        />
        <MultiSelect aria-label="None" options={books} noun="books" />
      </>,
    );
    await expect
      .element(screen.getByRole("combobox", { name: "Some" }))
      .toHaveTextContent("2 of 3 books");
    await expect.element(screen.getByRole("combobox", { name: "One" })).toHaveTextContent("Agency");
    await expect
      .element(screen.getByRole("combobox", { name: "All" }))
      .toHaveTextContent("All books");
    await expect.element(screen.getByRole("combobox", { name: "None" })).toHaveTextContent("None");
  });

  test("judges All by which options are chosen, not how many values it holds", async () => {
    // A saved view holds three books, munis among them, which the options no longer offer.
    const options: readonly { readonly label: string; readonly value: string }[] = books;
    const screen = await render(
      <MultiSelect
        aria-label="Saved"
        options={options}
        noun="books"
        defaultValue={["rates", "munis", "credit"]}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Saved" });
    await expect.element(trigger).toHaveTextContent("2 of 3 books");
    await userEvent.click(trigger);
    await expect
      .element(page.getByRole("option", { name: "Select all" }))
      .toHaveAttribute("aria-selected", "false");
  });

  test("chooses options one at a time, keeping the list open, in the options' order", async () => {
    const onValueChange = vi.fn<(value: readonly Book[]) => void>();
    const screen = await render(
      <MultiSelect aria-label="Books" options={books} noun="books" onValueChange={onValueChange} />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Books" }));
    await userEvent.click(page.getByRole("option", { name: "Credit" }));
    await userEvent.click(page.getByRole("option", { name: "Rates" }));
    await expect.element(page.getByRole("listbox")).toBeVisible();
    expect(onValueChange.mock.lastCall?.[0]).toStrictEqual(["rates", "credit"]);
  });

  test("Select all chooses every option, and again clears them", async () => {
    const onValueChange = vi.fn<(value: readonly Book[]) => void>();
    const screen = await render(
      <MultiSelect
        aria-label="Books"
        options={books}
        noun="books"
        defaultValue={["agency"]}
        onValueChange={onValueChange}
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Books" }));
    await userEvent.click(page.getByRole("option", { name: "Select all" }));
    expect(onValueChange.mock.lastCall?.[0]).toStrictEqual(["rates", "agency", "credit"]);
    await expect
      .element(page.getByRole("option", { name: "Select all" }))
      .toHaveAttribute("aria-selected", "true");
    await userEvent.click(page.getByRole("option", { name: "Select all" }));
    expect(onValueChange.mock.lastCall?.[0]).toStrictEqual([]);
  });
});

describe("NumberField", () => {
  test("steps by its buttons and the arrow keys, within its bounds", async () => {
    const onValueChange = vi.fn<(value: number | null) => void>();
    const screen = await render(
      <NumberField
        aria-label="Days"
        defaultValue={2}
        min={1}
        max={3}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Days" });
    await userEvent.click(screen.getByRole("button", { name: "Increase" }));
    await expect.element(input).toHaveValue("3");
    await expect.element(screen.getByRole("button", { name: "Increase" })).toBeDisabled();
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await expect.element(input).toHaveValue("1");
    expect(onValueChange.mock.lastCall?.[0]).toBe(1);
  });
});

describe("Toolbar", () => {
  test("is one stop for Tab, and the arrow keys move between its buttons", async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Toolbar aria-label="Positions">
          <ToolbarButton>Refresh</ToolbarButton>
          <ToolbarButton>Export</ToolbarButton>
        </Toolbar>
      </>,
    );
    await expect.element(screen.getByRole("toolbar", { name: "Positions" })).toBeVisible();
    screen.getByRole("button", { name: "Before" }).element().focus();
    await userEvent.tab();
    await expect.poll(() => document.activeElement?.textContent).toBe("Refresh");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => document.activeElement?.textContent).toBe("Export");
  });
});
